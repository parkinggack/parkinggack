package com.parkinggack.app.domain

import com.parkinggack.app.domain.sim.ScenarioGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class SwitchPointSimplifierTest {
    private val simplifier = SwitchPointSimplifier()

    @Test fun exactTrajectoryIsLeftAlone() {
        val r = Domain.process(ScenarioGenerator.pangyoDepartmentStore().samples)
        assertSame(r.poses, simplifier.simplify(r.poses, r.summary))
        assertSame(r.poses, r.displayPoses)
    }

    @Test fun approximateKeepsStartSwitchPointsAndEnd() {
        val r = Domain.process(ScenarioGenerator.pangyoDepartmentStore().samples)
        val approx = r.summary.copy(approximate = true)
        val simple = simplifier.simplify(r.poses, approx)

        assertEquals(5, simple.size) // 시작 + ①②③ + 끝
        assertEquals(r.poses.first().tMs, simple.first().tMs)
        assertEquals(r.poses.last().tMs, simple.last().tMs)
        assertEquals(r.summary.switchPoints.map { it.tMs }, simple.subList(1, 4).map { it.tMs })
        assertEquals(r.poses.last().x, simple.last().x, 0.0)
        // reverse = 그 점으로 들어오는 선분 방향: 시작(전진) → ①(전진으로 옴) → ②(후진으로 옴) → ③(전진으로 옴) → 끝(후진으로 옴)
        assertEquals(listOf(false, false, true, false, true), simple.map { it.reverse })
    }

    @Test fun approximateWithoutSwitchesIsStartToEnd() {
        val r = Domain.process(ScenarioGenerator.angledParking().samples)
        val simple = simplifier.simplify(r.poses, r.summary.copy(approximate = true))
        assertEquals(2, simple.size)
        assertEquals(listOf(false, false), simple.map { it.reverse })
    }

    @Test fun signalLossPipelineGivesSimplifiedDisplay() {
        val samples = ScenarioGenerator.pangyoDepartmentStore().samples.filterNot { it.timestampMs in 40_000L..45_000L }
        val r = Domain.process(samples, lotFloors = listOf("1F", "B1", "B2", "B3"))
        assertEquals(true, r.summary.approximate)
        assertEquals(r.summary.switchPoints.size + 2, r.displayPoses.size)
        assertEquals(com.parkinggack.app.model.Confidence.LOW, r.floor.confidence)
    }
}
