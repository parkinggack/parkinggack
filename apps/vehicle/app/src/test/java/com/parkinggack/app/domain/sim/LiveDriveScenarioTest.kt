package com.parkinggack.app.domain.sim

import com.parkinggack.app.domain.Domain
import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.ParkingSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.ceil

/**
 * 실차 주행 테스트(apps/vehicle/scripts/live-drive/live_drive_test.py)가 Virtual Console로 차에 넣을 신호.
 *
 * 시연(demo.sh)은 앱 안에서 녹화 신호를 재생해 차는 P에 서 있다. 여기 신호는 차를 실제로 굴린다:
 * Virtual Console → Pleos SDK(기어·조향·브레이크) / AAOS PERF_VEHICLE_SPEED → 앱.
 * - 모든 케이스는 P·정지에서 시작한다. 움직이며 시작하는 시연 시나리오는 앞에 P → D → 가속 구간을 붙인다
 * - 기대값은 같은 신호를 앱과 같은 ParkingSession(목적지 없음 = 앱의 Live 경로)에 넣어 계산한다.
 *   기기 결과가 이것과 다르면 판단 로직이 아니라 신호 경로(SDK·VHAL·타이밍) 문제
 * - 실행하면 app/build/live-drive/{id}.csv (ScenarioCodec) + {id}.json (표시·기대 상태 타임라인)을 쓴다
 *
 * 케이스 설계 자체도 여기서 검증한다 (시나리오를 바꿔서 기대가 깨지면 이 테스트가 실패).
 */
class LiveDriveScenarioTest {

    @Test fun liveDriveCasesHoldTheirIntentAndAreExported() {
        val dir = File("build/live-drive").apply { mkdirs() }
        val expects = cases().associate { c ->
            val e = simulate(c.samples)
            assertTrue("${c.id}: Virtual Console 조향 한계 ±540°", c.samples.all { abs(it.steeringDeg) <= 540f })
            assertTrue("${c.id}: P·정지에서 시작", c.samples.first().let { it.gear == Gear.PARK && it.speedMps == 0f })
            File(dir, "${c.id}.csv").writeText(ScenarioCodec.encode(c.samples))
            File(dir, "${c.id}.json").writeText(json(c, e))
            c.id to e
        }

        expects.getValue("main").let { e ->
            val p = assertParked(e)
            assertEquals("B2", p.floor)
            assertEquals(Confidence.HIGH, p.confidence)
            assertEquals(2, p.reverseCount)
        }
        expects.getValue("b3").let { e ->
            val p = assertParked(e)
            assertEquals("B3", p.floor)
            assertEquals(2, p.reverseCount)
        }
        expects.getValue("repark").let { e ->
            val p = assertParked(e)
            assertEquals(1, p.reverseCount)
            // P에서 20초 서 있던 시간은 빠져야 함 (넣으면 40초대)
            assertTrue("duration ${p.durationSec}", p.durationSec in 15..32)
        }
        expects.getValue("parallel").let { e ->
            val p = assertParked(e)
            assertEquals("1F", p.floor)
            assertEquals(1, p.reverseCount)
        }
        expects.getValue("leave").let { e ->
            assertTrue("주차장 안에서 기록이 시작돼야 함", e.everRecorded)
            assertNull("빠르게 나가면 기록 취소 → 주차 카드 없음", e.parked)
            assertEquals("idle", e.timeline.last().state)
        }
        expects.getValue("jam").let { e ->
            assertFalse("정체 구간은 주차로 오인하면 안 됨", e.everRecorded)
            assertNull(e.parked)
        }
    }

    private fun assertParked(e: Expect): ParkedExpect = assertNotNull(e.parked).let { e.parked!! }

    // ---------------- 케이스 ----------------

    class LiveCase(val id: String, val title: String, val samples: List<VehicleSample>, val marks: Map<String, Long>)

    private fun cases(): List<LiveCase> = listOf(
        fromRest(
            "main", "판교 백화점 지하: 25 km/h 접근 → 나선 램프 2바퀴 → 지나쳐 멈춤 → 후진 2번 직각주차",
            ScenarioGenerator.pangyoDepartmentStore(),
        ),
        fromRest(
            "b3", "지하 3층: 25 km/h 접근 → 나선 램프 3바퀴 → 지나쳐 멈춤 → 후진 2번 직각주차",
            ScenarioGenerator.seedPerpendicular(reverses = 2, rampTurns = 3, seed = 33L),
        ),
        built(
            "repark", "P에서 20초 대기 → 같은 층 옆 칸으로 옮겨 대기 (후진 1번, 고속 구간 없음)",
            ScenarioBuilder(seed = 11L).start().hold(20.0).mark("drive").shift(Gear.DRIVE)
                .straight(8.0, 8.0).arc(90.0, 6.0, 6.0).straight(4.0, 5.0).stop(1.0)
                .shift(Gear.REVERSE).mark("reverse").straight(3.5, 3.0).stop(1.0)
                .shift(Gear.DRIVE).straight(0.6, 2.0).stop(1.0)
                .shift(Gear.PARK).mark("parked").hold(2.0),
        ),
        fromRest(
            "parallel", "노상 평행주차: 20 km/h 접근 → 후진 S자 → 앞으로 맞춤",
            ScenarioGenerator.parallelParking(),
        ),
        built(
            "leave", "주차장 안을 돌다 후진 한 번 → 대지 않고 40 km/h로 나감 (기록 취소)",
            ScenarioBuilder(seed = 12L).start().hold(3.0).shift(Gear.DRIVE).mark("enter")
                .straight(12.0, 8.0).arc(120.0, 8.0, 8.0).straight(6.0, 6.0).stop(1.0)
                .shift(Gear.REVERSE).mark("reverse").straight(2.5, 3.0).stop(1.0)
                .shift(Gear.DRIVE).mark("exit").straight(220.0, 40.0).stop(1.0)
                .shift(Gear.PARK).mark("parked").hold(3.0),
        ),
        built(
            "jam", "정체 구간 서다 가다 약 50초 (후진·큰 회전 없음) → 45 km/h → 길가에 P",
            ScenarioBuilder(seed = 13L).start().hold(3.0).shift(Gear.DRIVE).mark("jam").apply {
                repeat(5) { i ->
                    straight(15.0, 12.0)
                    if (i == 2) arc(20.0, 40.0, 10.0) // 완만한 굽은 길
                    stop(3.0)
                }
            }.mark("free").straight(200.0, 45.0).stop(1.0)
                .shift(Gear.PARK).mark("parked").hold(3.0),
        ),
    )

