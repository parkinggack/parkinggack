package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.popIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.NavScaffold
import com.parkinggack.app.ui.components.NavTab
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.StatRow
import com.parkinggack.app.ui.components.bottomDivider
import com.parkinggack.app.ui.components.cssLineBox
import com.parkinggack.app.ui.theme.NotoSansKr
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * C-09 내 주차 기록: 월별 평균 후진 추이(작은 선 그래프) + 최근 기록 표. 왼쪽 아이콘 메뉴에서 '내 기록'.
 * 카피는 좋아진 것만 말한다 ([headline] 예: "지난달보다 후진이 1회 줄었어요").
 */
@Composable
fun HistoryScreen(
    records: List<ParkingRecord>,
    monthlyAvgReverse: List<Pair<String, Double>>,
    headline: String,
    onNav: (NavTab) -> Unit = {},
    onOpenSettings: () -> Unit = {},
    /** 행을 누르면 그 기록의 동선 리플레이(C-12). 궤적이 있는 기록만 눌린다 */
    onOpenRecord: (ParkingRecord) -> Unit = {},
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    NavScaffold(NavTab.Records, onNav, onOpenSettings) {
        Row(
            Modifier.weight(1f).fillMaxHeight().padding(start = 32.dp, end = 32.dp, top = 24.dp, bottom = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            ParkingCard(
                Modifier.weight(470f).fillMaxHeight().popIn(0),
                border = CardBorder.Strong,
                padding = PaddingValues(horizontal = 28.dp, vertical = 26.dp),
                spacing = 8.dp,
            ) {
                Text(
                    if (monthlyAvgReverse.isEmpty()) "평균 후진 횟수" else "평균 후진 횟수 · 최근 ${monthlyAvgReverse.size}개월",
                    style = t.label, color = c.inkMuted,
                )
                val headlineStyle = t.title.sized(30.sp, 1.3f)
                Text(headline, style = headlineStyle, modifier = Modifier.cssLineBox(headlineStyle))
                if (monthlyAvgReverse.isEmpty()) {
                    Spacer(Modifier.weight(1f))
                    Text("$EMPTY_RECORD_TITLE $EMPTY_RECORD_BODY", style = t.body, color = c.inkMuted)
                } else {
                    // 시안(676dp): 그래프 464 × 290을 카드 아래에 붙인다.
                    // 세로가 넉넉하면(Pleos 창) 숫자 칸을 더 보여 주고 그래프가 남는 높이를 모두 쓴다.
                    val now = LocalNowMs.current()
                    BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                        val roomy = maxHeight >= 520.dp
                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            if (roomy) {
                                Spacer(Modifier.height(4.dp))
                                StatRow(remember(records, now) { historyStats(records, now) }, Modifier.fillMaxWidth())
                                MonthlyChart(monthlyAvgReverse, Modifier.fillMaxWidth().weight(1f))
                            } else {
                                Spacer(Modifier.weight(1f))
                                MonthlyChart(monthlyAvgReverse, Modifier.fillMaxWidth().height(290.dp))
                            }
                        }
                    }
                }
            }
            ParkingCard(
                Modifier.weight(610f).fillMaxHeight().popIn(1),
                padding = PaddingValues(horizontal = 26.dp, vertical = 22.dp),
                spacing = 8.dp,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("최근 기록", style = t.heading, modifier = Modifier.weight(1f))
                    // 첫 실행 때 넣은 예시 기록(DemoSeed)이 섞여 있으면 알림 — 대시보드 '시연용 예시 데이터'와 같은 뜻
                    if (records.any { it.id.startsWith(ParkingRecord.SEED_ID_PREFIX) }) {
                        Text("예시 기록 포함 · 설정에서 지울 수 있어요", style = t.label.sized(15.sp, 1.3f, FontWeight.Normal), color = c.inkMuted)
                    }
                }
                if (records.isEmpty()) {
                    Text("$EMPTY_RECORD_TITLE $EMPTY_RECORD_BODY", style = t.body, color = c.inkMuted, modifier = Modifier.padding(top = 12.dp))
                } else {
                    RecordTable(records, Modifier.weight(1f), onOpenRecord)
                }
            }
        }
    }
}

@Composable
private fun RowScope.Cell(text: String, weight: Float, style: TextStyle, end: Boolean = false, color: androidx.compose.ui.graphics.Color = androidx.compose.ui.graphics.Color.Unspecified) {
    Text(
        text,
        style = style,
        color = color,
        textAlign = if (end) TextAlign.End else TextAlign.Start,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(weight).padding(end = if (end) 0.dp else 12.dp),
    )
}

// 표 칸 비율 (시안 C-09의 칸 폭 131 · 287 · 44 · 40 · 118)
private const val W_DATE = 131f
private const val W_PLACE = 287f
private const val W_FLOOR = 44f
private const val W_REVERSE = 40f
private const val W_TIME = 118f

