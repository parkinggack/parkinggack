package com.parkinggack.app.ui.screens

import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.ui.components.Stat
import java.time.Instant
import java.time.ZoneId

/*
 * 홈 '내 주차'와 C-09 위쪽 숫자 칸. 카피 원칙대로 평가하는 말 없이 숫자만 (좋아진 것만 문장으로).
 */

private fun sameMonth(a: Long, b: Long): Boolean {
    val za = Instant.ofEpochMilli(a).atZone(ZoneId.systemDefault())
    val zb = Instant.ofEpochMilli(b).atZone(ZoneId.systemDefault())
    return za.year == zb.year && za.monthValue == zb.monthValue
}

/**
 * 평균은 '이번 달' 기록으로 — 옆의 '이번 달 주차'·C-09 그래프의 이번 달 막대·머리말("지난달보다 …")과 같은 기간.
 * 예전엔 최근 30일이라 지난달이 섞여 그래프 11월 0.7회 옆에 '요즘 평균 후진 1.8회'가 나왔다 (docs/sim-findings.md 3-2).
 * 이번 달 기록이 아직 없으면 기록이 있는 가장 최근 달 — 라벨 앞에 그 달("10월")을 붙인다.
 * @return (라벨 앞말 "" 또는 "10월 ", 그 달 요약들)
 */
private fun averageMonth(records: List<ParkingRecord>, nowMs: Long): Pair<String, List<com.parkinggack.app.model.ManeuverSummary>> {
    val thisMonth = records.filter { sameMonth(it.parkedAtMs, nowMs) }.mapNotNull { it.summary }
    if (thisMonth.isNotEmpty()) return "" to thisMonth
    val latest = records.filter { it.summary != null && it.parkedAtMs <= nowMs }.maxByOrNull { it.parkedAtMs } ?: return "" to emptyList()
    val month = Instant.ofEpochMilli(latest.parkedAtMs).atZone(ZoneId.systemDefault()).monthValue
    return "${month}월 " to records.filter { sameMonth(it.parkedAtMs, latest.parkedAtMs) }.mapNotNull { it.summary }
}

/** 홈: 이번 달 주차 · 평균 후진 · 평균 걸린 시간 (평균은 이번 달) */
internal fun homeStats(records: List<ParkingRecord>, nowMs: Long): List<Stat> {
    val (prefix, summaries) = averageMonth(records, nowMs)
    val thisMonth = records.count { sameMonth(it.parkedAtMs, nowMs) }
    return listOf(
        Stat("이번 달 주차", "${thisMonth}번"),
        Stat("${prefix}평균 후진", if (summaries.isEmpty()) "–" else "${formatCount(summaries.map { it.reverseCount }.average())}회"),
        Stat("${prefix}평균 걸린 시간", if (summaries.isEmpty()) "–" else formatDurationKo(summaries.map { it.durationSec }.average().toInt())),
    )
}

/** C-09 (그래프 카드 폭이 좁아 짧은 값만 — 라벨 8자 안): 모은 기록 · 이번 달 · 이달 평균 후진 */
internal fun historyStats(records: List<ParkingRecord>, nowMs: Long): List<Stat> {
    val (prefix, summaries) = averageMonth(records, nowMs)
    return listOf(
        Stat("모은 기록", "${records.size}번"),
        Stat("이번 달", "${records.count { sameMonth(it.parkedAtMs, nowMs) }}번"),
        Stat(if (prefix.isEmpty()) "이달 평균 후진" else "${prefix}평균 후진", if (summaries.isEmpty()) "–" else "${formatCount(summaries.map { it.reverseCount }.average())}회"),
    )
}
