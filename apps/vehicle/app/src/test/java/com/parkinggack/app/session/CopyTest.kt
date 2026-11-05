package com.parkinggack.app.session

import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.ParkingShape
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CopyTest {
    @Test fun durations() {
        assertEquals("1분 40초", Copy.duration(100))
        assertEquals("55초", Copy.duration(55))
        assertEquals("2분 05초", Copy.duration(125))
        assertEquals("1분", Copy.duration(60))
    }

    @Test fun headline() {
        assertEquals("지난달보다 후진이 1회 줄었어요", Copy.historyHeadline(listOf("10월" to 2.5, "11월" to 1.5)))
        assertEquals("지난달만큼 꾸준해요", Copy.historyHeadline(listOf("10월" to 2.0, "11월" to 2.2)))
    }

    private fun rec(id: String, reverse: Int, at: Long) = ParkingRecord(
        id = id, lotId = null, lotName = "x", floor = "B1", zone = null, number = null, parkedAtMs = at,
        summary = ManeuverSummary(reverse, 1, null, 60, 0.0, 0.0, emptyList(), ParkingShape.PERPENDICULAR, false),
    )

    @Test fun secondParkingIsComparedWithTheFirstNotCalledFirst() {
        // docs/sim-findings.md 2-2: 지난 기록 1건이어도 "첫 기록을 남겼어요"라고 했다
        val first = rec("a", reverse = 2, at = 1_000)
        assertEquals("첫 기록을 남겼어요", Copy.comparison(first.summary!!, listOf(first), excludeId = "a"))
        val second = rec("b", reverse = 0, at = 2_000)
        assertEquals("지난번보다 수월했어요", Copy.comparison(second.summary!!, listOf(second, first), excludeId = "b"))
        assertEquals("지난번처럼 차분했어요", Copy.comparison(rec("c", 2, 3_000).summary!!, listOf(first), excludeId = "c"))
        val third = rec("c", reverse = 0, at = 3_000)
        assertEquals("평소보다 수월했어요", Copy.comparison(third.summary!!, listOf(third, second, first.copy(summary = first.summary!!.copy(reverseCount = 3))), excludeId = "c"))
    }

    @Test fun homeLineDoesNotSayTodayAndSkipsComparisonForTheOnlyRecord() {
        val only = rec("a", reverse = 1, at = 1_000)
        assertEquals("지난 주차 후진 1회", Copy.lastSummaryLine(listOf(only)))
        val lines = listOf(
            Copy.lastSummaryLine(listOf(rec("b", 4, 2_000), only))!!,
            Copy.lastSummaryLine(listOf(rec("c", 4, 3_000), rec("b", 1, 2_000), only))!!,
        )
        lines.forEach { assertFalse(it, it.contains("오늘")) } // 다음 날 봐도 맞게
        assertEquals("지난 주차 후진 4회, 조금 더 신중하게 댔어요", lines[1])
    }

    @Test fun emptyHeadlineBreaksAtAPhraseBoundary() {
        assertEquals("기록이 쌓이면\n변화를 보여 드릴게요", Copy.historyHeadline(emptyList()))
    }
}
