package com.parkinggack.app.domain

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

/**
 * 자전거 모델 공용 계산. 적분기·분석기·진입 감지기·시나리오 생성기가 같은 식을 쓰도록 한곳에 모음.
 *
 * - 바퀴 조향각 δ = 핸들각 / 조향비
 * - 요 레이트 ω = v·tan(δ) / 축거 (v는 후진이면 음수)
 * - 좌표: x = 시작 시 오른쪽(+), y = 시작 시 앞(+), heading = +y 기준 반시계(+)
 *   → 진행 방향 단위벡터 = (−sin θ, cos θ)
 */
internal object Kinematics {
    const val TWO_PI = 2 * PI
    const val KMH_TO_MPS = 1.0 / 3.6

    /** tan 폭주 방지: 비정상 입력이 와도 바퀴각은 ±60° 안으로 */
    private const val MAX_WHEEL_RAD = 60.0 * PI / 180.0

    fun wheelAngleRad(steeringDeg: Double, spec: VehicleSpec): Double =
        Math.toRadians(steeringDeg / spec.steeringRatio).coerceIn(-MAX_WHEEL_RAD, MAX_WHEEL_RAD)

    /** 부호 있는 속도 v(후진 음수)와 핸들각으로 요 레이트(rad/s) */
    fun yawRate(signedSpeedMps: Double, steeringDeg: Double, spec: VehicleSpec): Double =
        signedSpeedMps * tan(wheelAngleRad(steeringDeg, spec)) / spec.wheelbaseM

    /** 반지름 R 원을 그리기 위한 핸들각(도, 부호 없음) — 역자전거 모델 */
    fun steeringForRadius(radiusM: Double, spec: VehicleSpec): Double =
        Math.toDegrees(kotlin.math.atan(spec.wheelbaseM / radiusM)) * spec.steeringRatio

    /** 기어가 D/R이면 그 방향, 아니면(N/P/모름) 직전 이동 방향을 유지 */
    fun direction(gear: Gear, lastDirection: Int): Int = when (gear) {
        Gear.DRIVE -> 1
        Gear.REVERSE -> -1
        else -> lastDirection
    }

    fun dtSeconds(prev: VehicleSample, cur: VehicleSample, maxStepMs: Long): Double {
        val dtMs = cur.timestampMs - prev.timestampMs
        return if (dtMs <= 0) 0.0 else minOf(dtMs, maxStepMs) / 1000.0
    }

    /** 두 샘플 사이 이동 거리(m, 사다리꼴 적분, dt는 maxStepMs로 자름) */
    fun intervalDistance(prev: VehicleSample, cur: VehicleSample, maxStepMs: Long): Double =
        (abs(prev.speedMps.toDouble()) + abs(cur.speedMps.toDouble())) / 2.0 * dtSeconds(prev, cur, maxStepMs)

    /** 각도 차를 0~90°로 접기 (mod 180) */
    fun foldTo90Deg(diffRad: Double): Double {
        var d = Math.toDegrees(diffRad) % 180.0
        if (d < 0) d += 180.0
        return if (d > 90.0) 180.0 - d else d
    }
}

/** 가변 자세 (x, y, heading). 원호 정확 적분 — 일정 v·ω 구간에서 오차 없이 원을 그린다. */
internal class PoseState(var x: Double = 0.0, var y: Double = 0.0, var heading: Double = 0.0) {
    /** @return 이번 스텝의 heading 변화(rad) */
    fun step(signedSpeedMps: Double, yawRate: Double, dt: Double): Double {
        if (dt <= 0.0) return 0.0
        val dTheta = yawRate * dt
        if (abs(dTheta) < 1e-9) {
            x += -signedSpeedMps * sin(heading) * dt
            y += signedSpeedMps * cos(heading) * dt
        } else {
            val r = signedSpeedMps / yawRate
            x += r * (cos(heading + dTheta) - cos(heading))
            y += r * (sin(heading + dTheta) - sin(heading))
        }
        heading += dTheta
        return dTheta
    }
}
