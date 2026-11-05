package com.parkinggack.app.domain

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec
import kotlin.math.abs

/**
 * 주차장 진입 감지 (기록 시작 트리거). 샘플을 시간 순서대로 넣는다.
 *
 * '저속 구간' = 차속 < [lowSpeedKmh]이고 기어가 P가 아닌 동안 이어진 구간. 빨라지거나 P, 또는
 * [maxGapMs] 넘는 신호 끊김이면 처음부터 다시 잰다. 저속 구간 동안 이동 거리·누적 회전(|Δheading| 합)·
 * 후진 이동 거리를 모은다.
 *
 * - 규칙 A (목적지 근처): distance ≤ [nearTargetM] + 저속 [minLowSpeedMs] 이상 + 저속으로 [minLowSpeedDistanceM] 이상 이동
 *   (신호 대기처럼 섰다 바로 출발하는 건 이동 거리가 모자라 걸리지 않음)
 * - 규칙 B (주차 동작 증거): 저속 [fallbackMinLowSpeedMs] 이상 + (후진 [fallbackReverseM] 이상 또는 누적 회전 [fallbackTurnDeg] 이상)
 *   목적지 정보가 없을 때(distance null) 쓰고, [fallbackWhenFar]면 목적지에서 먼 곳(다른 주차장)에서도 쓴다.
 *
 * 한 번 true를 돌려준 뒤에는 [reset] 전까지 계속 false.
 */
class LowSpeedEntryDetector(
    val spec: VehicleSpec = VehicleSpec(),
    val lowSpeedKmh: Double = 15.0,
    val nearTargetM: Double = 300.0,
    val minLowSpeedMs: Long = 5_000,
    val minLowSpeedDistanceM: Double = 20.0,
    val fallbackMinLowSpeedMs: Long = 10_000,
    val fallbackTurnDeg: Double = 200.0,
    val fallbackReverseM: Double = 1.0,
    val fallbackWhenFar: Boolean = true,
    val maxGapMs: Long = 3_000,
) : ParkingEntryDetector {

    /** 진입이 확정된 샘플 시각 (아직이면 null) */
    var triggeredAtMs: Long? = null
        private set

    private var prev: VehicleSample? = null
    private var lastDir = 1
    private var runStartMs: Long? = null
    private var runDistanceM = 0.0
    private var runTurnRad = 0.0
    private var runReverseM = 0.0

    override fun onSample(sample: VehicleSample, distanceToTargetM: Double?): Boolean {
        if (triggeredAtMs != null) return false
        val before = prev
        prev = sample
        val dirBefore = lastDir
        lastDir = Kinematics.direction(sample.gear, lastDir)

        val low = sample.gear != Gear.PARK && sample.speedMps * 3.6 < lowSpeedKmh
        if (!low) { clearRun(); return false }

        val dtMs = if (before == null) Long.MAX_VALUE else sample.timestampMs - before.timestampMs
        val start = runStartMs
        if (start == null || before == null || dtMs <= 0 || dtMs > maxGapMs) {
            if (dtMs > maxGapMs || start == null) startRun(sample.timestampMs)
            return false
        }

        val dt = dtMs / 1000.0
        val dist = (abs(before.speedMps.toDouble()) + abs(sample.speedMps.toDouble())) / 2.0 * dt
        val v = (before.speedMps * dirBefore + sample.speedMps * lastDir) / 2.0
        val steer = (before.steeringDeg + sample.steeringDeg) / 2.0
        runDistanceM += dist
        runTurnRad += abs(Kinematics.yawRate(v, steer, spec) * dt)
        if (sample.gear == Gear.REVERSE) runReverseM += dist

        val elapsed = sample.timestampMs - start
        val near = distanceToTargetM != null && distanceToTargetM <= nearTargetM
        val ruleA = near && elapsed >= minLowSpeedMs && runDistanceM >= minLowSpeedDistanceM
        val fallbackAllowed = distanceToTargetM == null || near || fallbackWhenFar
        val ruleB = fallbackAllowed && elapsed >= fallbackMinLowSpeedMs &&
            (runReverseM >= fallbackReverseM || Math.toDegrees(runTurnRad) >= fallbackTurnDeg)

        if (ruleA || ruleB) {
            triggeredAtMs = sample.timestampMs
            return true
        }
        return false
    }

    override fun reset() {
        triggeredAtMs = null
        prev = null
        lastDir = 1
        clearRun()
    }

    private fun startRun(t: Long) {
        runStartMs = t
        runDistanceM = 0.0
        runTurnRad = 0.0
        runReverseM = 0.0
    }

    private fun clearRun() {
        runStartMs = null
        runDistanceM = 0.0
        runTurnRad = 0.0
        runReverseM = 0.0
    }
}
