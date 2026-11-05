package com.parkinggack.app.domain

import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.model.ManeuverSummary
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * 나선 램프 한 바퀴 ≈ 한 층.
 *
 * - 움직인 층 수 n = round(rampTurns)
 * - 방향: 층 목록에 지하층("B1", "지하1층"…)이 있으면 아래로, 없으면 위로("2F", "3F"…)
 * - 층 목록은 위→아래가 계약이지만, 이름이 모두 해석되면 높이 순으로 다시 정렬해 씀
 * - 진입층이 목록에 없으면 목록 바로 위(내려갈 때) / 바로 아래(올라갈 때)에서 출발한 것으로 봄
 *   예) ["B1","B2","B3"] + 진입 "1F" + 1바퀴 → B1
 * - 목록 끝을 넘으면 끝 층으로 자름(이 경우 HIGH는 MEDIUM으로)
 *
 * 신뢰도 (d = |rampTurns − n|):
 * - LOW: summary.approximate, 또는 d ≥ [lowFraction] (x.4~x.6처럼 애매)
 * - HIGH: n ≥ 1이고 d ≤ [highTolerance], 잘리지 않음 / 또는 rampTurns ≤ [highTolerance]이고 단층 주차장
 * - MEDIUM: 나머지 (예: 0.3바퀴, 1.3바퀴, 다층인데 회전 0)
 */
class SpiralFloorEstimator(
    val highTolerance: Double = 0.2,
    val lowFraction: Double = 0.4,
    /** lotFloors가 비었을 때 가정할 지하 깊이 (계약: 지하 6층) */
    val defaultBasementDepth: Int = 6,
) : FloorEstimator {

    override fun estimate(summary: ManeuverSummary, lotFloors: List<String>, entryFloor: String): FloorEstimate {
        val floors = orderTopToBottom(lotFloors.ifEmpty { defaultFloors() })
        val goesDown = floors.any { isBasement(it) }
        val turns = summary.rampTurns.coerceAtLeast(0.0)
        val n = turns.roundToInt()
        val d = abs(turns - n)

        val entryIdx = floors.indexOfFirst { it.equals(entryFloor, ignoreCase = true) }
            .takeIf { it >= 0 } ?: if (goesDown) -1 else floors.size

        var clamped = false
        val floor = if (n == 0) {
            entryFloor
        } else {
            val target = if (goesDown) entryIdx + n else entryIdx - n
            val idx = target.coerceIn(0, floors.size - 1)
            clamped = idx != target
            floors[idx]
        }

        val flatLot = floors.size <= 1 || floors.all { it.equals(entryFloor, ignoreCase = true) }
        val confidence = when {
            summary.approximate -> Confidence.LOW
            d >= lowFraction - EPS -> Confidence.LOW
            n == 0 -> if (turns <= highTolerance + EPS && flatLot) Confidence.HIGH else Confidence.MEDIUM
            d <= highTolerance + EPS && !clamped -> Confidence.HIGH
            else -> Confidence.MEDIUM
        }
        return FloorEstimate(floor, confidence)
    }

    private fun defaultFloors(): List<String> = listOf("1F") + (1..defaultBasementDepth).map { "B$it" }

    companion object {
        /** 2.2바퀴 → d = 0.2000000000000002 같은 표현 오차 흡수 */
        private const val EPS = 1e-9
        private val BASEMENT = Regex("^(?:B|지하)\\s*(\\d+)\\s*층?$", RegexOption.IGNORE_CASE)
        private val ABOVE = Regex("^(?:(\\d+)\\s*(?:F|층)|F\\s*(\\d+))$", RegexOption.IGNORE_CASE)

        fun isBasement(name: String): Boolean =
            name.trim().startsWith("B", ignoreCase = true) || name.trim().startsWith("지하")

        /** "B2" → −2, "1F" → 1, "지하3층" → −3, "2층" → 2. 해석 못 하면 null */
        fun level(name: String): Int? {
            val s = name.trim()
            BASEMENT.matchEntire(s)?.let { return -it.groupValues[1].toInt() }
            ABOVE.matchEntire(s)?.let { m -> return (m.groupValues[1].ifEmpty { m.groupValues[2] }).toInt() }
            return null
        }

        /** 이름이 모두 해석되면 높은 층 → 낮은 층 순으로 정렬, 아니면 받은 순서 그대로 */
        fun orderTopToBottom(floors: List<String>): List<String> {
            val levels = floors.map { level(it) }
            if (levels.any { it == null }) return floors
            return floors.zip(levels).sortedByDescending { it.second!! }.map { it.first }
        }
    }
}
