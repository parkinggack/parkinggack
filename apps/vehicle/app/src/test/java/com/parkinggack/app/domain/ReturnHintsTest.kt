package com.parkinggack.app.domain

import com.parkinggack.app.domain.sim.Scenario
import com.parkinggack.app.domain.sim.ScenarioBuilder
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.Pose
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.ParkingSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReturnHintsTest {

    /** 앱과 같은 경로: 세션이 진입을 감지해 자르고 다운샘플한 기록 궤적 (ParkingRecord.trajectory) */
    private fun recorded(sc: Scenario): List<Pose> {
        val s = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
        sc.samples.forEachIndexed { i, x -> s.onSample(x, sc.distanceToTargetM[i]) }
        return (s.state.value as DriveState.Parked).result.trajectory
    }

    private fun built(b: ScenarioBuilder): List<Pose> =
        Domain.integrator.integrate(b.shift(Gear.PARK).build("t", "t", "", listOf("1F")).samples)

    /** 평면: 입구 15m → 왼쪽 → 25m → 오른쪽 → 18m 지나쳐 멈춤 → 후진으로 오른쪽 칸 */
    private fun twoTurns() = built(
        ScenarioBuilder().start(10.0)
            .straight(15.0, 10.0).arc(90.0, 6.0, 8.0).straight(25.0, 8.0).arc(-90.0, 6.0, 8.0).straight(18.0, 7.0)
            .stop(1.0).shift(Gear.REVERSE).arc(90.0, 5.5, 4.0).straight(3.0, 3.0).stop(1.0),
    )

    /** 자리를 찾아 블록을 한 바퀴 돎 (오른쪽 3번) → 입구 뒤쪽 칸 */
    private fun circling() = built(
        ScenarioBuilder().start(10.0)
            .straight(20.0, 10.0).arc(-90.0, 6.0, 8.0).straight(30.0, 8.0).arc(-90.0, 6.0, 8.0).straight(15.0, 8.0)
            .arc(-90.0, 6.0, 8.0).straight(25.0, 8.0).arc(90.0, 5.0, 4.0).straight(3.0, 3.0).stop(1.0),
    )

    /** 나선 램프 2바퀴(시계 방향) → 12m → 오른쪽 → 30m → 왼쪽 칸 */
    private fun spiralThenAisle() = built(
        ScenarioBuilder().start(10.0)
            .straight(20.0, 10.0).arc(-360.0, 6.0, 8.0).straight(5.0, 8.0).arc(-360.0, 6.0, 8.0).straight(12.0, 7.0)
            .arc(-90.0, 6.0, 7.0).straight(30.0, 7.0).arc(90.0, 5.0, 4.0).straight(3.0, 3.0).stop(1.0),
    )

    @Test fun mainDemoStartsWhereTheSpiralRampEnds() {
        val r = ReturnHints.route(recorded(ScenarioGenerator.pangyoDepartmentStore()), "B2")!!
        assertEquals(ReturnRoute.Start.RAMP, r.start)
        // B2 통로를 20m 가다 지나쳐 멈춘 뒤 후진으로 오른쪽 칸 → 칸은 통로 약 15m 지점
        assertEquals(listOf("램프를 다 내려와서 곧장", "오른쪽 칸 줄, 약 15m 지점"), r.lines)
        assertEquals(ReturnRoute.Side.RIGHT, r.stallSide)
        assertEquals(listOf(1, 17, -1), r.code)
    }

    @Test fun mainDemoIgnoresWhatHappenedBeforeTheRamp() {
        // 진입 감지 전 25km/h 접근 구간까지 다 넣어도 램프 끝부터 같은 힌트
        val full = Domain.integrator.integrate(ScenarioGenerator.pangyoDepartmentStore().samples)
        assertEquals(listOf("램프를 다 내려와서 곧장", "오른쪽 칸 줄, 약 15m 지점"), ReturnHints.from(full, "B2"))
    }

    @Test fun flatLotTurnsRightThenLeftStall() {
        val r = ReturnHints.route(recorded(ScenarioGenerator.flatLotSimple()), "1F")!!
        assertEquals(ReturnRoute.Start.ENTRY, r.start)
        assertEquals(listOf("주차장 입구에서 곧장", "약 10m 가서 오른쪽", "왼쪽 칸 줄, 약 30m 지점"), r.lines)
        assertEquals(listOf(0, 10, -1, 32, 1), r.code)
    }

    @Test fun angledStallOnTheLeft() {
        assertEquals(
            listOf("주차장 입구에서 곧장", "왼쪽 칸 줄, 약 45m 지점"),
            ReturnHints.from(recorded(ScenarioGenerator.angledParking())),
        )
    }

    @Test fun parallelParkingOnTheRight() {
        assertEquals(
            listOf("주차장 입구에서 곧장", "오른쪽 칸 줄, 약 20m 지점"),
            ReturnHints.from(recorded(ScenarioGenerator.parallelParking())),
        )
    }

    @Test fun hintsDoNotDependOnNoiseSeed() {
        val expected = ScenarioGenerator.all().map { ReturnHints.from(recorded(it), "B2") }
        (2L..15L).forEach { seed ->
            val got = listOf(
                ScenarioGenerator.pangyoDepartmentStore(seed = seed),
                ScenarioGenerator.parallelParking(seed = seed),
                ScenarioGenerator.angledParking(seed = seed),
                ScenarioGenerator.flatLotSimple(seed = seed),
            ).map { ReturnHints.from(recorded(it), "B2") }
            assertEquals("seed $seed", expected, got)
        }
    }

    @Test fun twoTurnsAreListedInWalkingOrder() {
        val r = ReturnHints.route(twoTurns())!!
        assertEquals(
            listOf("주차장 입구에서 곧장", "약 15m 가서 왼쪽", "약 25m 가서 오른쪽", "오른쪽 칸 줄, 약 15m 지점"),
            r.lines,
        )
        assertEquals(listOf(0, 16, 1, 26, -1, 14, -1), r.code)
    }

    @Test fun manyTurnsCollapseToAStraightLineFromTheEntry() {
        val r = ReturnHints.route(circling())!!
        // 지나온 순서(오른쪽 3번) 대신 입구에서 곧게: 입구 뒤쪽 약 10m, 오른쪽 약 5m
        assertEquals(listOf("주차장 입구에서 뒤쪽으로 약 10m", "오른쪽으로 약 5m"), r.lines)
        assertNull("뒤쪽이면 그림 없음", r.code)
    }

    @Test fun rampWordingFollowsTheFloor() {
        val poses = spiralThenAisle()
        val up = ReturnHints.route(poses, "3F")!!
        assertEquals(listOf("램프를 다 올라와서 곧장", "약 15m 가서 오른쪽", "왼쪽 칸 줄, 약 35m 지점"), up.lines)
        assertEquals(listOf(1, 13, -1, 37, 1), up.code)
        assertEquals("램프를 다 내려와서 곧장", ReturnHints.from(poses, "B3").first())
        assertEquals("램프를 다 지나서 곧장", ReturnHints.from(poses, null).first())
        assertEquals("램프를 다 지나서 곧장", ReturnHints.from(poses, "1F").first())
    }

    @Test fun parkedRightAfterTheRamp() {
        val poses = built(
            ScenarioBuilder().start(8.0).straight(10.0, 8.0).arc(360.0, 6.0, 8.0).straight(2.0, 5.0).stop(1.0),
        )
        assertEquals(listOf("램프를 다 내려온 곳 바로 근처"), ReturnHints.from(poses, "B1"))
    }

    @Test fun emptyOrTinyTrajectoryGivesNothing() {
        assertNull(ReturnHints.route(emptyList()))
        assertTrue(ReturnHints.from(listOf(Pose(0, 0.0, 0.0, 0.0, false))).isEmpty())
        assertTrue(ReturnHints.from(listOf(Pose(0, 0.0, 0.0, 0.0, false), Pose(100, 0.0, 1.0, 0.0, false))).isEmpty())
    }

    @Test fun copyRules() {
        val all = ScenarioGenerator.all().map { ReturnHints.from(recorded(it), "B2") } +
            listOf(twoTurns(), circling(), spiralThenAisle()).map { ReturnHints.from(it, "B2") }
        all.forEach { lines ->
            assertTrue(lines.toString(), lines.size in 1..4)
            lines.forEach { line ->
                assertTrue("짧게: $line", line.length <= 20)
                listOf("실패", "못", "서툴", "위험", "바퀴").forEach { assertFalse("'$it' 금지: $line", line.contains(it)) }
            }
        }
    }

    @Test fun approximateDistances() {
        assertEquals("약 5m", ReturnHints.approx(3.0))
        assertEquals("약 10m", ReturnHints.approx(12.4))
        assertEquals("약 15m", ReturnHints.approx(12.6))
        assertEquals("약 50m", ReturnHints.approx(47.6))
        assertEquals("약 70m", ReturnHints.approx(66.0))
    }

    @Test fun rampDirectionFromFloorName() {
        assertEquals(-1, ReturnHints.rampDirection("B2"))
        assertEquals(-1, ReturnHints.rampDirection("지하1층"))
        assertEquals(1, ReturnHints.rampDirection("3F"))
        assertEquals(1, ReturnHints.rampDirection("2층"))
        assertEquals(0, ReturnHints.rampDirection("1F"))
        assertEquals(0, ReturnHints.rampDirection(null))
        assertEquals(0, ReturnHints.rampDirection("옥상"))
    }
}
