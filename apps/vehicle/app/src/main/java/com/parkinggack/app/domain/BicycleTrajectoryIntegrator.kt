package com.parkinggack.app.domain

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec

/**
 * 운동학적 자전거 모델 추측항법.
 *
 * - 출력은 입력과 **같은 길이**: `poses[i]`는 `samples[i]` 시각의 자세 (분석기가 인덱스로 맞춰 씀)
 * - 샘플 사이 구간은 양 끝 속도·핸들각의 평균(사다리꼴)으로 원호 적분 → 불규칙한 dt도 그대로 처리
 * - 속도는 항상 ≥0으로 들어오고 부호는 기어로: R이면 음수. N/P/모름이면 직전 이동 방향 유지
 * - dt가 [maxStepMs]보다 길면 신호 끊김으로 보고 그 구간은 [maxStepMs]만큼만 적분 (끊긴 동안 위치를 지어내지 않음)
 * - 시각이 같거나 거꾸로 가는 샘플은 이동 없이 직전 자세를 복사
 * - headingRad는 감지 않은(unwrapped) 누적값: 두 바퀴 돌면 4π. 회전 누적·층 추정에 그대로 쓴다
 * - Pose.reverse = 그 샘플의 기어가 R인지
 */
class BicycleTrajectoryIntegrator(
    val maxStepMs: Long = DEFAULT_MAX_STEP_MS,
) : TrajectoryIntegrator {

    override fun integrate(samples: List<VehicleSample>, spec: VehicleSpec): List<Pose> {
        if (samples.isEmpty()) return emptyList()
        val out = ArrayList<Pose>(samples.size)
        val state = PoseState()

        var lastDir = 1
        var prev = samples[0]
        lastDir = Kinematics.direction(prev.gear, lastDir)
        var prevV = prev.speedMps.toDouble() * lastDir
        out += Pose(prev.timestampMs, 0.0, 0.0, 0.0, prev.gear == Gear.REVERSE)

        for (i in 1 until samples.size) {
            val cur = samples[i]
            lastDir = Kinematics.direction(cur.gear, lastDir)
            val curV = cur.speedMps.toDouble() * lastDir
            val dt = Kinematics.dtSeconds(prev, cur, maxStepMs)
            if (dt > 0.0) {
                val v = (prevV + curV) / 2.0
                val steer = (prev.steeringDeg.toDouble() + cur.steeringDeg.toDouble()) / 2.0
                state.step(v, Kinematics.yawRate(v, steer, spec), dt)
                prev = cur
                prevV = curV
            }
            out += Pose(cur.timestampMs, state.x, state.y, state.heading, cur.gear == Gear.REVERSE)
        }
        return out
    }

    companion object {
        const val DEFAULT_MAX_STEP_MS = 1_000L
    }
}
