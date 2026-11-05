package com.parkinggack.app.domain

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.VehicleSample
import kotlin.math.abs
import kotlin.math.sign

/*
 * 분석기 내부 구간 나누기. 모두 샘플 인덱스 기준 (poses[i] ↔ samples[i]).
 */

/** 같은 진행 방향(D=+1 / R=−1)이 이어진 구간. [distanceM]은 구간 안에서 실제로 움직인 거리 */
internal data class MotionPhase(val direction: Int, val start: Int, val end: Int, val distanceM: Double)

/** 핸들을 한쪽(+왼쪽 / −오른쪽)으로 크게 돌린 구간 */
internal data class SteeringExcursion(val side: Int, val start: Int, val end: Int)

/** 같은 방향으로 계속 돈 구간 묶음 (나선 램프 후보) */
internal data class TurnChain(val side: Int, val start: Int, val end: Int, val turns: Double)

internal object ManeuverSegments {

    /** UNKNOWN 기어는 직전에 알던 기어로 메움 (신호 순간 끊김 대비) */
    fun effectiveGears(samples: List<VehicleSample>): List<Gear> {
        var last = Gear.UNKNOWN
        return samples.map { s -> if (s.gear == Gear.UNKNOWN) last else s.gear.also { last = it } }
    }

    /** interval[i] = samples[i-1] → samples[i] 이동 거리, interval[0] = 0 */
    fun intervalDistances(samples: List<VehicleSample>, maxStepMs: Long): DoubleArray {
        val d = DoubleArray(samples.size)
        for (i in 1 until samples.size) d[i] = Kinematics.intervalDistance(samples[i - 1], samples[i], maxStepMs)
        return d
    }

    /**
     * 기어가 D 또는 R로 이어진 구간(원시). N/P는 구간을 끊는다.
     * 거리는 구간 첫 샘플로 들어오는 간격은 빼고(기어 바뀌는 순간은 보통 정지) 합산.
     */
    fun rawPhases(gears: List<Gear>, interval: DoubleArray): List<MotionPhase> {
        val out = mutableListOf<MotionPhase>()
        var dir = 0
        var start = -1
        var dist = 0.0
        fun close(end: Int) { if (dir != 0) out += MotionPhase(dir, start, end, dist) }
        for (i in gears.indices) {
            val d = when (gears[i]) { Gear.DRIVE -> 1; Gear.REVERSE -> -1; else -> 0 }
            if (d != dir) {
                close(i - 1)
                dir = d; start = i; dist = 0.0
            } else if (d != 0) {
                dist += interval[i]
            }
        }
        close(gears.size - 1)
        return out
    }

    /** [minDistanceM] 미만으로 움직인 구간(기어 깜빡임)은 버리고, 같은 방향끼리 이어 붙임 → 전/후진이 번갈아 나오는 목록 */
    fun mergedPhases(raw: List<MotionPhase>, minDistanceM: Double): List<MotionPhase> {
        val out = mutableListOf<MotionPhase>()
        for (p in raw) {
            if (p.distanceM < minDistanceM) continue
            val last = out.lastOrNull()
            if (last != null && last.direction == p.direction) {
                out[out.size - 1] = last.copy(end = p.end, distanceM = last.distanceM + p.distanceM)
            } else {
                out += p
            }
        }
        return out
    }

    /**
     * 히스테리시스로 핸들 크게 돌린 구간 찾기.
     * |각| ≥ [enterDeg]면 시작, 같은 쪽으로 [exitDeg] 아래로 돌아오거나 반대쪽으로 넘어가면 끝.
     * 반대쪽으로 곧장 [enterDeg]를 넘으면 그 샘플에서 새 구간이 바로 시작된다.
     */
    fun excursions(samples: List<VehicleSample>, enterDeg: Double, exitDeg: Double): List<SteeringExcursion> {
        val out = mutableListOf<SteeringExcursion>()
        var side = 0
        var start = -1
        for (i in samples.indices) {
            val s = samples[i].steeringDeg.toDouble()
            if (side != 0 && s * side < exitDeg) {
                out += SteeringExcursion(side, start, i - 1)
                side = 0
            }
            if (side == 0 && abs(s) >= enterDeg) {
                side = sign(s).toInt()
                start = i
            }
        }
        if (side != 0) out += SteeringExcursion(side, start, samples.size - 1)
        return out
    }

    /**
     * 같은 쪽으로 돈 전진 구간들을 묶는다. 사이가 [maxGapMs] 이내이고 그 사이에 후진이 없으면 한 묶음
     * (나선 램프 층마다 있는 짧은 직선 구간을 넘어 이어 세기 위해).
     */
    fun forwardTurnChains(
        excursions: List<SteeringExcursion>,
        samples: List<VehicleSample>,
        poses: List<Pose>,
        gears: List<Gear>,
        maxGapMs: Long,
    ): List<TurnChain> {
        fun forwardOnly(from: Int, to: Int) = (from..to).all { gears[it] != Gear.REVERSE }
        val out = mutableListOf<TurnChain>()
        var cur: SteeringExcursion? = null
        fun close() {
            val c = cur ?: return
            val turns = abs(poses[c.end].headingRad - poses[c.start].headingRad) / Kinematics.TWO_PI
            out += TurnChain(c.side, c.start, c.end, turns)
            cur = null
        }
        for (e in excursions) {
            if (!forwardOnly(e.start, e.end)) { close(); continue }
            val c = cur
            if (c != null && c.side == e.side &&
                samples[e.start].timestampMs - samples[c.end].timestampMs <= maxGapMs &&
                forwardOnly(c.end, e.start)
            ) {
                cur = c.copy(end = e.end)
            } else {
                close()
                cur = e
            }
        }
        close()
        return out
    }
}
