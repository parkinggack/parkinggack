package com.parkinggack.app.model

/** 주차왕 (docs/api.md v1.2). 차 화면 C-13 · C-01 · C-05 에서 쓰는 모델 */
data class KingScoreParts(val total: Int, val maneuver: Int, val lotsVisited: Int, val improvement: Int)

data class KingStanding(
    val nickname: String,
    /** 순위판 제목 "판교 초보" */
    val leagueLabel: String,
    val rank: Int?,
    val total: Int,
    val percentile: Int?,
    val score: KingScoreParts?,
    val prevWeekRank: Int?,
    val nextHint: String?,
)

data class KingRow(val rank: Int, val nickname: String, val score: Int, val isMe: Boolean)

data class KingBoard(val top: List<KingRow>, val around: List<KingRow>, val demo: Boolean)

/** C-13 화면 상태 */
sealed interface KingUi {
    data object Loading : KingUi
    /** 서버에 닿지 않음 */
    data object Offline : KingUi
    data class NotJoined(val nickname: String, val leagueLabel: String, val joining: Boolean = false) : KingUi
    data class Joined(val standing: KingStanding, val board: KingBoard?) : KingUi
}

object KingCopy {
    /** "지난주 17등에서 올라왔어요" — 내려간 경우에도 평가하지 않는다 */
    fun movement(s: KingStanding): String? {
        val now = s.rank ?: return "이번 주 첫 주차를 기다리고 있어요"
        val prev = s.prevWeekRank ?: return "이번 주 처음 순위에 올랐어요"
        return when {
            prev > now -> "지난주 ${prev}등에서 올라왔어요"
            prev == now -> "지난주와 같은 ${now}등이에요"
            else -> "지난주는 ${prev}등이었어요"
        }
    }

    /** C-01 "주차왕 이번 주 12등" + "상위 8%" */
    fun homeLine(s: KingStanding): Pair<String, String?> =
        if (s.rank == null) "주차왕 이번 주 아직 순위 전" to null
        else "주차왕 이번 주 ${s.rank}등" to s.percentile?.let { "상위 $it%" }

    /** C-05 "주차왕 이번 주 12등 → 10등" */
    fun parkedLine(before: Int?, after: Int?): String? = when {
        after == null -> null
        before == null || before == after -> "주차왕 이번 주 ${after}등"
        else -> "주차왕 이번 주 ${before}등 → ${after}등"
    }
}
