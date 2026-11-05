package com.parkinggack.app.data

import com.parkinggack.app.domain.distanceMeters
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.ParkingLot

/**
 * 공공데이터포털 「전국주차장정보표준데이터」 한 곳 (앱에 쓰는 칸만). 빈 칸은 null.
 * 값은 개발 PC에서 scripts/fetch-public-parking.py 로 받아 [PublicLots]에 넣는다 (차에서는 네트워크 없이 씀).
 */
data class PublicLot(
    /** 주차장관리번호 */
    val id: String,
    /** 주차장명 */
    val name: String,
    /** 주차장구분: 공영 / 민영 */
    val category: String?,
    /** 주차장유형: 노외 / 노상 / 부설 */
    val type: String?,
    val location: LatLng,
    /** 주차구획수 */
    val spaces: Int?,
    /** 요금정보: 무료 / 유료 / 혼합 */
    val feeKind: String?,
    /** 주차기본시간(분)·주차기본요금(원) */
    val baseMinutes: Int?,
    val baseFee: Int?,
    /** 추가단위시간(분)·추가단위요금(원) */
    val extraMinutes: Int?,
    val extraFee: Int?,
    /** 1일주차권요금(원) */
    val dayPassFee: Int?,
    /** 평일운영시작·종료시각 "HH:mm" */
    val weekdayOpen: String?,
    val weekdayClose: String?,
    /** 데이터기준일자 "yyyy-MM-dd" */
    val referenceDate: String?,
)

/** 공공데이터 → 화면 문구, 시드 주차장과 짝 찾기. android.* 없음 (JVM 테스트). */
object PublicParking {

    const val SOURCE_NAME = "공공데이터포털 전국주차장정보표준데이터"

    /**
     * 요금 한 줄. 예: "기본 30분 1,000원 · 추가 10분당 500원", "기본 30분 무료 · 추가 10분당 500원", "무료".
     * 유료인데 요금 칸이 다 비었거나 0이면 null (모르는 값을 지어내지 않음).
     */
    fun feeText(p: PublicLot): String? {
        if (p.feeKind?.trim() == "무료") return "무료"
        val baseKnown = p.baseMinutes != null && p.baseMinutes > 0 && p.baseFee != null
        val extraKnown = p.extraMinutes != null && p.extraMinutes > 0 && p.extraFee != null && p.extraFee > 0
        if (!extraKnown && (!baseKnown || p.baseFee == 0)) {
            return p.dayPassFee?.takeIf { it > 0 }?.let { "1일 ${won(it)}" }
        }
        val parts = buildList {
            if (baseKnown) add("기본 ${p.baseMinutes}분 " + if (p.baseFee == 0) "무료" else won(p.baseFee!!))
            if (extraKnown) add("추가 ${p.extraMinutes}분당 ${won(p.extraFee!!)}")
        }
        return parts.joinToString(" · ")
    }

    /** 기본 정보 줄. 예: ["공영 노외 · 120면", "평일 09:00–21:00"] */
    fun infoLines(p: PublicLot): List<String> = buildList {
        val kind = listOfNotNull(p.category?.trim()?.ifEmpty { null }, p.type?.trim()?.ifEmpty { null }).joinToString(" ")
        val spaces = p.spaces?.takeIf { it > 0 }?.let { "${"%,d".format(it)}면" }
        listOfNotNull(kind.ifEmpty { null }, spaces).joinToString(" · ").takeIf { it.isNotEmpty() }?.let { add(it) }
        hoursText(p.weekdayOpen, p.weekdayClose)?.let { add("평일 $it") }
    }

    /** "출처 · 기준일" 표시 문구 */
    fun sourceText(p: PublicLot): String =
        SOURCE_NAME + (p.referenceDate?.takeIf { it.isNotBlank() }?.let { " · $it 기준" } ?: "")

    /**
     * 시드 주차장과 같은 곳을 공공데이터에서 찾는다.
     * 이름의 핵심 낱말(가장 긴 낱말, 3글자 이상)이 공공데이터 이름에 들어 있고 [maxMeters] 안이면 짝.
     * 거리만 가까운 곳은 짝으로 보지 않는다 — 옆 건물 주차장의 요금을 붙이면 안 되므로.
     */
    fun match(seed: ParkingLot, publics: List<PublicLot>, maxMeters: Double = 1_500.0): PublicLot? {
        val key = keyToken(seed.name) ?: return null
        return publics
            .filter { compact(it.name).contains(key) }
            .map { it to distanceMeters(it.location, seed.location) }
            .filter { it.second <= maxMeters }
            .minByOrNull { it.second }
            ?.first
    }

    /** 짝이 있으면 요금·기본 정보·출처를 채운다. 시안용 자리 문구("[…]")는 뺀다. 위치는 그대로 둔다. */
    fun enrich(seed: ParkingLot, publics: List<PublicLot>): ParkingLot {
        val kept = seed.publicInfo.filterNot { it.contains('[') }
        val p = match(seed, publics) ?: return seed.copy(publicInfo = kept)
        val fee = feeText(p)
        return seed.copy(
            feeText = fee ?: seed.feeText,
            feeSource = if (fee != null) sourceText(p) else seed.feeSource,
            publicInfo = (infoLines(p) + kept).distinct(),
        )
    }

    /** 어느 주차장에나 붙는 낱말 ("주차장"은 먼저 떼어 낸 뒤 비교) */
    private val STOP_WORDS = setOf("판교", "판교점", "공영", "지하", "노외", "노상", "부설")

    internal fun keyToken(name: String): String? = name
        .split(' ', '·', '(', ')')
        .map { compact(it).removeSuffix("주차장") }
        .filter { it.length >= 3 && it !in STOP_WORDS }
        .maxByOrNull { it.length }

    private fun compact(s: String) = s.filterNot { it.isWhitespace() }

    private fun won(v: Int) = "${"%,d".format(v)}원"

    private fun hoursText(open: String?, close: String?): String? {
        val o = open?.trim()?.ifEmpty { null } ?: return null
        val c = close?.trim()?.ifEmpty { null } ?: return null
        if (o == "00:00" && (c == "23:59" || c == "24:00" || c == "00:00")) return "24시간"
        return "$o–$c"
    }
}
