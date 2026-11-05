package com.parkinggack.app.session

import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingRecord
import java.util.Calendar
import kotlin.math.roundToInt

/**
 * 화면 문구 계산 (기획서 11장 카피 톤). 운전자를 평가하지 않는다 — "실패/못함/서툴러요" 금지, 좋아진 것만 말함.
 */
object Copy {
    /** "1분 40초" / "55초" */
    fun duration(sec: Int): String = if (sec >= 60) "${sec / 60}분 ${"%02d".format(sec % 60)}초".replace(" 00초", "") else "${sec}초"

    private enum class Cmp { FIRST, EASIER, SAME, CAREFUL }

    /** 이번 기록을 뺀 내 기록과 비교 — 한 건뿐이면 그 한 건(지난번)과 */
    private fun compare(summary: ManeuverSummary, history: List<ParkingRecord>, excludeId: String?): Pair<Cmp, Boolean> {
        val past = history.filter { it.id != excludeId }.mapNotNull { it.summary?.reverseCount }
        if (past.isEmpty()) return Cmp.FIRST to false
        val avg = past.average()
        val cmp = when {
            summary.reverseCount < avg - 0.4 -> Cmp.EASIER
            summary.reverseCount <= avg + 0.4 -> Cmp.SAME
            else -> Cmp.CAREFUL
        }
        return cmp to (past.size == 1)
    }

    /**
     * C-05 "평소보다 수월했어요" — 이번 기록을 제외한 내 평균 후진 횟수와 비교.
     * 예전엔 지난 기록이 1건이어도 "첫 기록을 남겼어요"라고 했다 (두 번째 주차에서, 2-2)
     */
    fun comparison(summary: ManeuverSummary, history: List<ParkingRecord>, excludeId: String? = null): String {
        val (cmp, onlyOne) = compare(summary, history, excludeId)
        val base = if (onlyOne) "지난번" else "평소"
        return when (cmp) {
            Cmp.FIRST -> "첫 기록을 남겼어요"
            Cmp.EASIER -> "${base}보다 수월했어요"
            Cmp.SAME -> "${base}처럼 차분했어요"
            Cmp.CAREFUL -> "오늘은 조금 더 신중하게 댔어요"
        }
    }

    /**
     * C-01 "지난 주차 후진 2회, 평소보다 쉬웠어요".
     * 지난 주차를 다음 날 봐도 맞게 '오늘은'을 쓰지 않는다. 기록이 그 한 건뿐이면 비교 없이 후진 횟수만
     */
    fun lastSummaryLine(history: List<ParkingRecord>): String? {
        val last = history.firstOrNull() ?: return null
        val s = last.summary ?: return null
        val (cmp, onlyOne) = compare(s, history, last.id)
        val base = if (onlyOne) "그 전보다" else "평소보다"
        val tail = when (cmp) {
            Cmp.FIRST -> return "지난 주차 후진 ${s.reverseCount}회"
            Cmp.EASIER -> "${base} 쉬웠어요"
            Cmp.SAME -> if (onlyOne) "그 전처럼 차분했어요" else "평소처럼 차분했어요"
            Cmp.CAREFUL -> "조금 더 신중하게 댔어요"
        }
        return "지난 주차 후진 ${s.reverseCount}회, $tail"
    }

    /** C-09 월별 평균 후진 횟수 (최근 6개월, 오래된 → 최근). 라벨 "6월" */
    fun monthlyAvgReverse(history: List<ParkingRecord>, nowMs: Long = System.currentTimeMillis(), months: Int = 6): List<Pair<String, Double>> {
        val cal = Calendar.getInstance()
        return (months - 1 downTo 0).mapNotNull { back ->
            cal.timeInMillis = nowMs; cal.add(Calendar.MONTH, -back)
            val y = cal.get(Calendar.YEAR); val m = cal.get(Calendar.MONTH)
            val inMonth = history.filter { r -> cal.timeInMillis = r.parkedAtMs; cal.get(Calendar.YEAR) == y && cal.get(Calendar.MONTH) == m }
                .mapNotNull { it.summary?.reverseCount }
            if (inMonth.isEmpty()) null else "${m + 1}월" to inMonth.average()
        }
    }

    /** C-09 헤드라인 "지난달보다 후진이 1회 줄었어요" */
    fun historyHeadline(monthly: List<Pair<String, Double>>): String {
        // 큰 글씨 두 줄 — '보여 / 드릴게요' 사이에서 줄이 바뀌지 않게 끊을 곳을 정해 둔다 (3-4)
        if (monthly.size < 2) return "기록이 쌓이면\n변화를 보여 드릴게요"
        val diff = monthly[monthly.size - 2].second - monthly.last().second
        val n = (diff * 10).roundToInt() / 10.0
        return when {
            n >= 0.5 -> "지난달보다 후진이 ${if (n % 1.0 == 0.0) n.toInt().toString() else n.toString()}회 줄었어요"
            n > -0.5 -> "지난달만큼 꾸준해요"
            else -> "꾸준히 기록하고 있어요"
        }
    }
}
