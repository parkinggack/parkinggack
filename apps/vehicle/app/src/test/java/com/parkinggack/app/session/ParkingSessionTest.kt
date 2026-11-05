package com.parkinggack.app.session

import com.parkinggack.app.data.SeedLots
import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.VehicleSample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ParkingSessionTest {

    private fun session() = ParkingSession(
        Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector(),
    )

    @Test fun mainDemoWithoutTargetDistanceEndsParkedAtB2() {
        val s = session().apply { targetLot = SeedLots.avenueFrance }
        val scenario = ScenarioGenerator.mainDemo()
        var sawRecording = false
        scenario.samples.forEach { sample ->
            s.onSample(sample, null) // 리플레이 시연과 같은 조건 (거리 정보 없음)
            if (s.state.value is DriveState.Recording) sawRecording = true
        }
        assertTrue("기록 상태를 거쳐야 함", sawRecording)
        val parked = s.state.value as DriveState.Parked
        val r = parked.result
        assertEquals(2, r.summary.reverseCount)
        assertEquals(3, r.summary.switchPoints.size)
        assertEquals(ParkingShape.PERPENDICULAR, r.summary.shape)
        assertEquals("B2", r.estimate.floor)
        assertEquals(Confidence.HIGH, r.estimate.confidence)
        assertEquals(SeedLots.avenueFrance, r.lot)
        // 진입 전 25km/h 구간은 빠지고, 램프는 포함
        assertTrue("duration ${r.summary.durationSec}", r.summary.durationSec in 80..100)
        assertTrue(r.displayTrajectory.isNotEmpty() && r.displayTrajectory.size <= r.trajectory.size + 1)
    }

    @Test fun inLotMaxSpeedIgnoresEntrySlowdownAndSpikes() {
        val s = session().apply { targetLot = SeedLots.avenueFrance }
        ScenarioGenerator.mainDemo().samples.forEach { s.onSample(it, null) }
        val max = (s.state.value as DriveState.Parked).result.summary.maxSpeedKmh!!
        assertTrue("시연 주행은 주차장 안 10km/h 이하여야 주차왕에서 빠지지 않음: $max", max <= 10.0)

        // 진입 감속(14→9) 뒤 9km/h, 중간에 한 샘플만 13 → 빠지지 않음 / 1초 넘게 13 → 빠짐
        fun samples(vararg kmh: Double) = kmh.mapIndexed { i, v -> VehicleSample(i * 100L, (v / 3.6).toFloat(), 0f, Gear.DRIVE) }
        val base = doubleArrayOf(14.0, 12.0, 10.5, 9.0, 9.0, 9.0, 9.0)
        assertTrue(s.inLotMaxSpeedKmh(samples(*base, 13.0, 9.0, 9.0, 9.0, 9.0))!! <= 10.0)
        assertTrue(s.inLotMaxSpeedKmh(samples(*base, *DoubleArray(12) { 13.0 }, 9.0))!! > 10.0)
    }

    @Test fun mainDemoWithTargetDistanceAlsoWorks() {
        val s = session().apply { targetLot = SeedLots.avenueFrance }
        val sc = ScenarioGenerator.mainDemo()
        sc.samples.forEachIndexed { i, sample -> s.onSample(sample, sc.distanceToTargetM[i]) }
        val r = (s.state.value as DriveState.Parked).result
        assertEquals("B2", r.estimate.floor)
        assertEquals(2, r.summary.reverseCount)
    }

    @Test fun leavingFastCancelsRecording() {
        val s = session()
        val sc = ScenarioGenerator.mainDemo()
        val rampStart = sc.marks["rampEnd"] ?: sc.samples[sc.samples.size / 2].timestampMs
        sc.samples.takeWhile { it.timestampMs <= rampStart }.forEach { s.onSample(it, null) }
        assertTrue(s.state.value is DriveState.Recording)
        val t0 = sc.samples.last { it.timestampMs <= rampStart }.timestampMs
        (1..150).forEach { i -> s.onSample(VehicleSample(t0 + i * 100L, 12f, 0f, Gear.DRIVE), null) }
        assertEquals(DriveState.Driving, s.state.value)
    }

    @Test fun timeWaitingInParkIsNotCountedAsParkingTime() {
        // 시동 걸고 P로 30초 대기 → 저속 D 12초 → 후진 2초 → 정지 → P. 고속 구간이 없어도 P 대기는 기록에서 빠져야 함
        val s = session()
        var t = 0L
        fun feed(n: Int, speed: Float, gear: Gear) = repeat(n) { s.onSample(VehicleSample(t, speed, 0f, gear, false), null); t += 100 }
        feed(300, 0f, Gear.PARK)
        feed(120, 2f, Gear.DRIVE)
        feed(20, 1f, Gear.REVERSE)
        assertTrue("후진 1 m 넘으면 기록 시작", s.state.value is DriveState.Recording)
        // 기록 시작 = 첫 D 샘플(30.0 s), 지금 43.9 s → 13초 (P 대기까지 넣으면 43초)
        assertEquals(13, (s.state.value as DriveState.Recording).elapsedSec)
        feed(10, 0f, Gear.REVERSE)
        feed(1, 0f, Gear.PARK)
        val r = (s.state.value as DriveState.Parked).result
        assertTrue("duration ${r.summary.durationSec}", r.summary.durationSec in 14..16)
        assertEquals(1, r.summary.reverseCount)
    }

    @Test fun parkingWithoutRecordingGoesIdle() {
        val s = session()
        s.onSample(VehicleSample(0, 5f, 0f, Gear.DRIVE), null)
        assertEquals(DriveState.Driving, s.state.value)
        s.onSample(VehicleSample(100, 0f, 0f, Gear.PARK), null)
        assertEquals(DriveState.Idle, s.state.value)
    }

    // ---- docs/sim-findings.md 1-5: 정해 둔 주차장에서 먼 곳에 대면 그 주차장으로 기록하지 않는다 ----

    private fun parkWithTargetDistance(distanceAtP: Double?): ParkingResult {
        val s = session().apply { targetLot = SeedLots.avenueFrance }
        val sc = ScenarioGenerator.mainDemo()
        // 진입 감지는 시나리오 거리 그대로, 주차장 확인은 내비 현재 위치에서 잰 거리(여기선 고정값)
        sc.samples.forEachIndexed { i, sample -> s.onSample(sample, sc.distanceToTargetM[i], targetDistanceM = distanceAtP) }
        return (s.state.value as DriveState.Parked).result
    }

    @Test fun targetLotIsDroppedWhenParkedFarFromIt() {
        val r = parkWithTargetDistance(2_700.0) // X13: 경유지 현대백화점, 실제로는 2.7 km 떨어진 시흥동에 주차
        assertEquals(null, r.lot)
        assertEquals(SeedLots.avenueFrance, r.droppedFarTarget)
    }

    @Test fun targetLotIsKeptWhenNearOrUnknown() {
        assertEquals(SeedLots.avenueFrance, parkWithTargetDistance(180.0).lot) // 큰 지하주차장 안 (대표 좌표에서 수백 m)
        assertEquals(SeedLots.avenueFrance, parkWithTargetDistance(null).lot) // 위치 모름 → 확인하지 않음 (예전 동작)
    }
}
