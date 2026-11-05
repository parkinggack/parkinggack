package com.parkinggack.app.ui.screens

import androidx.compose.runtime.staticCompositionLocalOf
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.math.abs
import kotlin.math.roundToInt

/* 화면 문구 포맷 (한국어). 운전자를 평가하는 말은 쓰지 않는다. */

private val DAYS = listOf("월", "화", "수", "목", "금", "토", "일")

/** 화면이 쓰는 '지금' ("2시간 10분 전" 계산). 미리보기·스냅숏은 고정 시각을 넣어 결과가 늘 같게 한다. */
val LocalNowMs = staticCompositionLocalOf<() -> Long> { { System.currentTimeMillis() } }

/** 100 → "1분 40초", 55 → "55초", 125 → "2분 05초", 120 → "2분" */
fun formatDurationKo(sec: Int): String {
    val s = sec.coerceAtLeast(0)
    val m = s / 60
    val r = s % 60
    return when {
        m == 0 -> "${r}초"
        r == 0 -> "${m}분"
        else -> "${m}분 ${"%02d".format(r)}초"
    }
}

/** 2.0 → "2", 2.45 → "2.5" */
fun formatCount(v: Double): String {
    val rounded = (v * 10).roundToInt() / 10.0
    return if (abs(rounded - rounded.roundToInt()) < 1e-9) rounded.roundToInt().toString() else "%.1f".format(rounded)
}

private fun zoned(ms: Long): ZonedDateTime = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault())

/** "오후 2:52" */
fun formatTimeOfDay(ms: Long): String {
    val z = zoned(ms)
    val h = z.hour
    val ampm = if (h < 12) "오전" else "오후"
    val h12 = (h % 12).let { if (it == 0) 12 else it }
    return "$ampm $h12:${"%02d".format(z.minute)}"
}

/** "11.3 (화)" */
fun formatDateShort(ms: Long): String {
    val z = zoned(ms)
    return "${z.monthValue}.${z.dayOfMonth} (${DAYS[z.dayOfWeek.value - 1]})"
}

/** "오늘" / "어제" / "11.1 (일)" */
fun formatDayLabel(ms: Long, nowMs: Long): String {
    val d = zoned(ms).toLocalDate()
    val today: LocalDate = zoned(nowMs).toLocalDate()
    return when (d) {
        today -> "오늘"
        today.minusDays(1) -> "어제"
        else -> formatDateShort(ms)
    }
}

/** "2시간 10분 전" */
fun formatElapsed(ms: Long, nowMs: Long): String {
    val min = ((nowMs - ms) / 60_000).coerceAtLeast(0)
    return when {
        min < 1 -> "방금"
        min < 60 -> "${min}분 전"
        min < 24 * 60 -> {
            val h = min / 60
            val m = min % 60
            if (m == 0L) "${h}시간 전" else "${h}시간 ${m}분 전"
        }
        else -> "${min / (24 * 60)}일 전"
    }
}

/** "오늘 오후 2:52 · 2시간 10분 전" */
fun formatParkedLine(ms: Long, nowMs: Long): String =
    "${formatDayLabel(ms, nowMs)} ${formatTimeOfDay(ms)} · ${formatElapsed(ms, nowMs)}"

/** 층 정렬 키: B5 < B4 < … < B1 < 1F < 2F. 모르는 형식은 0 근처. */
fun floorRank(floor: String): Int {
    val f = floor.trim().uppercase()
    Regex("^B(\\d+)$").find(f)?.let { return -it.groupValues[1].toInt() }
    Regex("^(\\d+)F$").find(f)?.let { return it.groupValues[1].toInt() }
    Regex("^지하\\s*(\\d+)").find(f)?.let { return -it.groupValues[1].toInt() }
    return 0
}

/** 아래층 → 위층 순서 (시안: B4 B3 B2 B1 1F) */
fun floorsBottomUp(floors: List<String>): List<String> =
    floors.withIndex().sortedWith(compareBy({ floorRank(it.value) }, { -it.index })).map { it.value }

/**
 * 조사 '로/으로'. 받침 없거나 ㄹ 받침이면 '로'. 영문·숫자는 읽는 소리 기준.
 * "B2" → "B2로", "B3" → "B3으로", "B1" → "B1로"(일), "1F" → "1F로"
 */
fun withRo(word: String): String {
    val last = word.trim().lastOrNull() ?: return word
    val useEuro = when {
        last in '가'..'힣' -> {
            val jong = (last - '가') % 28
            jong != 0 && jong != 8 // 8 = ㄹ
        }
        last.isDigit() -> last in "036" // 영, 삼, 육
        last.isLetter() -> last.uppercaseChar() in "MN" // 엠, 엔
        else -> false
    }
    return word + if (useEuro) "으로" else "로"
}
