package com.parkinggack.app.domain.sim

import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.ParkingAnalysis
import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.ParkingShape
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScenarioTest {

    private fun run(sc: Scenario): ParkingAnalysis = Domain.process(sc.samples, sc.spec, sc.lotFloors, sc.entryFloor)

    @Test fun mainDemoMatchesTheStoryboard() {
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        val r = run(sc)
        val s = r.summary
        assertEquals(2, s.reverseCount)
        assertEquals(3, s.switchPoints.size) // ①②③
        assertEquals(listOf(1, 2, 3), s.switchPoints.map { it.index })
        assertEquals(listOf(true, false, true), s.switchPoints.map { it.toReverse })
        assertEquals(3, s.steeringTurns) // "핸들 3번 꺾음"
        assertEquals(ParkingShape.PERPENDICULAR, s.shape)
        assertEquals(2.0, s.rampTurns, 0.1)
        assertEquals(2.25, s.netTurns, 0.05)
        assertEquals(FloorEstimate("B2", Confidence.HIGH), r.floor)
        assertFalse(s.approximate)
        assertEquals(5, s.brakeCount)
        assertTrue("duration ${s.durationSec}s ≈ 1:40", s.durationSec in 95..105)
        // 전환점이 스토리보드 순서(지나쳐 멈춤 → 앞으로 조금 → 다시 후진)대로
        assertTrue(s.switchPoints.zipWithNext().all { (a, b) -> a.tMs < b.tMs })
        assertTrue(s.switchPoints.first().tMs > sc.marks.getValue("rampEnd"))
    }

    @Test fun parallelParking() {
        val r = run(ScenarioGenerator.parallelParking())
        assertEquals(1, r.summary.reverseCount)
        assertEquals(2, r.summary.switchPoints.size)
        assertEquals(ParkingShape.PARALLEL, r.summary.shape)
        assertEquals(2, r.summary.steeringTurns)
        assertEquals(0.0, r.summary.rampTurns, 0.0)
        assertEquals(FloorEstimate("1F", Confidence.HIGH), r.floor)
        assertFalse(r.summary.approximate)
    }

    @Test fun angledParking() {
        val r = run(ScenarioGenerator.angledParking())
        assertEquals(0, r.summary.reverseCount)
        assertTrue(r.summary.switchPoints.isEmpty())
        assertEquals(ParkingShape.ANGLED, r.summary.shape)
        assertEquals(1, r.summary.steeringTurns)
        assertEquals(FloorEstimate("1F", Confidence.HIGH), r.floor)
        assertFalse(r.summary.approximate)
    }

    @Test fun flatLotSimple() {
        val r = run(ScenarioGenerator.flatLotSimple())
        assertEquals(0, r.summary.reverseCount)
        assertTrue(r.summary.switchPoints.isEmpty())
        assertEquals(ParkingShape.PERPENDICULAR, r.summary.shape)
        assertEquals(0.0, r.summary.rampTurns, 0.0)
        assertEquals(FloorEstimate("1F", Confidence.HIGH), r.floor)
        assertFalse(r.summary.approximate)
    }

    @Test fun scenariosAreWellFormed10HzSignals() {
        ScenarioGenerator.all().forEach { sc ->
            val dts = sc.samples.zipWithNext { a, b -> b.timestampMs - a.timestampMs }.toSet()
            assertEquals(sc.id, setOf(100L), dts)
            assertEquals(sc.id, sc.samples.size, sc.distanceToTargetM.size)
            assertTrue(sc.id, sc.samples.all { it.speedMps >= 0f && it.brakePressed != null })
            assertTrue(sc.id, sc.distanceToTargetM.all { it != null && it >= 0.0 })
            assertEquals(sc.id, Gear.PARK, sc.samples.last().gear)
            assertEquals(sc.id, 0f, sc.samples.last().speedMps)
            // P 넣기 전 정지 구간은 브레이크를 밟고 있음
            val beforePark = sc.samples.last { it.gear != Gear.PARK }
            assertTrue(sc.id, beforePark.brakePressed == true)
            assertNotNull(sc.marks["parked"])
        }
    }

    @Test fun mainDemoSpeedProfile() {
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        val kmh = { t: Long -> sc.samples.first { it.timestampMs >= t }.speedMps * 3.6 }
        assertEquals(25.0, kmh(1_000), 1.0)
        val ramp = sc.samples.filter { it.timestampMs in sc.marks.getValue("rampStart")..sc.marks.getValue("rampEnd") }
        assertEquals(8.0, ramp.map { it.speedMps * 3.6 }.average(), 0.5)
        // 램프에선 핸들을 한쪽으로 크게 감고 있음
        assertTrue(ramp.count { it.steeringDeg > 300f } > ramp.size * 0.7)
        // 목적지 거리는 접근하며 줄어듦
        assertTrue(sc.distanceToTargetM.first()!! > sc.distanceToTargetM[sc.samples.indexOfFirst { it.timestampMs >= sc.marks.getValue("rampStart") }]!!)
    }

    @Test fun generationIsDeterministic() {
        assertEquals(ScenarioGenerator.pangyoDepartmentStore().samples, ScenarioGenerator.pangyoDepartmentStore().samples)
        assertEquals(ScenarioGenerator.all().map { it.id }, ScenarioGenerator.all().map { ScenarioGenerator.byId(it.id)!!.id })
        assertEquals(null, ScenarioGenerator.byId("nope"))
    }

    @Test fun arcHitsRequestedHeading() {
        val b = ScenarioBuilder(steeringNoiseDeg = 0.0, speedNoiseMps = 0.0).start(5.0)
        b.arc(90.0, 6.0, 5.0)
        val samples = b.build("t", "t", "", listOf("1F")).samples
        val poses = Domain.integrator.integrate(samples)
        assertEquals(90.0, Math.toDegrees(poses.last().headingRad), 1.0)
        assertEquals(0f, samples.last().steeringDeg) // 원호 끝에서 핸들을 풀어 둠
    }

    @Test fun mainDemoResultDoesNotDependOnNoiseSeed() {
        (1L..15L).forEach { seed ->
            val sc = ScenarioGenerator.pangyoDepartmentStore(seed = seed)
            val r = run(sc)
            assertEquals("seed $seed", 2, r.summary.reverseCount)
            assertEquals("seed $seed", 3, r.summary.switchPoints.size)
            assertEquals("seed $seed", 3, r.summary.steeringTurns)
            assertEquals("seed $seed", ParkingShape.PERPENDICULAR, r.summary.shape)
            assertEquals("seed $seed", FloorEstimate("B2", Confidence.HIGH), r.floor)
        }
    }

    @Test fun mainDemoAnalysedFromEntryTriggerLikeTheSession() {
        // 실제 세션: 진입 감지 시점부터 P까지만 기록해서 분석
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        val detector = Domain.newEntryDetector(sc.spec)
        val entry = sc.samples.indices.first { detector.onSample(sc.samples[it], sc.distanceToTargetM[it]) }
        val recorded = sc.samples.subList(entry, sc.samples.size)
        val r = Domain.process(recorded, sc.spec, sc.lotFloors, sc.entryFloor)
        assertEquals(2, r.summary.reverseCount)
        assertEquals(3, r.summary.switchPoints.size)
        assertEquals(3, r.summary.steeringTurns)
        assertEquals(ParkingShape.PERPENDICULAR, r.summary.shape)
        assertEquals(FloorEstimate("B2", Confidence.HIGH), r.floor)
        assertTrue("${r.summary.durationSec}", r.summary.durationSec in 75..90)
        assertEquals(recorded.size, r.poses.size)
    }
}
