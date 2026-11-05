package com.parkinggack.app.domain.sim

import com.parkinggack.app.domain.Kinematics
import com.parkinggack.app.domain.PoseState
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.tan

/** 시연·테스트용 신호 시나리오 한 편 */
data class Scenario(
    val id: String,
    val title: String,
    val description: String,
    /** 10 Hz 차량 신호 (리플레이 모드에서 SignalSource 대신 흘려보냄) */
    val samples: List<VehicleSample>,
    /** samples와 같은 길이. 그 시각 목적지(주차장 입구)까지 직선거리(m). 진입 감지기에 같이 넣는다 */
    val distanceToTargetM: List<Double?>,
    /** 주차장 층 목록 (위→아래) — FloorEstimator 입력 */
    val lotFloors: List<String>,
    val entryFloor: String = "1F",
    val spec: VehicleSpec = VehicleSpec(),
    /** 이름 붙인 시각(ms). 예: approachEnd, rampStart, rampEnd, parked */
    val marks: Map<String, Long> = emptyMap(),
) {
    val durationMs: Long get() = if (samples.isEmpty()) 0 else samples.last().timestampMs - samples.first().timestampMs
}

/**
 * 시나리오를 구간 조합으로 만든다. 내부에 '실제' 차 상태(속도·핸들·기어·위치)를 두고 [hz]로 샘플을 찍는다.
 * 같은 자전거 모델을 쓰므로 잡음을 끄면 적분기가 지나간 길을 그대로 복원한다.
 *
 * - [straight] 거리만큼 직진 (속도는 가감속 한계 안에서 목표로 맞춰 감)
 * - [arc] heading을 angleDeg(반시계 +)만큼 바꾸는 반지름 R 원호. 핸들각은 역자전거 모델로 계산하고,
 *   D/R 어느 쪽이든 heading 기준이라 후진 원호도 같은 방식. 핸들을 감고 푸는 시간까지 넣어 끝 heading을 맞춘다
 * - [stop] 브레이크 밟고 정지 후 대기, [shift] 정지 상태에서 기어 변경, [hold] 그대로 대기
 * - 감속 폭이 [coastWindowMps]보다 크거나 정지할 땐 브레이크를 밟는다 (브레이크 횟수가 자연스럽게 나옴)
 */
