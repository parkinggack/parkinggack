package com.parkinggack.app.session

import com.parkinggack.app.domain.FloorEstimator
import com.parkinggack.app.domain.ManeuverAnalyzer
import com.parkinggack.app.domain.ParkingEntryDetector
import com.parkinggack.app.domain.TrajectoryIntegrator
import com.parkinggack.app.domain.TrajectorySimplifier
import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.hypot

/** 차 상태 (C-04 배너 / 기록 중 / C-05 진입 판단) */
sealed interface DriveState {
    /** 정차(P) 또는 아직 신호 없음 */
    data object Idle : DriveState
    /** 주행 중, 기록 안 함 */
    data object Driving : DriveState
    /** 주차장 진입 감지 후 기록 중 (C-04b) */
    data class Recording(val reverseCount: Int, val elapsedSec: Int) : DriveState
    /** 기록 중에 P → 결과 (C-05) */
    data class Parked(val result: ParkingResult) : DriveState
}

data class ParkingResult(
    val lot: ParkingLot?,
    val summary: ManeuverSummary,
    val estimate: FloorEstimate,
    /** 전체 궤적 (저장용, 다운샘플) */
    val trajectory: List<Pose>,
    /** C-05 썸네일·C-12용: 마지막 주차 동작 부분만 */
    val displayTrajectory: List<Pose>,
    val endedAtMs: Long,
    /** P 위치가 정해 둔 주차장([ParkingSession.targetLot])에서 멀어 버린 그 주차장 (로그·테스트용) */
    val droppedFarTarget: ParkingLot? = null,
)

/**
 * 주차 세션 상태 머신. 신호 샘플을 순서대로 넣으면 DriveState가 바뀐다. android 의존 없음 → 단위 테스트 가능.
 *
 * - 진입 감지 전에도 최근 [preBufferMs] 샘플을 들고 있다가, 진입이 확정되면 "마지막 고속 구간 이후"부터 기록에 포함
 *   (회전 램프를 내려가는 동안 진입이 확정되므로 램프 회전·층 추정이 빠지지 않게)
 * - 기록 중 다시 빠르게 달리면(주차장을 나감) 기록 취소
 */
