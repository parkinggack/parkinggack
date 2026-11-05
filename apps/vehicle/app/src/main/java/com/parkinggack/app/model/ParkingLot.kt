package com.parkinggack.app.model

/** 난이도 이유 태그 (Components 시안의 아이콘 세트와 1:1) */
enum class ReasonTag(val label: String) {
    SPIRAL_RAMP("회전 램프 좁음"),
    NARROW_AISLE("좁은 통로"),
    MANY_PILLARS("기둥 많음"),
    MECHANICAL("기계식"),
    STEEP_SLOPE("경사 급함"),
    FREQUENT_REVERSE("후진 잦음"),
    SPACIOUS("자리 넉넉"),
    FLAT("평면 주차장"),
    MANY_FLOORS("층 많음"),
}

/** 난이도 0.0~5.0. 5단계 등급과 라벨은 기획서 9장 표 기준. */
@JvmInline
value class Difficulty(val score: Double) {
    /** 1~5 (막대 5칸 중 채울 칸 수) */
    val level: Int get() = score.coerceIn(1.0, 5.0).let { kotlin.math.round(it).toInt() }.coerceIn(1, 5)
    val label: String get() = when (level) { 1 -> "아주 쉬움"; 2 -> "쉬움"; 3 -> "보통"; 4 -> "어려움"; else -> "아주 어려움" }
    val isHard: Boolean get() = score >= 3.5
    val isEasy: Boolean get() = score < 2.5
    /** "★4.3" */
    val starText: String get() = "★" + String.format("%.1f", score)
}

/** 구역 체계 (C-06). 예: 기둥 색 + 알파벳 A–H · 기둥 번호 01–12 */
data class ZoneScheme(
    val zones: List<String> = ('A'..'H').map { it.toString() },
    val numbers: List<String> = (1..12).map { "%02d".format(it) },
    val description: String? = null,
)

data class FloorCongestion(val floor: String, /** 0.0~1.0 */ val occupancy: Double)

/** C-08 근거 통계 */
data class LotStats(
    val avgReverse: Double,
    val overallAvgReverse: Double,
    val avgRampTurns: Double,
    val overallAvgRampTurns: Double,
    val avgDurationSec: Int,
    val overallAvgDurationSec: Int,
    /** 예: "평일 오후" */
    val congestionLabel: String,
    val floorCongestion: List<FloorCongestion>,
    val congestionSummary: String,
    /** 요일(월~일) × 시간대 버킷, 0.0~1.0 */
    val hourlyHeat: List<List<Double>>,
    val hourLabels: List<String>,
)

data class ParkingLot(
    val id: String,
    val name: String,
    val location: LatLng,
    /** null이면 데이터 부족 */
    val difficulty: Difficulty?,
    val tags: List<ReasonTag>,
    /** "평균 후진 3.2회" 같이 태그 대신 보여 줄 수치 칩 */
    val statChips: List<String> = emptyList(),
    /** 최근 30일 기록 차량 수 */
    val sampleCount: Int,
    /** 층 목록 위→아래. 예: ["1F","B1","B2","B3","B4"] */
    val floors: List<String>,
    val zoneScheme: ZoneScheme = ZoneScheme(),
    val stats: LotStats? = null,
    /** 공공데이터 기본 정보 (데이터 부족 상태에서 표시) */
    val publicInfo: List<String> = emptyList(),
    /** 요금 문구 (공공데이터). null이면 요금 줄을 숨긴다 — 모르는 요금을 지어내지 않음 */
    val feeText: String? = null,
    /** 요금 출처·기준일. 예: "공공데이터포털 전국주차장정보표준데이터 · 2026-06-30 기준" */
    val feeSource: String? = null,
    val ratingCount: Int = 0,
    val address: String? = null,
) {
    val hasEnoughData get() = difficulty != null && sampleCount >= MIN_SAMPLES
    companion object { const val MIN_SAMPLES = 10 }
}

/** C-03 추천 후보: 목적지 대비 도보 시간 포함 */
data class LotSuggestion(
    val lot: ParkingLot,
    val walkMinutes: Int,
    /** "걸어서 4분, 훨씬 넓어요" */
    val pitch: String,
)