class ScenarioBuilder(
    val spec: VehicleSpec = VehicleSpec(),
    val hz: Int = 10,
    seed: Long = 1L,
    val steeringNoiseDeg: Double = 0.8,
    val speedNoiseMps: Double = 0.02,
    startTimeMs: Long = 0L,
) {
    var accelMps2 = 1.0
    var brakeDecelMps2 = 1.6
    var coastDecelMps2 = 0.4
    var coastWindowMps = 0.6
    var steerRateDegPerSec = 300.0

    private val random = java.util.Random(seed)
    private val dtMs = 1000L / hz
    private val dt = dtMs / 1000.0
    private var t = startTimeMs
    private var v = 0.0
    private var steer = 0.0
    private var gear = Gear.PARK
    private var brake = false
    private val truth = PoseState()
    private var target: Pair<Double, Double>? = null
    private val samples = ArrayList<VehicleSample>()
    private val distances = ArrayList<Double?>()
    private val marks = LinkedHashMap<String, Long>()
    private var lastDTheta = 0.0
    private var lastDs = 0.0

    val timeMs: Long get() = t

    fun start(speedKmh: Double = 0.0, gear: Gear = if (speedKmh > 0) Gear.DRIVE else Gear.PARK) = apply {
        check(samples.isEmpty()) { "start()는 한 번만" }
        v = speedKmh * Kinematics.KMH_TO_MPS
        this.gear = gear
        brake = v == 0.0 && gear != Gear.PARK
        emit()
    }

    /** 목적지를 지금 위치에서 진행 방향 앞 [distanceM]에 둔다 (distanceToTargetM 계산용) */
    fun targetAhead(distanceM: Double) = apply {
        target = Pair(truth.x - distanceM * sin(truth.heading), truth.y + distanceM * cos(truth.heading))
        if (distances.isNotEmpty()) distances[distances.size - 1] = currentDistance()
    }

    fun mark(name: String) = apply { marks[name] = t }

    fun straight(distanceM: Double, speedKmh: Double) = apply {
        requireMoving(speedKmh)
        val vt = speedKmh * Kinematics.KMH_TO_MPS
        var s = 0.0
        guarded { if (s >= distanceM) false else { tick(vt, 0.0); s += lastDs; true } }
    }

    fun arc(angleDeg: Double, radiusM: Double, speedKmh: Double) = apply {
        requireMoving(speedKmh)
        require(radiusM > 0 && angleDeg != 0.0)
        val dir = if (gear == Gear.REVERSE) -1 else 1
        val turnSign = sign(angleDeg)
        val steerTarget = Kinematics.steeringForRadius(radiusM, spec) * turnSign * dir
        val goal = Math.toRadians(abs(angleDeg))
        val vt = speedKmh * Kinematics.KMH_TO_MPS
        var progress = 0.0
        var unwinding = false
        guarded {
            if (!unwinding) {
                val holdStep = v * tan(Kinematics.wheelAngleRad(abs(steer), spec)) / spec.wheelbaseM * dt
                if (progress + predictUnwind() >= goal - holdStep / 2) unwinding = true
            }
            tick(vt, if (unwinding) 0.0 else steerTarget)
            progress += lastDTheta * turnSign
            !(unwinding && steer == 0.0)
        }
    }

    /** 브레이크로 정지(핸들은 그대로) 후 [holdSec] 대기 */
    fun stop(holdSec: Double = 1.0) = apply {
        guarded { if (v <= 0.0) false else { tick(0.0, steer); true } }
        hold(holdSec)
    }

    fun hold(sec: Double, brakeOn: Boolean = gear != Gear.PARK) = apply {
        repeat((sec * hz).toInt()) { tick(0.0, steer, brakeOn) }
    }

    /** 정지 상태에서 핸들만 돌리기 */
    fun steerInPlace(deg: Double) = apply {
        if (v > 0) stop(0.0)
        guarded { if (steer == deg) false else { tick(0.0, deg); true } }
    }

    fun shift(newGear: Gear) = apply {
        if (v > 0) stop(0.0)
        hold(0.4, brakeOn = true)
        gear = newGear
        hold(0.4, brakeOn = newGear != Gear.PARK)
    }

    fun build(
        id: String,
        title: String,
        description: String,
        lotFloors: List<String>,
        entryFloor: String = "1F",
    ) = Scenario(id, title, description, samples.toList(), distances.toList(), lotFloors, entryFloor, spec, marks.toMap())

    // ---- 내부 ----

    private fun requireMoving(speedKmh: Double) {
        require(speedKmh > 0) { "speed must be > 0" }
        check(gear.isMoving) { "D 또는 R에서만 움직일 수 있음 (현재 $gear)" }
    }

    private inline fun guarded(step: () -> Boolean) {
        var n = 0
        while (step()) check(++n < MAX_TICKS_PER_SEGMENT) { "segment did not finish" }
    }

    /** 지금 핸들을 풀기 시작하면 풀리는 동안 더 돌 heading(rad) — tick과 같은 이산 계산 */
    private fun predictUnwind(): Double {
        var s = abs(steer)
        var sum = 0.0
        val step = steerRateDegPerSec * dt
        while (s > 0.0) {
            val s1 = maxOf(0.0, s - step)
            sum += v * tan(Kinematics.wheelAngleRad((s + s1) / 2.0, spec)) / spec.wheelbaseM * dt
            s = s1
        }
        return sum
    }

    private fun tick(targetV: Double, targetSteer: Double, brakeWhenStopped: Boolean = gear != Gear.PARK) {
        val v0 = v
        val s0 = steer
        when {
            targetV > v0 + EPS -> { v = minOf(targetV, v0 + accelMps2 * dt); brake = false }
            targetV < v0 - EPS -> {
                val useBrake = targetV <= 0.0 || v0 - targetV > coastWindowMps
                v = maxOf(targetV, v0 - (if (useBrake) brakeDecelMps2 else coastDecelMps2) * dt)
                if (v < EPS) v = 0.0
                brake = useBrake
            }
            else -> { v = targetV; brake = if (v == 0.0) brakeWhenStopped else false }
        }
        val maxStep = steerRateDegPerSec * dt
        steer = if (abs(targetSteer - s0) <= maxStep) targetSteer else s0 + sign(targetSteer - s0) * maxStep

        val dir = if (gear == Gear.REVERSE) -1 else 1
        val vAvg = (v0 + v) / 2.0 * dir
        val sAvg = (s0 + steer) / 2.0
        lastDTheta = truth.step(vAvg, Kinematics.yawRate(vAvg, sAvg, spec), dt)
        lastDs = abs(vAvg) * dt
        t += dtMs
        emit()
    }

    private fun currentDistance(): Double? = target?.let { (tx, ty) -> hypot(truth.x - tx, truth.y - ty) }

    private fun emit() {
        val speedOut = if (v > 0.0) maxOf(0.0, v + random.nextGaussian() * speedNoiseMps) else 0.0
        val steerOut = steer + random.nextGaussian() * steeringNoiseDeg
        samples += VehicleSample(t, speedOut.toFloat(), steerOut.toFloat(), gear, brake)
        distances += currentDistance()
    }

    private companion object {
        const val EPS = 1e-9
        const val MAX_TICKS_PER_SEGMENT = 100_000
    }
}