class ParkingSession(
    private val integrator: TrajectoryIntegrator,
    private val analyzer: ManeuverAnalyzer,
    private val floorEstimator: FloorEstimator,
    private val simplifier: TrajectorySimplifier,
    private val entryDetector: ParkingEntryDetector,
    var vehicleSpec: VehicleSpec = VehicleSpec(),
    private val preBufferMs: Long = 120_000,
    private val lowSpeedMps: Float = 15f / 3.6f,
    private val leaveSpeedMps: Float = 30f / 3.6f,
    private val leaveHoldMs: Long = 8_000,
    private val displayRadiusM: Double = 28.0,
    /**
     * P 순간 기록 대상 주차장([targetLot])까지 이보다 멀면 그 주차장이 아니다 → 주차장 없이 결과를 낸다
     * (부르는 쪽이 P 위치로 주차장을 다시 찾음). 큰 지하주차장도 대표 좌표에서 수백 m 안. docs/sim-findings.md 1-5
     */
    private val maxTargetDistanceM: Double = 500.0,
) {
    private val _state = MutableStateFlow<DriveState>(DriveState.Idle)
    val state: StateFlow<DriveState> = _state.asStateFlow()

    /** 기록이 끝났을 때 결과를 붙일 주차장 (경유지 > 목적지) */
    var targetLot: ParkingLot? = null

    private val buffer = ArrayDeque<VehicleSample>()
    private val recording = ArrayList<VehicleSample>()
    private var recordingStartMs = 0L
    private var liveReverseCount = 0
    private var lastGear = Gear.UNKNOWN
    private var fastSinceMs: Long? = null
    /** 기록 중 마지막으로 안 [targetLot]까지 거리 (모르면 null) */
    private var lastTargetDistanceM: Double? = null

    /**
     * @param distanceToTargetM 진입 감지(규칙 A)용 목적지까지 거리
     * @param targetDistanceM [targetLot]이 맞는지 볼 거리 — 믿을 수 있는 값만 (모르면 null = 확인 안 함)
     */
    fun onSample(s: VehicleSample, distanceToTargetM: Double? = null, targetDistanceM: Double? = distanceToTargetM) {
        if (targetDistanceM != null) lastTargetDistanceM = targetDistanceM
        when (val st = _state.value) {
            is DriveState.Recording -> record(s)
            is DriveState.Parked -> {
                // 결과 카드가 떠 있는 동안 다시 출발하면 카드는 그대로 두고(저장은 VM이 처리) 주행 상태로
                if (s.gear.isMoving && s.speedMps > lowSpeedMps) { acknowledgeParked(); _state.value = DriveState.Driving }
            }
            DriveState.Idle, DriveState.Driving -> {
                pushBuffer(s)
                if (entryDetector.onSample(s, distanceToTargetM)) startRecording(s)
                else _state.value = if (s.gear.isMoving) DriveState.Driving else if (s.gear == Gear.PARK) DriveState.Idle else st
            }
        }
        lastGear = s.gear
    }

    /** C-05 처리 끝(저장/닫기) → Idle */
    fun acknowledgeParked() {
        if (_state.value is DriveState.Parked) _state.value = DriveState.Idle
        entryDetector.reset()
    }

    fun reset() {
        buffer.clear(); recording.clear(); entryDetector.reset(); fastSinceMs = null
        _state.value = DriveState.Idle
    }

    private fun pushBuffer(s: VehicleSample) {
        buffer.addLast(s)
        while (buffer.isNotEmpty() && s.timestampMs - buffer.first().timestampMs > preBufferMs) buffer.removeFirst()
    }

    private fun startRecording(trigger: VehicleSample) {
        // 마지막 고속 샘플 이후부터 = 주차장 진입 시점. P로 서 있던 시간(시동 직후·다시 대기 전 대기)은
        // 주차 시간에 넣지 않도록 마지막 P 이후부터 (진입 감지기도 P에서 저속 구간을 새로 잰다)
        val list = buffer.toList()
        val lastBreak = list.indexOfLast { it.speedMps > lowSpeedMps || it.gear == Gear.PARK }
        recording.clear()
        recording.addAll(if (lastBreak >= 0) list.subList(lastBreak + 1, list.size) else list)
        if (recording.isEmpty()) recording.add(trigger)
        buffer.clear()
        recordingStartMs = recording.first().timestampMs
        lastTargetDistanceM = null
        liveReverseCount = countReverseEntries(recording)
        fastSinceMs = null
        publishRecording(trigger.timestampMs)
    }

    private fun record(s: VehicleSample) {
        recording.add(s)
        if (s.gear == Gear.REVERSE && lastGear != Gear.REVERSE) liveReverseCount++

        // 주차장을 나감 → 취소
        if (s.speedMps > leaveSpeedMps) {
            val since = fastSinceMs ?: s.timestampMs.also { fastSinceMs = it }
            if (s.timestampMs - since > leaveHoldMs) { recording.clear(); entryDetector.reset(); _state.value = DriveState.Driving; return }
        } else fastSinceMs = null

        if (s.gear == Gear.PARK && lastGear != Gear.PARK) finish(s.timestampMs) else publishRecording(s.timestampMs)
    }

    private fun publishRecording(now: Long) {
        _state.value = DriveState.Recording(liveReverseCount, ((now - recordingStartMs) / 1000).toInt())
    }

    private fun finish(now: Long) {
        val samples = recording.toList()
        recording.clear()
        val poses = integrator.integrate(samples, vehicleSpec)
        val summary = analyzer.analyze(samples, poses).copy(maxSpeedKmh = inLotMaxSpeedKmh(samples))
        // 목적지·경유지를 정해 두고 다른 곳에 대면 그 주차장으로 기록되어 남의 난이도에 섞였다 (2.7 km 떨어진 곳도) → P 위치로 확인
        val far = lastTargetDistanceM?.let { it > maxTargetDistanceM } == true
        val lot = targetLot.takeUnless { far }
        val estimate = floorEstimator.estimate(summary, lot?.floors ?: emptyList())
        val shown = if (summary.approximate) simplifier.simplify(poses, summary) else poses
        _state.value = DriveState.Parked(
            ParkingResult(
                lot = lot,
                summary = summary,
                estimate = estimate,
                trajectory = downsample(poses, 600),
                displayTrajectory = downsample(lastManeuver(shown), 400),
                endedAtMs = now,
                droppedFarTarget = if (far) targetLot else null,
            )
        )
    }

    /** 최종 위치 반경 안에 들어온 마지막 연속 구간 (램프·통로 진입 전 부분은 잘라 C-12를 크게 보이게) */
    private fun lastManeuver(poses: List<Pose>): List<Pose> {
        if (poses.isEmpty()) return poses
        val end = poses.last()
        var i = poses.lastIndex
        while (i > 0 && hypot(poses[i - 1].x - end.x, poses[i - 1].y - end.y) <= displayRadiusM) i--
        return poses.subList(i, poses.size)
    }

    /**
     * 주차장 안 최고 속도 (주차왕: 10km/h 넘으면 그 주차는 빠짐).
     * 기록은 진입 감속(15km/h 아래) 때부터 시작하므로, 처음 10km/h 이하로 내려온 뒤부터만 잰다 — 입구에서 속도를 줄이는
     * 구간이 '과속'으로 잡히지 않게. 0.5초(5샘플) 이동평균의 최댓값 → 센서 값 하나가 튀어도 빠지지 않게.
     */
    internal fun inLotMaxSpeedKmh(samples: List<VehicleSample>, window: Int = 5): Double? {
        val kmh = samples.map { it.speedMps * 3.6 }
        val start = kmh.indexOfFirst { it <= 10.0 }
        if (start < 0) return null
        val tail = kmh.subList(start, kmh.size)
        if (tail.isEmpty()) return null
        val w = window.coerceAtLeast(1).coerceAtMost(tail.size)
        var sum = tail.take(w).sum()
        var best = sum / w
        for (i in w until tail.size) { sum += tail[i] - tail[i - w]; best = maxOf(best, sum / w) }
        return Math.round(best * 10) / 10.0
    }

    private fun countReverseEntries(list: List<VehicleSample>): Int {
        var n = 0; var prev = Gear.UNKNOWN
        for (s in list) { if (s.gear == Gear.REVERSE && prev != Gear.REVERSE) n++; prev = s.gear }
        return n
    }

    private fun downsample(p: List<Pose>, max: Int): List<Pose> {
        if (p.size <= max) return p
        val step = p.size.toDouble() / max
        return (0 until max).map { p[(it * step).toInt()] } + p.last()
    }
}
