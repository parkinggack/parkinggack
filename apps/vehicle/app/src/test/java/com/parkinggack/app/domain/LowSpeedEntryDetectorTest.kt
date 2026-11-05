package com.parkinggack.app.domain

import com.parkinggack.app.domain.sim.Scenario
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.Gear
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LowSpeedEntryDetectorTest {

    /** 시나리오를 흘려 처음 true가 나온 샘플 인덱스 (거리: 시나리오 값 / 고정값 / null) */
    private fun replay(
        sc: Scenario,
        detector: ParkingEntryDetector = LowSpeedEntryDetector(sc.spec),
        distance: (Int) -> Double? = { sc.distanceToTargetM[it] },
    ): Int? {
        var first: Int? = null
        var count = 0
        sc.samples.forEachIndexed { i, s ->
            if (detector.onSample(s, distance(i))) { count++; if (first == null) first = i }
        }
        assertTrue("triggered $count times", count <= 1)
        return first
    }

    @Test fun mainDemoTriggersOnRampApproachNotDuringFastApproach() {
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        val idx = replay(sc)
        assertNotNull(idx)
        val s = sc.samples[idx!!]
        assertTrue("speed ${s.speedMps * 3.6} km/h", s.speedMps * 3.6 < 15.0)
        assertTrue("t=${s.timestampMs} after 25 km/h approach", s.timestampMs > sc.marks.getValue("approachEnd"))
        assertTrue("t=${s.timestampMs} before ramp ${sc.marks["rampStart"]}", s.timestampMs <= sc.marks.getValue("rampStart"))
        // 25 km/h 접근 구간에서는 한 번도 안 걸림 (그 구간만 따로 흘려도)
        val approach = sc.samples.indices.filter { sc.samples[it].timestampMs <= sc.marks.getValue("approachEnd") }
        val d = LowSpeedEntryDetector(sc.spec)
        assertFalse(approach.any { d.onSample(sc.samples[it], sc.distanceToTargetM[it]) })
    }

    @Test fun withoutDestinationTriggersOnTheSpiral() {
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        val idx = replay(sc, distance = { null })!!
        val t = sc.samples[idx].timestampMs
        assertTrue("t=$t", t > sc.marks.getValue("rampStart") && t < sc.marks.getValue("rampEnd"))
    }

    @Test fun withoutDestinationReverseAlsoTriggers() {
        val sc = ScenarioGenerator.parallelParking()
        val idx = replay(sc, distance = { null })!!
        assertEquals(Gear.REVERSE, sc.samples[idx].gear)
    }

    @Test fun farFromDestinationNeedsFallback() {
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        assertNull(replay(sc, LowSpeedEntryDetector(sc.spec, fallbackWhenFar = false), distance = { 5_000.0 }))
        assertNotNull(replay(sc, LowSpeedEntryDetector(sc.spec, fallbackWhenFar = true), distance = { 5_000.0 }))
    }

    @Test fun allScenariosTriggerBeforeParking() {
        ScenarioGenerator.all().forEach { sc ->
            val idx = replay(sc)
            assertNotNull(sc.id, idx)
            assertTrue(sc.id, sc.samples[idx!!].timestampMs < sc.marks.getValue("parked"))
        }
    }

    @Test fun redLightNearDestinationDoesNotTrigger() {
        val sc = cleanBuilder()
            .start(40.0).straight(150.0, 40.0)
            .stop(30.0) // 신호 대기
            .straight(150.0, 40.0)
            .build("city", "city", "", listOf("1F"))
        assertNull(replay(sc, distance = { 200.0 }))
        assertNull(replay(sc, distance = { null }))
    }

    @Test fun parkResetsTheLowSpeedRun() {
        val sc = cleanBuilder()
            .start(8.0).straight(8.0, 8.0).stop(0.5).shift(Gear.PARK).hold(2.0)
            .shift(Gear.DRIVE).straight(8.0, 8.0).stop(0.5).shift(Gear.PARK)
            .build("t", "t", "", listOf("1F"))
        // 각 저속 구간이 20 m가 안 됨 → P에서 끊기므로 합쳐서 세지 않음
        assertNull(replay(sc, distance = { 50.0 }))
    }

    @Test fun firesOnceUntilReset() {
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        val detector = LowSpeedEntryDetector(sc.spec)
        val first = replay(sc, detector)
        assertNotNull(first)
        assertNotNull(detector.triggeredAtMs)
        assertNull(replay(sc, detector)) // 이미 감지됨
        detector.reset()
        assertNull(detector.triggeredAtMs)
        assertEquals(first, replay(sc, detector))
    }

    @Test fun facadeGivesFreshDetectors() {
        val a = Domain.newEntryDetector()
        val b = Domain.newEntryDetector()
        assertFalse(a === b)
    }
}
