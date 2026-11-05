package com.parkinggack.app.domain

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.SwitchPoint
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * 진입~P 한 건 분석. 각 값의 정의:
 *
 * - **reverseCount**: R 기어로 들어간 횟수 중 실제로 [Config.minPhaseDistanceM](0.3 m) 이상 움직인 것만.
 *   (R→P→R처럼 사이에 전진이 없어도 R에 다시 넣고 움직였으면 따로 센다)
 * - **switchPoints**: 0.3 m 미만 깜빡임을 버리고 같은 방향 구간을 이어 붙인 뒤, 전진↔후진이 바뀐 곳.
 *   지점은 새 방향 기어가 처음 들어온 샘플(보통 정지 상태). index는 1부터 → ①②③
 * - **steeringTurns** ("핸들 N번 꺾음"): 핸들을 한쪽으로 크게 돌린 '동작'의 수.
 *   |핸들각| ≥ 90°에서 시작해 30° 아래로 풀거나 반대로 넘기면 끝나는 히스테리시스 구간 하나 = 1번.
 *   제자리에서만 돌린 것(구간 중 0.2 m 미만 이동)과 나선 램프를 도는 동안 계속 감고 있던 것은 세지 않는다.
 *   → 지나쳐 멈춤 → 후진(오른쪽) ① → 앞으로(왼쪽) ② → 다시 후진(오른쪽) ③ = 3번
 * - **rampTurns**: 핸들을 한쪽으로 감은(|각| ≥ 60°) **전진** 구간들을 묶어(사이 직선 5초 이내, 후진 없음)
 *   누적 회전이 [Config.minRampTurns](0.75바퀴) 이상이고 평균 속도가 2~30 km/h인 묶음 = 나선 램프.
 *   그 묶음들의 |heading 변화|/2π 합. 통로 모퉁이 90°나 유턴 180°는 램프로 치지 않는다.
 * - **netTurns**: 처음~끝 heading 변화 / 2π (반시계 +)
 * - **brakeCount**: 브레이크 눌림 상승 에지 수(첫 샘플부터 눌려 있으면 1). 신호가 한 번도 없으면 null
 * - **approximate**: 아래 중 하나면 true → 궤적 단순화 + 층 추정 신뢰도 LOW
 *   - 샘플 20개 미만, 5초 미만, 이동 3 m 미만 (너무 짧음)
 *   - 신호 끊김: 1초 넘는 간격 중 가장 긴 것이 3초 초과, 또는 끊긴 시간 합이 전체의 5% 초과
 *   - D/R인데 차속≈0(<0.1 m/s)이고 브레이크도 안 밟은(또는 모르는) 시간이 D/R 시간의 40% 이상
 *     (저속에서 차속이 0으로 읽히는 문제 → 막바지 오차 큼)
 */
