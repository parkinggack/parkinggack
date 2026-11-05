package com.parkinggack.app.domain.sim

import com.parkinggack.app.domain.Domain
import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.Gear
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.ParkingSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 시뮬레이션 루틴 5번(scripts/sim.sh)이 에뮬레이터에서 기대하는 것:
 * 시연 재생과 같은 조건(목적지 거리 없음, 주차장 모름)으로 세션에 넣으면 기록 → P → 층 신뢰도 LOW.
 */
class SplitLevelScenarioTest {

    private fun session() = ParkingSession(
        Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector(),
    )

    @Test fun replayWithoutDestinationEndsParkedWithLowConfidence() {
        val sc = ScenarioGenerator.splitLevel()
        val s = session()
        var sawRecording = false
        sc.samples.forEach { s.onSample(it, null); if (s.state.value is DriveState.Recording) sawRecording = true }
        assertTrue("기록 상태를 거쳐야 함", sawRecording)
        val r = (s.state.value as DriveState.Parked).result
        assertEquals(Confidence.LOW, r.estimate.confidence)
        assertEquals(0, r.summary.reverseCount)
        assertEquals(1.5, r.summary.rampTurns, 0.15)
        assertFalse("신호는 깨끗함 — LOW는 x.5바퀴 때문이어야 함", r.summary.approximate)
    }

    @Test fun lowConfidenceDoesNotDependOnNoiseSeed() {
        (1L..10L).forEach { seed ->
            val sc = ScenarioGenerator.splitLevel(seed = seed)
            val r = Domain.process(sc.samples, sc.spec, sc.lotFloors, sc.entryFloor)
            assertEquals("seed $seed", Confidence.LOW, r.floor.confidence)
        }
    }

    @Test fun wellFormedAndReachableById() {
        val sc = ScenarioGenerator.byId(ScenarioGenerator.SPLIT_LEVEL)
        assertNotNull(sc)
        sc!!
        assertEquals(setOf(100L), sc.samples.zipWithNext { a, b -> b.timestampMs - a.timestampMs }.toSet())
        assertEquals(Gear.PARK, sc.samples.last().gear)
        assertEquals(true, sc.samples.last { it.gear != Gear.PARK }.brakePressed)
        assertNotNull(sc.marks["parked"])
        assertFalse("시연 목록에는 넣지 않음", ScenarioGenerator.all().any { it.id == sc.id })
    }
}