@Composable
private fun RecordTable(records: List<ParkingRecord>, modifier: Modifier, onOpenRecord: (ParkingRecord) -> Unit) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val head = t.caption.sized(15.sp, 1.3f, FontWeight.Medium)
    val body = t.body.sized(19.sp, 1.3f)
    val bold = body.copy(fontWeight = FontWeight.Bold)
    Column(modifier) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 44.dp).bottomDivider(c.line, 1.5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Cell("날짜", W_DATE, head, color = c.inkMuted)
            Cell("장소", W_PLACE, head, color = c.inkMuted)
            Cell("층", W_FLOOR, head, color = c.inkMuted)
            Cell("후진", W_REVERSE, head, end = true, color = c.inkMuted)
            Cell("걸린 시간", W_TIME, head, end = true, color = c.inkMuted)
        }
        LazyColumn(Modifier.weight(1f, fill = false)) {
            itemsIndexed(records, key = { _, r -> r.id }) { i, r ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 76.dp)
                        .then(if (i < records.lastIndex) Modifier.bottomDivider(c.line) else Modifier)
                        .then(
                            if (r.trajectory.size >= 2 && r.summary != null)
                                Modifier.clickable(role = Role.Button, onClickLabel = "동선 다시 보기") { onOpenRecord(r) }
                            else Modifier
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Cell(formatDateShort(r.parkedAtMs), W_DATE, body, color = c.inkMuted)
                    Cell(r.lotName, W_PLACE, bold)
                    Cell(r.floor ?: "–", W_FLOOR, bold)
                    Cell(r.summary?.let { "${it.reverseCount}회" } ?: "–", W_REVERSE, body, end = true)
                    Cell(r.summary?.let { formatDurationKo(it.durationSec) } ?: "–", W_TIME, body, end = true)
                }
            }
        }
    }
}

/** 월별 평균 후진 횟수 선 그래프. 마지막 달만 채운 점 + 값 라벨. (홈 '내 주차'에서도 씀) */
@Composable
internal fun MonthlyChart(data: List<Pair<String, Double>>, modifier: Modifier) {
    val c = ParkingTheme.colors
    val measurer = rememberTextMeasurer()
    val desc = buildString {
        append("월별 평균 후진 횟수: ")
        append(data.joinToString(", ") { "${it.first} ${formatCount(it.second)}회" })
    }
    Canvas(modifier.semantics { contentDescription = desc }) {
        val axisStyle = TextStyle(fontFamily = NotoSansKr, fontSize = 16.sp, color = c.inkMuted)
        val left = 44.dp.toPx()
        val right = size.width - 16.dp.toPx()
        val top = 30.dp.toPx()
        val plotBottom = (size.height - 60.dp.toPx()).coerceAtLeast(top + 40f)
        val maxV = max(4.0, ceil(data.maxOf { it.second })).toInt()
        val step = if (maxV <= 5) 1 else 2
        // 가로 격자 + y 라벨
        var v = 0
        while (v <= maxV) {
            val y = plotBottom - (plotBottom - top) * v / maxV
            drawLine(if (v == 0) c.hatchA else c.line, Offset(left, y), Offset(right, y), 1.5.dp.toPx())
            val label = if (v == maxV) "${v}회" else "$v"
            val l = measurer.measure(label, axisStyle)
            drawText(l, topLeft = Offset(left - 10.dp.toPx() - l.size.width, y - l.size.height / 2f))
            v += step
        }
        val n = data.size
        val xs = if (n == 1) listOf((left + right) / 2) else data.indices.map { left + (right - left - 8.dp.toPx()) * it / (n - 1) }
        val ys = data.map { (plotBottom - (plotBottom - top) * (it.second / maxV)).toFloat() }
        if (n > 1) {
            val path = Path().apply {
                moveTo(xs[0], ys[0])
                for (i in 1 until n) lineTo(xs[i], ys[i])
            }
            drawPath(path, c.ink, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        for (i in 0 until n - 1) {
            drawCircle(c.surfaceRaised, 5.dp.toPx(), Offset(xs[i], ys[i]))
            drawCircle(c.ink, 5.dp.toPx(), Offset(xs[i], ys[i]), style = Stroke(2.5.dp.toPx()))
        }
        val lastP = Offset(xs.last(), ys.last())
        drawCircle(c.ink, 8.dp.toPx(), lastP)
        val valueLabel = measurer.measure("${formatCount(data.last().second)}회", TextStyle(fontFamily = NotoSansKr, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = c.ink))
        // 값 라벨은 점 왼쪽. 들어오는 선이 위에서 내려오면(값이 줄었으면) 점 아래에, 아니면 위에 — 선이 글자를 지나가지 않게
        val gap = 14.dp.toPx()
        val lw = valueLabel.size.width
        val lh = valueLabel.size.height
        val fromAbove = n > 1 && ys[n - 2] < lastP.y
        val below = lastP.y + gap
        val ly = if (!fromAbove) {
            lastP.y - gap - lh
        } else if (below + lh <= plotBottom - 4.dp.toPx()) {
            below
        } else {
            // 아래 자리가 없으면(값이 0 근처) 선보다 더 위로
            val slope = (ys[n - 2] - lastP.y) / (lastP.x - xs[n - 2]).coerceAtLeast(1f)
            min(lastP.y - gap - lh, lastP.y - slope * lw - 6.dp.toPx() - lh).coerceAtLeast(0f)
        }
        drawText(valueLabel, topLeft = Offset(lastP.x - lw, ly))
        // x 라벨
        data.forEachIndexed { i, (month, _) ->
            val l = measurer.measure(month, axisStyle)
            val x = (xs[i] - l.size.width / 2f).coerceIn(0f, size.width - l.size.width)
            drawText(l, topLeft = Offset(x, plotBottom + 18.dp.toPx()))
        }
    }
}

@CarPreview
@Composable
private fun HistoryPreview() = PreviewFrame {
    HistoryScreen(PreviewData.records, PreviewData.monthlyAvgReverse, "지난달보다 후진이 1회 줄었어요")
}

@CarPreviewLight
@Composable
private fun HistoryLightPreview() = PreviewFrame(dark = false) {
    HistoryScreen(PreviewData.records, PreviewData.monthlyAvgReverse, "지난달보다 후진이 1회 줄었어요")
}

@CarPreview
@Composable
private fun HistoryEmptyPreview() = PreviewFrame {
    HistoryScreen(emptyList(), emptyList(), "첫 기록을 기다리고 있어요")
}
