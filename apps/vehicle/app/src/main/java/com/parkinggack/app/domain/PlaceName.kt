package com.parkinggack.app.domain

/**
 * 목적지 없이 댄 주차에 붙일 짧은 장소 이름 (C-05 머리줄·C-09 '장소' 칸).
 * 아는 주차장이 근처에 없을 때 내비 현재 위치 주소(CurrentLocationInfo.address)의 끝부분을 쓴다.
 *   "경기도 성남시 분당구 판교역로146번길 20" → "판교역로146번길 20"
 *   "경기도 성남시 분당구 백현동 541"        → "백현동 541"
 *   "판교역로 146번길 20"                    → "판교역로 146번길 20" (도로명과 번길이 띄어져 있으면 함께)
 *   "수정구 시흥동"                          → "수정구 시흥동" (두 낱말 이하는 그대로 — 에뮬레이터 내비가 주는 모양)
 */
object PlaceName {
    private const val MAX_LEN = 24
    private val ROAD_OR_TOWN = Regex(".+(로|길|동|리|가)$")
    private val NUMBERED_STREET = Regex("^\\d+번?길$")

    fun fromAddress(address: String?): String? {
        val tokens = address?.trim()?.split(Regex("\\s+"))?.filter { it.isNotEmpty() }.orEmpty()
        if (tokens.isEmpty()) return null
        // 이미 짧은 주소("수정구 시흥동" — Pleos 내비가 주는 모양)는 그대로
        if (tokens.size <= 2) return tokens.joinToString(" ").take(MAX_LEN).trim()
        var i = tokens.indexOfLast { ROAD_OR_TOWN.matches(it) && !it.endsWith("시") }
        if (i > 0 && NUMBERED_STREET.matches(tokens[i])) i -= 1
        val short = if (i >= 0) tokens.drop(i) else tokens.takeLast(2)
        return short.joinToString(" ").take(MAX_LEN).trim().ifEmpty { null }
    }
}
