package com.parkinggack.app.domain

import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ManeuverAnalyzerTest {
    private val analyzer = DefaultManeuverAnalyzer()
    private val integrator = BicycleTrajectoryIntegrator()

    private fun analyze(samples: List<VehicleSample>) = analyzer.analyze(samples, integrator.integrate(samples, com.parkinggack.app.model.VehicleSpec()))

    @Test fun emptyInput() {
        val s = analyzer.analyze(emptyList(), emptyList())
        assertEquals(0, s.reverseCount)
        assertTrue(s.approximate)
    }

    @Test fun reverseBlipUnderThirtyCentimetresIsIgnored() {
        val samples = cleanBuilder()
            .start(10.0).straight(20.0, 8.0).stop(1.0)
            .shift(Gear.REVERSE).straight(0.05, 1.0).stop(0.5) // 기어 깜빡임 수준
            .shift(Gear.DRIVE).straight(10.0, 5.0).stop(1.0)
            .shift(Gear.PARK).build("t", "t", "t", listOf("1F")).samples
        val s = analyze(samples)
        assertEquals(0, s.reverseCount)
        assertTrue(s.switchPoints.isEmpty())
    }

    @Test fun reverseReEnteredWithoutForwardCountsTwiceButOneSwitch() {
        val samples = cleanBuilder()
            .start(8.0).straight(15.0, 8.0).stop(1.0)
            .shift(Gear.REVERSE).straight(2.0, 3.0).stop(0.5)
            .shift(Gear.PARK).shift(Gear.REVERSE).straight(1.0, 3.0).stop(0.5) // R → P → R
            .shift(Gear.PARK).build("t", "t", "t", listOf("1F")).samples
        val s = analyze(samples)
        assertEquals(2, s.reverseCount)
        assertEquals(1, s.switchPoints.size)
        assertTrue(s.switchPoints[0].toReverse)
        assertEquals(1, s.switchPoints[0].index)
    }

    @Test fun switchPointIsWhereNewGearEngaged() {
        val s = analyze(ScenarioGenerator.pangyoDepartmentStore().samples)
        val sc = ScenarioGenerator.pangyoDepartmentStore()
        listOf("switch1", "switch2", "switch3").forEachIndexed { i, mark ->
            val sp = s.switchPoints[i]
            assertEquals(i + 1, sp.index)
            // shift()는 기어를 바꾸고 0.4초 대기 뒤 mark → 전환점은 그 직전
            assertTrue("$mark ${sp.tMs} vs ${sc.marks[mark]}", kotlin.math.abs(sp.tMs - sc.marks.getValue(mark)) <= 500)
        }
    }

    @Test fun drySteeringAtStandstillIsNotCounted() {
        val samples = cleanBuilder()
            .start(8.0).straight(15.0, 8.0).stop(1.0)
            .steerInPlace(450.0).steerInPlace(-450.0).steerInPlace(0.0)
            .straight(5.0, 5.0).stop(1.0).shift(Gear.PARK)
            .build("t", "t", "t", listOf("1F")).samples
        assertEquals(0, analyze(samples).steeringTurns)
    }

    @Test fun uTurnAndCornersAreNotRamp() {
        val samples = cleanBuilder()
            .start(10.0).straight(20.0, 10.0)
            .arc(90.0, 8.0, 10.0).straight(30.0, 10.0) // 모퉁이
            .arc(180.0, 6.0, 8.0).straight(20.0, 8.0) // 유턴
            .stop(1.0).shift(Gear.PARK)
            .build("t", "t", "t", listOf("1F")).samples
        val s = analyze(samples)
        assertEquals(0.0, s.rampTurns, 0.0)
        assertEquals(0.75, s.netTurns, 0.02)
        assertEquals(2, s.steeringTurns)
    }

    @Test fun spiralTurnsAreAccumulatedAcrossShortLandings() {
        val samples = cleanBuilder()
            .start(8.0).straight(10.0, 8.0)
            .arc(-360.0, 7.0, 8.0).straight(5.0, 8.0) // 오른쪽 나선, 층마다 짧은 직선
            .arc(-360.0, 7.0, 8.0).straight(5.0, 8.0)
            .arc(-360.0, 7.0, 8.0).straight(15.0, 8.0)
            .stop(1.0).shift(Gear.PARK)
            .build("t", "t", "t", listOf("1F")).samples
        val s = analyze(samples)
        assertEquals(3.0, s.rampTurns, 0.05)
        assertEquals(-3.0, s.netTurns, 0.05)
        assertEquals(0, s.steeringTurns) // 램프를 도는 동안 감고 있던 건 '꺾음'이 아님
    }

    @Test fun brakeCountIsNullWithoutBrakeSignal() {
        val samples = ScenarioGenerator.flatLotSimple().samples.map { it.copy(brakePressed = null) }
        assertNull(analyze(samples).brakeCount)
    }

    @Test fun brakeCountCountsRisingEdges() {
        val samples = constantSamples(10, speed = 1f, brake = false) +
            constantSamples(5, speed = 1f, brake = true, t0 = 1_000) +
            constantSamples(5, speed = 1f, brake = null, t0 = 1_500) + // 모름 → 상태 유지
            constantSamples(5, speed = 1f, brake = false, t0 = 2_000) +
            constantSamples(5, speed = 1f, brake = true, t0 = 2_500)
        assertEquals(2, analyze(samples).brakeCount)
    }

    @Test fun durationAndShapeComeThrough() {
        val s = analyze(ScenarioGenerator.angledParking().samples)
        assertTrue("${s.durationSec}", s.durationSec in 40..44)
        assertEquals(com.parkinggack.app.model.ParkingShape.ANGLED, s.shape)
        assertFalse(s.approximate)
    }

    @Test fun mismatchedPosesAreRecomputed() {
        val samples = ScenarioGenerator.pangyoDepartmentStore().samples
        val s = analyzer.analyze(samples, emptyList())
        assertEquals(2, s.reverseCount)
        assertEquals(2.0, s.rampTurns, 0.1)
    }

    // ---- approximate ----

    @Test fun longSignalGapMakesItApproximate() {
        val samples = ScenarioGenerator.pangyoDepartmentStore().samples
        val cut = samples.filterNot { it.timestampMs in 70_000L..74_000L }
        assertFalse(analyze(samples).approximate)
        assertTrue(analyze(cut).approximate)
    }

    @Test fun manySmallGapsMakeItApproximate() {
        val samples = ScenarioGenerator.flatLotSimple().samples
        // 2초마다 1.5초씩 끊김 (각 끊김은 3초 이하지만 합이 큼)
        val choppy = samples.filter { (it.timestampMs % 2_000) !in 300L..1_700L }
        assertTrue(analyze(choppy).approximate)
    }

    @Test fun veryShortRecordingIsApproximate() {
        assertTrue(analyze(constantSamples(10, speed = 1f)).approximate)
        assertTrue(analyze(constantSamples(100, speed = 0.02f)).approximate) // 10초인데 거의 안 움직임
    }

    @Test fun zeroSpeedWhileInGearWithoutBrakeIsApproximate() {
        // 막바지 저속에서 차속이 0으로 읽히는 상황: D인데 0 km/h, 브레이크도 안 밟음
        val moving = constantSamples(100, speed = 2f)
        val stuck = constantSamples(100, speed = 0f, t0 = 10_000, brake = false)
        assertTrue(analyze(moving + stuck).approximate)
        val braking = constantSamples(100, speed = 0f, t0 = 10_000, brake = true)
        assertFalse(analyze(moving + braking).approximate)
    }
}
