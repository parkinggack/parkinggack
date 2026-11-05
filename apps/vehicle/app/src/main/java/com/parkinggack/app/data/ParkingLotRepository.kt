package com.parkinggack.app.data

import com.parkinggack.app.domain.distanceMeters
import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.LotSuggestion
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.net.ApiClient
import com.parkinggack.app.net.ApiResult
import com.parkinggack.app.net.toModel
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.ceil

/**
 * 주차장 데이터. 서버 우선, 실패하면 캐시 → 앱 내장 시드 순으로 대체 (차 안 네트워크는 자주 끊김).
 * 화면은 [cached]로 즉시 그리고, suspend 함수 결과로 갱신한다.
 */
interface ParkingLotRepository {
    /** 내비 목적지 → 그 목적지의 주차장. 정보가 없으면 null (→ C-02 카드를 띄우지 않음) */
    suspend fun match(name: String?, location: LatLng?): ParkingLot?
    /** 목적지 근처의 더 쉬운 주차장 (C-03), 쉬운 순 */
    suspend fun easier(lot: ParkingLot, max: Int = 3): List<LotSuggestion>
    /** 상세 (C-08, 통계 포함) */
    suspend fun detail(id: String): ParkingLot?
    /** 네트워크 없이 바로 줄 수 있는 값 (캐시 → 시드) */
    fun cached(id: String): ParkingLot?
    /** 서버가 새로 계산한 점수를 캐시에 반영 (기록·별점 응답) */
    fun applyScore(id: String, difficulty: Double?, sampleCount: Int?, ratingCount: Int?) {}
    /** 기본 자주 가는 곳 (내 기록이 없을 때) */
    fun defaultFavorites(): List<ParkingLot>
}

/**
 * 오프라인 시드 데이터 구현 (서버 연동 전 + 폴백).
 * 시드 주차장에 공공데이터(요금·기본 정보, [PublicLots])가 있으면 붙여서 내보낸다.
 */
class SeedParkingLotRepository(
    seeds: List<ParkingLot> = SeedLots.all,
    publicLots: List<PublicLot> = PublicLots.all,
    private val nearRadiusM: Double = 1_000.0,
    private val matchRadiusM: Double = 250.0,
) : ParkingLotRepository {

    private val lots: List<ParkingLot> = seeds.map { PublicParking.enrich(it, publicLots) }
    // 공공데이터를 붙이면 원본과 equals가 달라지므로 id로 비교한다
    private val residentialIds = SeedLots.residential.map { it.id }.toSet()

    override suspend fun match(name: String?, location: LatLng?): ParkingLot? = matchNow(name, location)

    fun matchNow(name: String?, location: LatLng?): ParkingLot? {
        name?.let { n -> SeedLots.destinationKeywords.entries.firstOrNull { n.contains(it.key) }?.let { return cached(it.value.id) ?: it.value } }
        location ?: return null
        return lots.minByOrNull { distanceMeters(it.location, location) }
            ?.takeIf { distanceMeters(it.location, location) <= matchRadiusM }
    }

    override suspend fun easier(lot: ParkingLot, max: Int): List<LotSuggestion> = easierNow(lot, max)

    fun easierNow(lot: ParkingLot, max: Int = 3): List<LotSuggestion> {
        val base = lot.difficulty?.score ?: 5.0
        return lots.asSequence()
            .filter { it.id != lot.id && it.difficulty != null && it.difficulty.score < base }
            .filter { it.id !in residentialIds } // 아파트·사옥 주차장은 추천 후보에서 제외
            .map { it to distanceMeters(it.location, lot.location) }
            .filter { it.second <= nearRadiusM }
            .sortedBy { it.first.difficulty!!.score }
            .take(max)
            .map { (candidate, meters) ->
                val walk = walkMinutes(meters)
                val extra = SeedLots.pitches[candidate.id]
                LotSuggestion(candidate, walk, if (extra != null) "걸어서 ${walk}분, $extra" else "걸어서 ${walk}분")
            }
            .toList()
    }

    override suspend fun detail(id: String) = cached(id)
    override fun cached(id: String) = lots.firstOrNull { it.id == id }
    override fun defaultFavorites() = SeedLots.favorites.map { cached(it.id) ?: it }

    /** 도보 4.5km/h, 직선거리 × 1.3 우회 계수 (서버와 같은 식) */
    private fun walkMinutes(m: Double) = ceil(m * 1.3 / 75.0).toInt().coerceAtLeast(1)
}

/** 서버 우선 구현 */
class RemoteParkingLotRepository(
    private val api: ApiClient,
    private val fallback: SeedParkingLotRepository = SeedParkingLotRepository(),
) : ParkingLotRepository {
    private val cache = ConcurrentHashMap<String, ParkingLot>()

    /** 마지막 호출이 서버에서 왔는지 (진단 화면·로그용) */
    @Volatile var lastOnline: Boolean? = null
        private set

    override suspend fun match(name: String?, location: LatLng?): ParkingLot? =
        when (val r = api.matchLot(name, location?.lat, location?.lng)) {
            is ApiResult.Ok -> { lastOnline = true; r.value.lot?.toModel()?.also(::put) }
            else -> { lastOnline = false; fallback.matchNow(name, location) }
        }

    override suspend fun easier(lot: ParkingLot, max: Int): List<LotSuggestion> =
        when (val r = api.easierLots(lot.id, max)) {
            is ApiResult.Ok -> { lastOnline = true; r.value.suggestions.map { it.toModel() }.onEach { put(it.lot) } }
            is ApiResult.Http -> fallback.easierNow(lot, max)
            is ApiResult.Offline -> { lastOnline = false; fallback.easierNow(lot, max) }
        }

    override suspend fun detail(id: String): ParkingLot? =
        when (val r = api.lotDetail(id)) {
            is ApiResult.Ok -> { lastOnline = true; r.value.lot.toModel().also(::put) }
            else -> { if (r is ApiResult.Offline) lastOnline = false; cached(id) }
        }

    override fun cached(id: String): ParkingLot? = cache[id] ?: fallback.cached(id)

    override fun applyScore(id: String, difficulty: Double?, sampleCount: Int?, ratingCount: Int?) {
        val cur = cached(id) ?: return
        cache[id] = cur.copy(
            difficulty = difficulty?.let { Difficulty(it) }, // 서버가 null이면 데이터 부족
            sampleCount = sampleCount ?: cur.sampleCount,
            ratingCount = ratingCount ?: cur.ratingCount,
        )
    }

    override fun defaultFavorites(): List<ParkingLot> = fallback.defaultFavorites().map { cached(it.id) ?: it }

    private fun put(lot: ParkingLot) {
        // 목록 응답에는 stats가 없으므로 기존 상세 통계를 지우지 않는다
        val prev = cache[lot.id]
        cache[lot.id] = if (lot.stats == null && prev?.stats != null) lot.copy(stats = prev.stats) else lot
    }
}
