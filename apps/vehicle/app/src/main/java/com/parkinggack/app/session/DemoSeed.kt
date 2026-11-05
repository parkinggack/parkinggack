package com.parkinggack.app.session

import com.parkinggack.app.data.SeedLots
import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.model.ParkingRecord
import java.util.Calendar

/**
 * 심사·시연용 예시 기록 (C-01 최근 주차·자주 가는 곳, C-09 표·월별 그래프, C-12 동선).
 * 첫 실행 때 한 번 넣는다 (BuildConfig.DEMO_SEED, 끄려면 -PdemoSeed=false). id 는 "seed-…" →
 * 서버(난이도 집계·주차왕·폰)로 보내지 않는다 (ParkingRecord.staysOnDevice). 설정 › 기록 모두 지우기로 지운다.
 *
 * 지금 시각 기준 최근 4개월: 후진이 달마다 줄어드는 흐름 → C-09 "지난달보다 후진이 … 줄었어요".
 * 최근 2주 6건은 폰 앱 시연 데이터와 같은 주차(아브뉴프랑 B2 D-07 130분 전 …) — 차와 폰을 같이 봐도 같은 이야기.
 * 후진 횟수·동선 그림은 시나리오 신호를 실제 세션(적분→분석)에 흘려 얻은 값이라 서로 맞는다.
 */
object DemoSeed {
    private const val MIN = 60_000L
    private const val HOUR = 60 * MIN
    private const val DAY = 24 * HOUR

    private data class Place(val lot: ParkingLot, val floor: String, val zone: String? = null, val number: String? = null,
                             val ramp: Int = 1, val note: String? = null)

    /** 최근 2주 — 폰 앱 시연 데이터(apps/mobile/src/mock/fixtures.ts RECORDS)와 같은 주차. 맨 앞이 '지금 주차' (얼마 전 → 곳) */
    private val recent = listOf(
        130 * MIN to Place(SeedLots.avenueFrance, "B2", "D", "07", 2, "엘리베이터 2번 쪽"),
        (2 * DAY + 4 * HOUR) to Place(SeedLots.office, "B3", "C", "12", 1),
        (4 * DAY + 9 * HOUR) to Place(SeedLots.home, "B1", "A", "03", 1, "102동 입구 앞"),
        (6 * DAY + 3 * HOUR) to Place(SeedLots.hyundaiDept, "B4", "F", "11", 3, "식품관 엘리베이터 쪽"),
        (9 * DAY + 5 * HOUR) to Place(SeedLots.alphadom, "B2", "B", "04", 1),
        (12 * DAY + 10 * HOUR) to Place(SeedLots.home, "B2", "B", "08", 1),
    )

    /** 그 앞 석 달 — 달력 기준 (몇 달 전 → 그 달 며칠·몇 시 → 곳) */
    private val older = listOf(
        Triple(1, 8 to 18, Place(SeedLots.avenueFrance, "B1")),
        Triple(1, 22 to 9, Place(SeedLots.office, "B4", ramp = 4)),
        Triple(2, 6 to 15, Place(SeedLots.hyundaiDept, "B4", ramp = 4)),
        Triple(2, 15 to 20, Place(SeedLots.home, "B2", ramp = 2)),
        Triple(2, 25 to 9, Place(SeedLots.office, "B4", ramp = 4)),
        Triple(3, 10 to 14, Place(SeedLots.hyundaiDept, "B5", ramp = 5)),
        Triple(3, 21 to 9, Place(SeedLots.office, "B4", ramp = 4)),
    )

    /**
     * 달마다 후진 횟수 (그 달 기록에 최신 순으로 돌려 씀). 기록이 어느 달에 들어가는지는 오늘 날짜에 따라 달라지므로
     * 달 기준으로 정해야 C-09 "지난달보다 후진이 … 줄었어요"가 언제 열어도 나온다 (이번 달 ≤ 1, 지난달 ≥ 2)
     */
    private val reversesByMonthsAgo = listOf(listOf(1, 0, 1, 0, 0, 1), listOf(2, 3, 2, 2, 3, 2), listOf(3, 3, 2, 3), listOf(4, 3, 4))

    /** 같은 (후진, 램프) 조합은 한 번만 계산 */
    private fun drive(reverses: Int, ramp: Int, seed: Long): ParkingResult? {
        val sc = ScenarioGenerator.seedPerpendicular(reverses, ramp, seed)
        val session = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
        sc.samples.forEachIndexed { i, x -> session.onSample(x, sc.distanceToTargetM[i]) }
        return (session.state.value as? DriveState.Parked)?.result
    }

    private fun monthsAgo(atMs: Long, nowMs: Long): Int {
        val a = Calendar.getInstance().apply { timeInMillis = atMs }
        val n = Calendar.getInstance().apply { timeInMillis = nowMs }
        return (n.get(Calendar.YEAR) - a.get(Calendar.YEAR)) * 12 + (n.get(Calendar.MONTH) - a.get(Calendar.MONTH))
    }

    /** [nowMs] 기준 예시 기록 (최신 순). 계산이 몇 백 ms 걸리므로 백그라운드에서 부를 것 */
    fun records(nowMs: Long = System.currentTimeMillis()): List<ParkingRecord> {
        val monthStart = Calendar.getInstance().apply {
            timeInMillis = nowMs; set(Calendar.DAY_OF_MONTH, 1); set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val placed = recent.mapIndexed { i, (ago, place) ->
            // '지금 주차'는 언제나 이번 달 안에 (달이 막 바뀐 새벽이면 몇 분 전으로)
            val at = if (i == 0) maxOf(nowMs - ago, minOf(monthStart + MIN, nowMs - MIN)) else nowMs - ago
            at to place
        } + older.map { (back, dayHour, place) ->
            val c = Calendar.getInstance().apply { timeInMillis = monthStart; add(Calendar.MONTH, -back) }
            c.set(Calendar.DAY_OF_MONTH, minOf(dayHour.first, c.getActualMaximum(Calendar.DAY_OF_MONTH)))
            c.set(Calendar.HOUR_OF_DAY, dayHour.second)
            c.timeInMillis to place
        }
        val used = HashMap<Int, Int>()
        val cache = HashMap<Pair<Int, Int>, ParkingResult?>()
        return placed.sortedByDescending { it.first }.mapIndexedNotNull { i, (at, p) ->
            val back = monthsAgo(at, nowMs).coerceIn(0, reversesByMonthsAgo.lastIndex)
            val list = reversesByMonthsAgo[back]
            val k = used.merge(back, 1, Int::plus)!! - 1
            val reverses = list[k % list.size]
            val r = cache.getOrPut(reverses to p.ramp) { drive(reverses, p.ramp, 21L + i) } ?: return@mapIndexedNotNull null
            val minute = at / MIN * MIN
            ParkingRecord(
                id = "${ParkingRecord.SEED_ID_PREFIX}${minute / MIN}-${p.lot.id}",
                lotId = p.lot.id, lotName = p.lot.name, floor = p.floor, zone = p.zone, number = p.number, note = p.note,
                parkedAtMs = minute, summary = r.summary, trajectory = r.trajectory,
            )
        }
    }
}
