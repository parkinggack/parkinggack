package com.parkinggack.app.ui.screens

import com.parkinggack.app.model.CardTiming
import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.FloorCongestion
import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.model.KingBoard
import com.parkinggack.app.model.KingRow
import com.parkinggack.app.model.KingScoreParts
import com.parkinggack.app.model.KingStanding
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.LotStats
import com.parkinggack.app.model.LotSuggestion
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.ReasonTag
import com.parkinggack.app.model.SwitchPoint
import com.parkinggack.app.model.UserSettings
import com.parkinggack.app.model.ZoneScheme
import java.time.LocalDateTime
import java.time.ZoneId
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * @Preview용 예시 데이터 (시안 수치 그대로). 장소 이름은 실제 판교 장소, 별점·대수는 시연용 예시.
 */
object PreviewData {

    // ── 주차장 ────────────────────────────────────────────────────────────────

    val hyundaiStats = LotStats(
        avgReverse = 3.2, overallAvgReverse = 1.4,
        avgRampTurns = 2.5, overallAvgRampTurns = 0.8,
        avgDurationSec = 130, overallAvgDurationSec = 65,
        congestionLabel = "평일 오후",
        floorCongestion = listOf(
            FloorCongestion("B1", 1.0), FloorCongestion("B2", 0.85), FloorCongestion("B3", 0.55),
            FloorCongestion("B4", 0.30), FloorCongestion("B5", 0.15),
        ),
        congestionSummary = "B1 만차 · B3부터 여유",
        hourlyHeat = listOf(
            listOf(0, 1, 2, 2, 3, 2, 1),
            listOf(0, 1, 2, 2, 3, 2, 1),
            listOf(0, 1, 2, 3, 3, 2, 1),
            listOf(0, 1, 2, 3, 3, 3, 1),
            listOf(0, 1, 2, 3, 4, 4, 2),
            listOf(1, 2, 4, 4, 4, 3, 2),
            listOf(1, 2, 4, 4, 3, 2, 1),
        ).map { row -> row.map { it / 4.0 } },
        hourLabels = listOf("8시", "10", "12", "14", "16", "18", "20"),
    )

    val hyundai = ParkingLot(
        id = "hyundai-pangyo",
        name = "현대백화점 판교점 지하주차장",
        location = LatLng(37.3925, 127.1120),
        difficulty = Difficulty(4.3),
        tags = listOf(ReasonTag.SPIRAL_RAMP, ReasonTag.MANY_PILLARS),
        statChips = listOf("평균 후진 3.2회"),
        sampleCount = 142,
        floors = listOf("1F", "B1", "B2", "B3", "B4", "B5"),
        stats = hyundaiStats,
    )

    val avenuefrance = ParkingLot(
        id = "avenuefrance-pangyo",
        name = "아브뉴프랑 판교 주차장",
        location = LatLng(37.3946, 127.1105),
        difficulty = Difficulty(1.8),
        tags = listOf(ReasonTag.FLAT, ReasonTag.SPACIOUS),
        sampleCount = 87,
        floors = listOf("2F", "1F", "B1", "B2", "B3", "B4", "B5"),
        zoneScheme = ZoneScheme(description = "기둥 색 + 알파벳 A–H · 기둥 번호 01–12"),
    )

    val alphadom = ParkingLot(
        id = "alphadom",
        name = "알파돔타워 주차장",
        location = LatLng(37.3940, 127.1092),
        difficulty = Difficulty(2.4),
        tags = listOf(ReasonTag.SPACIOUS),
        sampleCount = 64,
        floors = listOf("1F", "B1", "B2", "B3"),
    )

    val hwarang = ParkingLot(
        id = "hwarang-park",
        name = "화랑공원 공영주차장",
        location = LatLng(37.3898, 127.1150),
        difficulty = Difficulty(2.9),
        tags = listOf(ReasonTag.FLAT),
        sampleCount = 41,
        floors = listOf("1F"),
    )

    val home = ParkingLot(
        id = "home", name = "집 · 백현마을 5단지", location = LatLng(37.3880, 127.1060),
        difficulty = Difficulty(1.4), tags = listOf(ReasonTag.FLAT, ReasonTag.SPACIOUS), sampleCount = 33,
        floors = listOf("B1", "B2"),
    )

    val office = ParkingLot(
        id = "office", name = "회사 · H스퀘어", location = LatLng(37.4020, 127.1080),
        difficulty = Difficulty(3.1), tags = listOf(ReasonTag.NARROW_AISLE), sampleCount = 58,
        floors = listOf("1F", "B1", "B2", "B3", "B4"),
    )

    val hyundaiShort = hyundai.copy(name = "현대백화점 판교점")

    /** 데이터 부족 (3대) */
    val sparseLot = ParkingLot(
        id = "pangyo-tech", name = "판교테크원 주차장", location = LatLng(37.4010, 127.1110),
        difficulty = null, tags = emptyList(), sampleCount = 3,
        floors = listOf("1F", "B1", "B2", "B3", "B4"),
        publicInfo = listOf("기계식 아님 · 지하 4층까지"),
    )