/**
 * 시연 영상용 신호 시나리오. 에뮬레이터에서 차속을 못 바꿀 수도 있어서 리플레이 모드로 흘려보낸다.
 * 모두 10 Hz, 결정적(seed 고정) — 같은 호출은 항상 같은 샘플.
 */
object ScenarioGenerator {

    const val MAIN_DEMO = "pangyo-department-store"
    const val PARALLEL = "parallel-parking"
    const val ANGLED = "angled-parking"
    const val FLAT_LOT = "flat-lot-simple"
    /** 시뮬레이션 루틴 전용(시연 목록 [all]에는 없음): 층을 확실히 모르는 경우 */
    const val SPLIT_LEVEL = "split-level"

    /**
     * 메인 시연: ○○백화점 판교점 지하주차장.
     * 25 km/h 접근 → 8 km/h로 감속 → 나선 램프 2바퀴(1F→B1→B2, B1에서 짧은 직선) → B2 통로 →
     * 자리를 지나쳐 멈춤 → ① 오른쪽으로 감고 후진 → ② 앞으로 조금(왼쪽) → ③ 다시 후진해서 칸으로 → P.
     * 기대: 후진 2회, 전환점 ①②③, 핸들 3번 꺾음, 직각주차, 램프 2바퀴 → B2(HIGH), 약 1분 40초.
     */
    fun pangyoDepartmentStore(spec: VehicleSpec = VehicleSpec(), seed: Long = 1L): Scenario =
        ScenarioBuilder(spec, seed = seed)
            .start(25.0)
            .targetAhead(90.0) // 램프 입구
            .mark("approach")
            .straight(55.0, 25.0)
            .mark("approachEnd")
            .straight(35.0, 8.0) // 감속 + 램프 앞
            .mark("rampStart")
            .arc(360.0, 6.0, 8.0) // 1F → B1
            .mark("B1")
            .straight(4.0, 8.0) // B1 층 입구 직선
            .arc(360.0, 6.0, 8.0) // B1 → B2
            .mark("rampEnd")
            .straight(20.0, 7.0) // B2 통로, 자리 찾기
            .mark("overshoot")
            .stop(1.5)
            .shift(Gear.REVERSE)
            .mark("switch1")
            .arc(60.0, 5.5, 4.0) // ① 오른쪽으로 감고 후진
            .stop(2.0)
            .shift(Gear.DRIVE)
            .mark("switch2")
            .arc(20.0, 6.0, 3.0) // ② 앞으로 조금 (왼쪽)
            .stop(1.5)
            .shift(Gear.REVERSE)
            .mark("switch3")
            .arc(10.0, 7.0, 3.0) // ③ 다시 후진해서
            .straight(4.5, 3.0) // 칸 안으로
            .stop(1.5)
            .shift(Gear.PARK)
            .mark("parked")
            .hold(1.0)
            .build(
                id = MAIN_DEMO,
                title = "○○백화점 판교점 지하주차장",
                description = "회전 램프 2바퀴로 B2 → 지나쳐 멈춤 → 후진 2번으로 직각주차",
                lotFloors = listOf("1F", "B1", "B2", "B3", "B4", "B5"),
            )

