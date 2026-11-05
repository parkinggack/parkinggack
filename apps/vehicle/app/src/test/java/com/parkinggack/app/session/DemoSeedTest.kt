package com.parkinggack.app.session

import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.sim.ScenarioGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoSeedTest {
    private val now = 1_793_700_000_000L // 2026-11-04 전후, 고정

    @Test fun seedScenarioReverseCountMatchesTheRequest() {
        for (n in 0..4) {
            val sc = ScenarioGenerator.seedPerpendicular(n, rampTurns = 2, seed = 30L + n)
            val s = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
            sc.samples.forEachIndexed { i, x -> s.onSample(x, sc.distanceToTargetM[i]) }
            val r = (s.state.value as? DriveState.Parked)?.result
            assertTrue("후진 $n 시나리오가 P까지 기록돼야 함", r != null)
            assertEquals("후진 횟수", n, r!!.summary.reverseCount)
            assertTrue(r.trajectory.isNotEmpty())
        }
    }

    @Test fun seedRecordsLookLikeFourMonthsOfImprovement() {
        val list = DemoSeed.records(now)
        assertEquals(13, list.size)
        assertTrue(list.all { it.staysOnDevice && it.summary != null && it.trajectory.isNotEmpty() && it.lotId != null })
        assertEquals(list.sortedByDescending { it.parkedAtMs }, list)
        // 폰 시연 데이터와 같은 '지금 주차': 아브뉴프랑 B2 D-07, 약 2시간 전
        val latest = list.first()
        assertEquals("avenue-france-pangyo", latest.lotId)
        assertEquals("B2 · D-07", latest.positionText)
        assertTrue(now - latest.parkedAtMs in 2 * 3_600_000L..3 * 3_600_000L)
    }

    /** 언제 열어도 C-09 머리말이 좋아진 것을 말한다 (월초 새벽·월말·해 바뀜) */
    @Test fun historyHeadlineSaysImprovedWhateverTheDate() {
        val cal = java.util.Calendar.getInstance()
        val dates = listOf(intArrayOf(2026, 10, 4, 15, 0), intArrayOf(2026, 10, 1, 0, 30), intArrayOf(2026, 10, 1, 9, 0),
            intArrayOf(2026, 10, 15, 12, 0), intArrayOf(2026, 10, 30, 23, 0), intArrayOf(2027, 0, 2, 8, 0), intArrayOf(2027, 2, 31, 18, 0))
        for (d in dates) {
            cal.set(d[0], d[1], d[2], d[3], d[4], 0)
            val at = cal.timeInMillis
            val list = DemoSeed.records(at)
            val monthly = Copy.monthlyAvgReverse(list, at)
            val head = Copy.historyHeadline(monthly)
            assertTrue("${d.toList()} → $head $monthly", head.contains("줄었어요"))
            assertTrue("지금 주차는 이번 달 ${d.toList()}", Copy.monthlyAvgReverse(list.take(1), at).isNotEmpty())
        }
    }
}