    val favorites = listOf(home, office, hyundaiShort)

    val suggestions = listOf(
        LotSuggestion(avenuefrance, 4, "걸어서 4분, 훨씬 넓어요"),
        LotSuggestion(alphadom, 6, "걸어서 6분"),
        LotSuggestion(hwarang, 9, "걸어서 9분"),
    )

    // ── 동선 (위에서 본 궤적) ─────────────────────────────────────────────────

    private class Key(val x: Double, val y: Double, val headingDeg: Double, val tSec: Double)

    private fun fwd(deg: Double): Pair<Double, Double> {
        val r = Math.toRadians(deg)
        return -sin(r) to cos(r)
    }

    /** 두 자세 사이를 3차 베지어로 잇고, 접선으로 방향을 계산 */
    private fun segment(a: Key, b: Key, reverse: Boolean, steps: Int = 24): List<Pose> {
        val sgn = if (reverse) -1.0 else 1.0
        val (ax, ay) = fwd(a.headingDeg)
        val (bx, by) = fwd(b.headingDeg)
        val l = hypot(b.x - a.x, b.y - a.y) * 0.42
        val p1x = a.x + ax * sgn * l
        val p1y = a.y + ay * sgn * l
        val p2x = b.x - bx * sgn * l
        val p2y = b.y - by * sgn * l
        return (0..steps).map { i ->
            val t = i.toDouble() / steps
            val mt = 1 - t
            val x = mt * mt * mt * a.x + 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t * b.x
            val y = mt * mt * mt * a.y + 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t * b.y
            var tx = 3 * mt * mt * (p1x - a.x) + 6 * mt * t * (p2x - p1x) + 3 * t * t * (b.x - p2x)
            var ty = 3 * mt * mt * (p1y - a.y) + 6 * mt * t * (p2y - p1y) + 3 * t * t * (b.y - p2y)
            if (hypot(tx, ty) < 1e-6) { tx = ax * sgn; ty = ay * sgn }
            // 앞 방향 = 진행 방향 (후진이면 반대) → heading = atan2(-fx, fy)
            val fx = tx * sgn
            val fy = ty * sgn
            val tMs = ((a.tSec + (b.tSec - a.tSec) * t) * 1000).toLong()
            Pose(tMs, x, y, atan2(-fx, fy), reverse)
        }
    }

    private fun build(keys: List<Key>, reverse: List<Boolean>): Pair<List<Pose>, List<SwitchPoint>> {
        val poses = mutableListOf<Pose>()
        keys.zipWithNext().forEachIndexed { i, (a, b) ->
            val seg = segment(a, b, reverse[i])
            poses += if (i == 0) seg else seg.drop(1)
        }
        val switches = mutableListOf<SwitchPoint>()
        for (i in 1 until reverse.size) {
            if (reverse[i] != reverse[i - 1]) {
                val k = keys[i]
                val pose = Pose((k.tSec * 1000).toLong(), k.x, k.y, Math.toRadians(k.headingDeg), reverse[i])
                switches += SwitchPoint(switches.size + 1, pose.tMs, pose, reverse[i])
            }
        }
        return poses to switches
    }

    /** 직각주차: 통로로 들어와 지나쳐 멈춘 뒤 후진 → 앞으로 조금 → 다시 후진 (C-12 시안) */
    private val perpendicular = build(
        listOf(
            Key(0.0, 0.0, 0.0, 0.0),
            Key(0.0, 14.0, 0.0, 32.0),
            Key(-2.6, 10.6, -55.0, 65.0),
            Key(-0.4, 12.0, -72.0, 80.0),
            Key(-5.6, 10.0, -90.0, 100.0),
        ),
        listOf(false, true, false, true),
    )
    val trajectory: List<Pose> = perpendicular.first
    val switchPoints: List<SwitchPoint> = perpendicular.second

    /** 평행주차: 지나쳐 멈춘 뒤 후진 S자 + 앞으로 맞춤 */
    private val parallel = build(
        listOf(
            Key(0.0, 0.0, 0.0, 0.0),
            Key(0.3, 13.0, 0.0, 20.0),
            Key(2.6, 6.4, 0.0, 45.0),
            Key(2.6, 7.2, 0.0, 52.0),
        ),
        listOf(false, true, false),
    )
    val parallelTrajectory: List<Pose> = parallel.first
    val parallelSwitchPoints: List<SwitchPoint> = parallel.second

    /** 사선주차: 앞으로 들어가서 후진 없음 */
    private val angled = build(
        listOf(
            Key(0.0, 0.0, 0.0, 0.0),
            Key(0.0, 7.0, 0.0, 8.0),
            Key(-3.6, 11.2, 55.0, 18.0),
        ),
        listOf(false, false),
    )
    val angledTrajectory: List<Pose> = angled.first