class DefaultManeuverAnalyzer(
    private val classifier: ParkingShapeClassifier = AisleShapeClassifier(),
    private val integrator: TrajectoryIntegrator = BicycleTrajectoryIntegrator(),
    /** poses가 samples와 길이가 다를 때 다시 적분할 차종 제원 */
    private val fallbackSpec: VehicleSpec = VehicleSpec(),
    val config: Config = Config(),
) : ManeuverAnalyzer {

    data class Config(
        val minPhaseDistanceM: Double = 0.3,
        val steerEnterDeg: Double = 90.0,
        val steerExitDeg: Double = 30.0,
        val minSteerMoveM: Double = 0.2,
        val rampSteerEnterDeg: Double = 60.0,
        val rampSteerExitDeg: Double = 20.0,
        val minRampTurns: Double = 0.75,
        val maxRampChainGapMs: Long = 5_000,
        val rampMinSpeedKmh: Double = 2.0,
        val rampMaxSpeedKmh: Double = 30.0,
        val signalLossMs: Long = BicycleTrajectoryIntegrator.DEFAULT_MAX_STEP_MS,
        val maxSingleGapMs: Long = 3_000,
        val maxLostShare: Double = 0.05,
        val minSamples: Int = 20,
        val minDurationMs: Long = 5_000,
        val minPathM: Double = 3.0,
        val stalledSpeedMps: Double = 0.1,
        val maxStalledShare: Double = 0.4,
    )

    override fun analyze(samples: List<VehicleSample>, poses: List<Pose>): ManeuverSummary {
        if (samples.isEmpty()) return EMPTY
        val p = if (poses.size == samples.size) poses else integrator.integrate(samples, fallbackSpec)
        val c = config

        val gears = ManeuverSegments.effectiveGears(samples)
        val interval = ManeuverSegments.intervalDistances(samples, c.signalLossMs)

        // 후진 횟수 · 전환점
        val raw = ManeuverSegments.rawPhases(gears, interval)
        val reverseCount = raw.count { it.direction < 0 && it.distanceM >= c.minPhaseDistanceM }
        val merged = ManeuverSegments.mergedPhases(raw, c.minPhaseDistanceM)
        val switchPoints = (1 until merged.size).map { k ->
            val start = merged[k].start
            SwitchPoint(index = k, tMs = samples[start].timestampMs, pose = p[start], toReverse = merged[k].direction < 0)
        }

        // 램프 회전
        val rampChains = ManeuverSegments.forwardTurnChains(
            ManeuverSegments.excursions(samples, c.rampSteerEnterDeg, c.rampSteerExitDeg),
            samples, p, gears, c.maxRampChainGapMs,
        ).filter { chain ->
            val dist = (chain.start + 1..chain.end).sumOf { interval[it] }
            val sec = (samples[chain.end].timestampMs - samples[chain.start].timestampMs) / 1000.0
            val kmh = if (sec > 0) dist / sec * 3.6 else 0.0
            chain.turns >= c.minRampTurns && kmh in c.rampMinSpeedKmh..c.rampMaxSpeedKmh
        }
        val rampTurns = rampChains.sumOf { it.turns }

        // 핸들 꺾은 횟수 (램프 구간과 겹치는 것, 제자리 돌리기는 제외)
        val steeringTurns = ManeuverSegments.excursions(samples, c.steerEnterDeg, c.steerExitDeg).count { e ->
            val moved = (e.start + 1..e.end).sumOf { interval[it] }
            val onRamp = rampChains.any { r -> e.start <= r.end && e.end >= r.start }
            moved >= c.minSteerMoveM && !onRamp
        }

        val brakeCount = brakeCount(samples)
        val durationMs = samples.last().timestampMs - samples.first().timestampMs
        val netTurns = (p.last().headingRad - p.first().headingRad) / Kinematics.TWO_PI

        return ManeuverSummary(
            reverseCount = reverseCount,
            steeringTurns = steeringTurns,
            brakeCount = brakeCount,
            durationSec = (durationMs / 1000.0).roundToInt(),
            netTurns = netTurns,
            rampTurns = rampTurns,
            switchPoints = switchPoints,
            shape = classifier.classify(p),
            approximate = isApproximate(samples, p, gears),
        )
    }

    private fun brakeCount(samples: List<VehicleSample>): Int? {
        if (samples.none { it.brakePressed != null }) return null
        var pressed = false
        var count = 0
        for (s in samples) {
            val b = s.brakePressed ?: continue
            if (b && !pressed) count++
            pressed = b
        }
        return count
    }

    private fun isApproximate(samples: List<VehicleSample>, poses: List<Pose>, gears: List<Gear>): Boolean {
        val c = config
        val durationMs = samples.last().timestampMs - samples.first().timestampMs
        val path = (1 until poses.size).sumOf { hypot(poses[it].x - poses[it - 1].x, poses[it].y - poses[it - 1].y) }
        if (samples.size < c.minSamples || durationMs < c.minDurationMs || path < c.minPathM) return true

        var lostMs = 0L
        var longestGap = 0L
        var movingGearMs = 0L
        var stalledMs = 0L
        for (i in 1 until samples.size) {
            val dt = samples[i].timestampMs - samples[i - 1].timestampMs
            if (dt <= 0) continue
            if (dt > c.signalLossMs) {
                lostMs += dt - c.signalLossMs
                longestGap = maxOf(longestGap, dt)
            }
            val s = samples[i]
            if (gears[i].isMoving) {
                val step = minOf(dt, c.signalLossMs)
                movingGearMs += step
                if (s.speedMps < c.stalledSpeedMps && s.brakePressed != true) stalledMs += step
            }
        }
        if (longestGap > c.maxSingleGapMs) return true
        if (durationMs > 0 && lostMs.toDouble() / durationMs > c.maxLostShare) return true
        if (movingGearMs > 0 && stalledMs.toDouble() / movingGearMs >= c.maxStalledShare) return true
        return false
    }

    private companion object {
        val EMPTY = ManeuverSummary(
            reverseCount = 0, steeringTurns = 0, brakeCount = null, durationSec = 0, netTurns = 0.0,
            rampTurns = 0.0, switchPoints = emptyList(), shape = ParkingShape.UNKNOWN, approximate = true,
        )
    }
}
