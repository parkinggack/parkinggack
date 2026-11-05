package com.parkinggack.app.domain

import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import kotlin.math.hypot

/**
 * 통로 방향 vs 최종 차 방향으로 주차 형태 판별.
 *
 * 1. 최종 방향 θf = 마지막 자세 heading
 * 2. 끝에서 거꾸로 훑으며 heading이 θf ± [settleToleranceDeg] 안인 꼬리(칸에 들어가 곧게 선 부분)를 잘라 냄
 *    → 그 앞이 '마지막 주차 동작'과 통로
 * 3. 꼬리 앞에서 **전진**·저속(≤ [maxAisleSpeedKmh])·거의 직선(heading 폭 ≤ [straightSpanDeg]) 구간 중
 *    [minAisleLengthM] 이상인 **마지막** 것 = 통로. 그 구간 heading 평균 = 통로 방향
 * 4. 각도 차를 mod 180으로 0~90°로 접어서
 *    ≤ [parallelMaxDeg] 평행 · ≥ [perpendicularMinDeg] 직각 · [angledMinDeg]~직각 미만 사선 · 그 사이 모름
 */
class AisleShapeClassifier(
    val settleToleranceDeg: Double = 10.0,
    val straightSpanDeg: Double = 12.0,
    val minAisleLengthM: Double = 5.0,
    val maxAisleSpeedKmh: Double = 20.0,
    val parallelMaxDeg: Double = 20.0,
    val angledMinDeg: Double = 30.0,
    val perpendicularMinDeg: Double = 75.0,
) : ParkingShapeClassifier {

    override fun classify(poses: List<Pose>): ParkingShape {
        val angle = aisleAngleDeg(poses) ?: return ParkingShape.UNKNOWN
        return when {
            angle <= parallelMaxDeg -> ParkingShape.PARALLEL
            angle >= perpendicularMinDeg -> ParkingShape.PERPENDICULAR
            angle >= angledMinDeg -> ParkingShape.ANGLED
            else -> ParkingShape.UNKNOWN
        }
    }

    /** 통로와 최종 차 방향 사이 각(0~90°). 통로를 못 찾으면 null */
    fun aisleAngleDeg(poses: List<Pose>): Double? {
        val aisle = aisleHeadingRad(poses) ?: return null
        return Kinematics.foldTo90Deg(poses.last().headingRad - aisle)
    }

    /** 통로 방향(rad, unwrapped). C-12에서 통로 띠를 그릴 때도 씀. 못 찾으면 null */
    fun aisleHeadingRad(poses: List<Pose>): Double? {
        if (poses.size < 2) return null
        val finalHeading = poses.last().headingRad
        val settleTol = Math.toRadians(settleToleranceDeg)
        var settleStart = poses.size - 1
        while (settleStart > 0 && kotlin.math.abs(poses[settleStart - 1].headingRad - finalHeading) <= settleTol) settleStart--

        val span = Math.toRadians(straightSpanDeg)
        val maxSpeed = maxAisleSpeedKmh / 3.6
        var best: Double? = null

        var start = -1
        var minH = 0.0
        var maxH = 0.0
        var length = 0.0
        var headingSum = 0.0
        var headingWeight = 0.0

        fun close(end: Int) {
            if (start >= 0 && end > start && length >= minAisleLengthM) {
                best = if (headingWeight > 0) headingSum / headingWeight else poses[end].headingRad
            }
            start = -1
        }
        fun open(i: Int) {
            start = i; minH = poses[i].headingRad; maxH = minH
            length = 0.0; headingSum = 0.0; headingWeight = 0.0
        }

        for (i in 0 until settleStart) {
            val p = poses[i]
            if (p.reverse) { close(i - 1); continue }
            if (start < 0) { open(i); continue }
            val prev = poses[i - 1]
            val step = hypot(p.x - prev.x, p.y - prev.y)
            val dt = (p.tMs - prev.tMs) / 1000.0
            if (dt > 0 && step / dt > maxSpeed) { close(i - 1); continue }
            minH = minOf(minH, p.headingRad)
            maxH = maxOf(maxH, p.headingRad)
            if (maxH - minH > span) { close(i - 1); open(i); continue }
            length += step
            headingSum += step * (p.headingRad + prev.headingRad) / 2.0
            headingWeight += step
        }
        close(settleStart - 1)
        return best
    }
}