    val summary = ManeuverSummary(
        reverseCount = 2,
        steeringTurns = 3,
        brakeCount = 5,
        durationSec = 100,
        netTurns = -2.25,
        rampTurns = 2.0,
        switchPoints = switchPoints,
        shape = ParkingShape.PERPENDICULAR,
        approximate = false,
    )

    val approximateSummary = summary.copy(approximate = true)

    val parallelSummary = ManeuverSummary(
        reverseCount = 1, steeringTurns = 2, brakeCount = 3, durationSec = 52, netTurns = 0.0, rampTurns = 0.0,
        switchPoints = parallelSwitchPoints, shape = ParkingShape.PARALLEL, approximate = false,
    )

    val angledSummary = ManeuverSummary(
        reverseCount = 0, steeringTurns = 1, brakeCount = 1, durationSec = 18, netTurns = 0.15, rampTurns = 0.0,
        switchPoints = emptyList(), shape = ParkingShape.ANGLED, approximate = false,
    )

    // ── 기록 ──────────────────────────────────────────────────────────────────

    private fun at(month: Int, day: Int, hour: Int, minute: Int): Long =
        LocalDateTime.of(2026, month, day, hour, minute).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    private fun brief(reverse: Int, sec: Int) = summary.copy(reverseCount = reverse, durationSec = sec)

    /** 미리보기·스냅숏의 '지금' (2026-11-03 화 오후 5:02). [LocalNowMs]로 넣는다. */
    val nowMs: Long = at(11, 3, 17, 2)

    /** 홈·폰으로 보내기: [nowMs] 기준 2시간 10분 전(오후 2:52) 주차 */
    val lastRecord: ParkingRecord
        get() = ParkingRecord(
            id = "r-1",
            lotId = avenuefrance.id,
            lotName = avenuefrance.name,
            floor = "B2",
            zone = "D",
            number = "07",
            note = "엘리베이터 2번 쪽",
            parkedAtMs = nowMs - (2 * 60 + 10) * 60_000L,
            summary = summary,
            trajectory = trajectory,
        )

    val records = listOf(
        ParkingRecord("r-1", avenuefrance.id, "아브뉴프랑 판교 주차장", "B2", "D", "07", null, at(11, 3, 14, 52), brief(2, 100)),
        ParkingRecord("r-2", office.id, "회사 · H스퀘어", "B3", null, null, null, at(11, 1, 9, 5), brief(1, 55)),
        ParkingRecord("r-3", home.id, "집 · 백현마을 5단지", "B1", null, null, null, at(10, 29, 19, 40), brief(0, 40)),
        ParkingRecord("r-4", alphadom.id, "알파돔타워", "B2", null, null, null, at(10, 26, 12, 10), brief(3, 125)),
        ParkingRecord("r-5", hyundai.id, "현대백화점 판교점", "B4", null, null, null, at(10, 24, 15, 30), brief(4, 150)),
    )

    val monthlyAvgReverse = listOf("6월" to 3.8, "7월" to 3.5, "8월" to 3.1, "9월" to 2.9, "10월" to 2.6, "11월" to 1.6)

    // ── 주차왕 (C-13 시안 숫자 그대로 — 서버 /v1/me/king · /board 응답 모양) ─────────

    val kingStanding = KingStanding(
        nickname = "판교 느긋한 수달", leagueLabel = "판교 초보", rank = 12, total = 148, percentile = 8,
        score = KingScoreParts(82, 58, 11, 13), prevWeekRank = 17, nextHint = "한 번만 더 깔끔하게 대면 10등이에요",
    )

    val kingBoard = KingBoard(
        top = listOf(
            KingRow(1, "백현 조용한 고래", 96, false),
            KingRow(2, "삼평 단단한 펭귄", 94, false),
            KingRow(3, "운중 느린 거북", 93, false),
            KingRow(4, "판교 맑은 여우", 91, false),
            KingRow(5, "백현 둥근 너구리", 90, false),
        ),
        around = listOf(
            KingRow(11, "판교 차분한 두루미", 84, false),
            KingRow(12, "판교 느긋한 수달", 82, true),
            KingRow(13, "운중 다정한 곰", 81, false),
        ),
        demo = true,
    )

    // ── 그 밖 ─────────────────────────────────────────────────────────────────

    val estimateHigh = FloorEstimate("B2", Confidence.HIGH)
    val estimateMedium = FloorEstimate("B2", Confidence.MEDIUM)
    val estimateLow = FloorEstimate("B2", Confidence.LOW)
    val parkedFloors = listOf("1F", "B1", "B2", "B3", "B4")

    val settings = UserSettings(
        onboarded = true,
        shareAnonymous = true,
        showParkedCard = true,
        experience = DrivingExperience.UNDER_1Y,
        cardTiming = CardTiming.ALWAYS,
    )

    const val shareUrl = "https://parkinggack.app/p/7Kx2Qm9a?f=B2&z=D-07"
    const val shortUrl = "pgk.kr/7Kx2"
}