    /** 메인 시연과 같음 */
    fun mainDemo(spec: VehicleSpec = VehicleSpec()): Scenario = pangyoDepartmentStore(spec)

    /**
     * 예시 기록용 직각주차 (DemoSeed): 회전 램프 [rampTurns]바퀴 → 통로 → 후진 [reverses]번으로 칸에 넣기.
     * 후진 사이에는 앞으로 조금 고쳐 넣는다. 0이면 앞으로 바로 칸에. 후진 횟수·동선 그림이 분석 결과와 맞게 실제 신호로 만든다.
     */
    fun seedPerpendicular(reverses: Int, rampTurns: Int = 1, seed: Long = 21L, spec: VehicleSpec = VehicleSpec()): Scenario {
        require(reverses in 0..6) { "reverses 0..6" }
        val b = ScenarioBuilder(spec, seed = seed)
            .start(25.0).targetAhead(90.0)
            .straight(55.0, 25.0).mark("approachEnd")
            .straight(30.0, 8.0).mark("rampStart")
        repeat(rampTurns) { i -> b.arc(360.0, 6.0, 8.0); if (i < rampTurns - 1) b.straight(4.0, 8.0) }
        b.mark("rampEnd").straight(18.0, 7.0)
        if (reverses == 0) {
            b.arc(90.0, 5.0, 4.0).straight(2.5, 3.0)
        } else {
            b.mark("overshoot").stop(1.5)
            repeat(reverses) { k ->
                b.shift(Gear.REVERSE)
                if (k == 0) b.arc(if (reverses == 1) 85.0 else 60.0, 5.5, 4.0) else b.arc(if (k == reverses - 1) 12.0 else 18.0, 6.5, 3.0)
                if (k == reverses - 1) b.straight(3.5, 3.0)
                b.stop(1.5)
                if (k < reverses - 1) b.shift(Gear.DRIVE).arc(-14.0, 6.0, 3.0).stop(1.5)
            }
        }
        return b.stop(1.5).shift(Gear.PARK).mark("parked").hold(1.0).build(
            id = "seed-perpendicular-$reverses",
            title = "예시 기록 (후진 ${reverses}번)",
            description = "회전 램프 ${rampTurns}바퀴 → 후진 ${reverses}번 직각주차",
            lotFloors = listOf("1F", "B1", "B2", "B3", "B4", "B5"),
        )
    }

    /**
     * 노상 평행주차: 길을 따라 오다 빈자리 앞차 옆에 나란히 섬 → 후진 S자(오른쪽 감고 → 왼쪽 감고) → 앞으로 맞춤 → P.
     * 기대: 후진 1회, 전환점 2개, 평행주차, 1F.
     */
    fun parallelParking(spec: VehicleSpec = VehicleSpec(), seed: Long = 2L): Scenario =
        ScenarioBuilder(spec, seed = seed)
            .start(20.0)
            .targetAhead(110.0)
            .straight(60.0, 20.0)
            .mark("approachEnd")
            .straight(25.0, 10.0)
            .straight(6.0, 5.0) // 앞차 옆으로
            .stop(1.5)
            .shift(Gear.REVERSE)
            .straight(1.0, 3.0)
            .arc(40.0, 5.5, 3.0) // 오른쪽으로 감고 후진 → 꼬리가 칸으로
            .arc(-40.0, 5.5, 3.0) // 왼쪽으로 감고 후진 → 차를 폄
            .stop(1.0)
            .shift(Gear.DRIVE)
            .straight(0.8, 2.0) // 앞으로 맞춤
            .stop(1.0)
            .shift(Gear.PARK)
            .mark("parked")
            .hold(1.0)
            .build(
                id = PARALLEL,
                title = "노상 공영주차장 (평행)",
                description = "후진 S자로 평행주차, 앞으로 살짝 맞춤",
                lotFloors = listOf("1F"),
            )

