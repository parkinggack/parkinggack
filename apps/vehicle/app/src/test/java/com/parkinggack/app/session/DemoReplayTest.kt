package com.parkinggack.app.session

import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.sim.Scenario
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 시연 재생(demo.sh / scripts/sim.sh)이 앱에서 C-05까지 가는지 — AppController가 세션에 넣는 그대로.
 * 재생은 시나리오의 '주차장 입구까지 거리'를 같이 넣어야 한다: 거리가 없으면 진입 감지는 규칙 B
 * (후진 1 m 또는 누적 회전 200°)뿐이라 앞으로 바로 대는 사선·평면 주차는 기록이 시작되지 않는다.
 */
class DemoReplayTest {

    private fun session() = ParkingSession(
        Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector(),
    )

    private fun feed(sc: Scenario, withDistance: Boolean): ParkingSession = session().apply {
        sc.samples.forEachIndexed { i, s -> onSample(s, if (withDistance) sc.distanceToTargetM[i] else null) }
    }

    @Test fun everyDemoScenarioReachesParkedWhenDistancesAreFed() {
        (ScenarioGenerator.all() + ScenarioGenerator.splitLevel()).forEach { sc ->
            assertTrue(sc.id, feed(sc, withDistance = true).state.value is DriveState.Parked)
        }
    }

    @Test fun forwardOnlyParkingNeedsTheDistance() {
        listOf(ScenarioGenerator.angledParking(), ScenarioGenerator.flatLotSimple()).forEach { sc ->
            assertFalse(sc.id, feed(sc, withDistance = false).state.value is DriveState.Parked)
        }
    }

    @Test fun distancesDoNotChangeWhereTheRecordingStarts() {
        // 기록 시작은 '마지막 고속 샘플 다음'이라 규칙 A로 일찍 잡혀도 결과(걸린 시간·후진)는 같다
        listOf(ScenarioGenerator.pangyoDepartmentStore(), ScenarioGenerator.parallelParking()).forEach { sc ->
            val a = (feed(sc, withDistance = true).state.value as DriveState.Parked).result.summary
            val b = (feed(sc, withDistance = false).state.value as DriveState.Parked).result.summary
            assertEquals(sc.id, b.durationSec, a.durationSec)
            assertEquals(sc.id, b.reverseCount, a.reverseCount)
        }
    }

    @Test fun replaySourcePairsEachSampleWithItsDistance() = runBlocking {
        val recorded = (0 until 4).map { VehicleSample(it * 100L, 1f, 0f, Gear.DRIVE, false) }
        val got = ReplaySignalSource(recorded, speedFactor = 8.0, distances = listOf(30.0, 20.0, null, 5.0)).withDistance.toList()
        assertEquals(listOf(30.0, 20.0, null, 5.0), got.map { it.second })
        assertEquals(listOf(0L, 100L, 200L, 300L), got.map { it.first.timestampMs - got.first().first.timestampMs })
        // 거리를 안 주면 null (예전 동작)
        assertTrue(ReplaySignalSource(recorded, 8.0).withDistance.toList().all { it.second == null })
    }
}