    private fun built(id: String, title: String, b: ScenarioBuilder): LiveCase {
        val sc = b.build(id = id, title = title, description = title, lotFloors = emptyList())
        return LiveCase(id, title, sc.samples, sc.marks)
    }

    /** 움직이며 시작하는 시나리오 앞에 P 5초 → D(브레이크) 1초 → 1 m/s² 가속을 붙인다 */
    private fun fromRest(id: String, title: String, sc: Scenario): LiveCase {
        val first = sc.samples.first()
        val out = ArrayList<VehicleSample>()
        var t = 0L
        repeat(50) { out += VehicleSample(t, 0f, 0f, Gear.PARK, false); t += 100 }
        repeat(10) { out += VehicleSample(t, 0f, 0f, Gear.DRIVE, true); t += 100 }
        val v0 = first.speedMps
        val n = ceil(v0 / 1.0 / 0.1).toInt()
        for (i in 1..n) { out += VehicleSample(t, v0 * i / n, 0f, Gear.DRIVE, false); t += 100 }
        val shift = t - first.timestampMs
        sc.samples.forEach { out += it.copy(timestampMs = it.timestampMs + shift) }
        return LiveCase(id, title, out, mapOf("leadInEnd" to t) + sc.marks.mapValues { it.value + shift })
    }

    // ---------------- 기대값 (앱과 같은 세션 로직) ----------------

    data class Point(val tMs: Long, val state: String, val rc: Int, val el: Int)
    data class ParkedExpect(
        val atMs: Long, val floor: String, val confidence: Confidence, val reverseCount: Int,
        val durationSec: Int, val shape: String, val approximate: Boolean,
    )
    data class Expect(val timeline: List<Point>, val everRecorded: Boolean, val parked: ParkedExpect?)

    private fun simulate(samples: List<VehicleSample>): Expect {
        val s = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
        val t0 = samples.first().timestampMs
        val timeline = ArrayList<Point>()
        var ever = false
        var parked: ParkedExpect? = null
        var lastKey = ""
        var lastT = Long.MIN_VALUE / 2
        for (x in samples) {
            s.onSample(x, null)
            val rel = x.timestampMs - t0
            val p = when (val st = s.state.value) {
                DriveState.Idle -> Point(rel, "idle", 0, 0)
                DriveState.Driving -> Point(rel, "driving", 0, 0)
                is DriveState.Recording -> { ever = true; Point(rel, "recording", st.reverseCount, st.elapsedSec) }
                is DriveState.Parked -> {
                    val r = st.result
                    if (parked == null) parked = ParkedExpect(
                        rel, r.estimate.floor, r.estimate.confidence, r.summary.reverseCount,
                        r.summary.durationSec, r.summary.shape.name, r.summary.approximate,
                    )
                    Point(rel, "parked", r.summary.reverseCount, r.summary.durationSec)
                }
            }
            val key = "${p.state}/${p.rc}"
            if (key != lastKey || rel - lastT >= 500) { timeline += p; lastKey = key; lastT = rel }
        }
        return Expect(timeline, ever, parked)
    }

    // ---------------- JSON (의존성 없이) ----------------

    private fun json(c: LiveCase, e: Expect): String = buildString {
        val t0 = c.samples.first().timestampMs
        append("{\n")
        append("  \"id\": ").append(q(c.id)).append(",\n")
        append("  \"title\": ").append(q(c.title)).append(",\n")
        append("  \"durationMs\": ").append(c.samples.last().timestampMs - t0).append(",\n")
        append("  \"marks\": {")
        append(c.marks.entries.joinToString(", ") { "${q(it.key)}: ${it.value - t0}" })
        append("},\n")
        append("  \"expect\": {\"everRecorded\": ").append(e.everRecorded).append(", \"parked\": ")
        val p = e.parked
        if (p == null) append("null") else append(
            "{\"atMs\": ${p.atMs}, \"floor\": ${q(p.floor)}, \"confidence\": ${q(p.confidence.name)}, " +
                "\"reverseCount\": ${p.reverseCount}, \"durationSec\": ${p.durationSec}, " +
                "\"shape\": ${q(p.shape)}, \"approximate\": ${p.approximate}}",
        )
        append("},\n")
        append("  \"timeline\": [\n")
        append(e.timeline.joinToString(",\n") { "    [${it.tMs}, ${q(it.state)}, ${it.rc}, ${it.el}]" })
        append("\n  ]\n}\n")
    }

    private fun q(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