    /**
     * 사선주차: 지상 주차장 통로에서 왼쪽 사선 칸으로 앞으로 들어감. 후진 없음.
     * 기대: 후진 0회, 전환점 0개, 사선주차, 1F.
     */
    fun angledParking(spec: VehicleSpec = VehicleSpec(), seed: Long = 3L): Scenario =
        ScenarioBuilder(spec, seed = seed)
            .start(20.0)
            .targetAhead(90.0)
            .straight(50.0, 20.0)
            .mark("approachEnd")
            .straight(25.0, 8.0)
            .straight(15.0, 6.0) // 통로
            .arc(60.0, 5.0, 4.0) // 사선 칸으로 왼쪽
            .straight(3.5, 3.0)
            .stop(1.5)
            .shift(Gear.PARK)
            .mark("parked")
            .hold(1.0)
            .build(
                id = ANGLED,
                title = "지상 주차장 (사선)",
                description = "통로에서 사선 칸으로 앞으로 들어감",
                lotFloors = listOf("1F"),
            )

    /**
     * 평면 주차장: 입구로 우회전 → 통로 직진 → 왼쪽 칸으로 앞으로 들어감. 램프·후진 없음.
     * 기대: 후진 0회, 직각주차, 1F(HIGH).
     */
    fun flatLotSimple(spec: VehicleSpec = VehicleSpec(), seed: Long = 4L): Scenario =
        ScenarioBuilder(spec, seed = seed)
            .start(18.0)
            .targetAhead(60.0)
            .straight(40.0, 18.0)
            .mark("approachEnd")
            .straight(12.0, 10.0)
            .arc(-90.0, 8.0, 10.0) // 주차장 입구로 우회전
            .straight(25.0, 8.0) // 통로
            .arc(90.0, 5.0, 4.0) // 왼쪽 칸으로
            .straight(2.5, 3.0)
            .stop(1.5)
            .shift(Gear.PARK)
            .mark("parked")
            .hold(1.0)
            .build(
                id = FLAT_LOT,
                title = "마트 평면 주차장",
                description = "램프·후진 없이 앞으로 직각주차",
                lotFloors = listOf("1F"),
            )

    /**
     * 반 층(스킵 플로어) 주차장: 나선 램프를 1바퀴 반 돌고 멈춤 → 층이 애매함(x.5바퀴) → 층 추정 신뢰도 LOW.
     * 앱은 C-05에서 "몇 층에 대셨나요?" 층 버튼부터 보여 주고, 고르지 않으면 8초 뒤 층 없이 저장한다.
     * 기대: 후진 0회, 램프 ≈1.5바퀴, 층 신뢰도 LOW. 시뮬레이션 루틴(scripts/sim.sh 5번)용 — [all]에는 넣지 않음.
     */
    fun splitLevel(spec: VehicleSpec = VehicleSpec(), seed: Long = 5L): Scenario =
        ScenarioBuilder(spec, seed = seed)
            .start(20.0)
            .targetAhead(70.0)
            .straight(45.0, 20.0)
            .mark("approachEnd")
            .straight(25.0, 8.0)
            .mark("rampStart")
            .arc(540.0, 6.0, 8.0) // 1바퀴 반에서 램프가 끝남
            .mark("rampEnd")
            .straight(15.0, 7.0) // 통로
            .arc(90.0, 5.0, 4.0) // 왼쪽 칸으로 앞으로
            .straight(2.5, 3.0)
            .stop(1.5)
            .shift(Gear.PARK)
            .mark("parked")
            .hold(1.0)
            .build(
                id = SPLIT_LEVEL,
                title = "반 층 구조 주차장 (층 모름)",
                description = "램프를 1바퀴 반 돌아 층이 애매함 → 층을 물어봄",
                lotFloors = listOf("1F", "B1", "B2", "B3"),
            )

    fun all(spec: VehicleSpec = VehicleSpec()): List<Scenario> =
        listOf(pangyoDepartmentStore(spec), parallelParking(spec), angledParking(spec), flatLotSimple(spec))

    fun byId(id: String, spec: VehicleSpec = VehicleSpec()): Scenario? = when (id) {
        MAIN_DEMO -> pangyoDepartmentStore(spec)
        PARALLEL -> parallelParking(spec)
        ANGLED -> angledParking(spec)
        FLAT_LOT -> flatLotSimple(spec)
        SPLIT_LEVEL -> splitLevel(spec)
        else -> null
    }
}
