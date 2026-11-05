package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.popIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.LotStats
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.ui.components.BadgeStyle
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.ChipItemView
import com.parkinggack.app.ui.components.DifficultyBadge
import com.parkinggack.app.ui.components.DifficultyTone
import com.parkinggack.app.ui.components.Glyph
import com.parkinggack.app.ui.components.IconSquareButton
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.bottomDivider
import com.parkinggack.app.ui.components.interleaveChips
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.components.toneOf
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized
import kotlin.math.max

/**
 * C-08 주차장 상세: 점수의 근거(전체 평균 대비 막대 + 세로선), 층별 혼잡 막대, 요일×시간 히트맵(색상 아닌 채움 농도).
 */
@Composable
fun LotDetailScreen(
    lot: ParkingLot,
    myAvgReverse: Double?,
    onRouteVia: () -> Unit,
    onRate: () -> Unit,
    onBack: () -> Unit,
) {
    val c = ParkingTheme.colors
    val stats = lot.stats
    Column(Modifier.fillMaxSize().background(c.surface)) {
        DetailHeader(lot, onRouteVia, onRate, onBack)
        Row(
            Modifier.weight(1f).fillMaxWidth().padding(start = 32.dp, end = 32.dp, top = 20.dp, bottom = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (stats == null || !lot.hasEnoughData) {
                SparseDetail(lot, Modifier.weight(1f).fillMaxHeight().popIn(0))
            } else {
                ReasonsCard(lot, stats, myAvgReverse, Modifier.weight(1f).fillMaxHeight().popIn(0))
                FloorCongestionCard(stats, Modifier.weight(1f).fillMaxHeight().popIn(1))
                HeatmapCard(stats, Modifier.weight(1f).fillMaxHeight().popIn(2))
            }
        }
    }
}

@Composable
private fun DetailHeader(lot: ParkingLot, onRouteVia: () -> Unit, onRate: () -> Unit, onBack: () -> Unit) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Row(
        Modifier
            .fillMaxWidth()
            .height(112.dp)
            .background(c.surfaceRaised)
            .bottomDivider(c.line)
            .padding(horizontal = 32.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        IconSquareButton(Glyph.Back, "뒤로", onBack)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(lot.name, style = t.title.sized(28.sp, 1.25f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (lot.hasEnoughData) "최근 30일 · 차량 ${lot.sampleCount}대 기준" else "아직 기록이 적어요 (${lot.sampleCount}대)",
                style = t.label.sized(16.sp, 1.3f, FontWeight.Normal),
                color = c.inkMuted,
            )
        }
        DifficultyBadge(if (lot.hasEnoughData) lot.difficulty else null, Modifier.padding(end = 8.dp), style = BadgeStyle.Medium)
        // 시안: 머리 버튼은 둘 다 64 (차 화면 최소 크기), 좌우 여백 22 / 26
        SecondaryButton("별점 남기기", onRate, height = 64.dp, fontSize = 20.sp, fontWeight = FontWeight.Medium, horizontalPadding = 22.dp)
        PrimaryButton("경유지로 안내", onRouteVia, height = 64.dp, fontSize = 20.sp, horizontalPadding = 26.dp)
    }
}

/** 값 막대 + 전체 평균 세로선 */
@Composable
private fun MetricBar(name: String, value: String, fraction: Float, avgFraction: Float, caption: String) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(name, style = t.body.sized(18.sp, 1.3f, FontWeight.Medium), modifier = Modifier.weight(1f))
            Text(value, style = t.heading.sized(24.sp, 1.2f))
        }
        // 막대 14 (시안). 평균 세로선(24)은 위아래로 5씩 삐져나오지만 자리는 차지하지 않는다.
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(14.dp)
                .semantics { contentDescription = "$name $value. $caption" },
        ) {
            val barH = size.height
            val r = CornerRadius(barH / 2, barH / 2)
            drawRoundRect(c.track, Offset.Zero, Size(size.width, barH), r)
            drawRoundRect(c.ink, Offset.Zero, Size(size.width * fraction.coerceIn(0f, 1f), barH), r)
            val mx = size.width * avgFraction.coerceIn(0f, 1f)
            val mw = 3.dp.toPx()
            val over = 5.dp.toPx()
            // 평균선은 막대 채움 위에서도 보이게 바탕색 테두리를 둘러 그림
            drawRect(c.surfaceRaised, Offset(mx - mw / 2 - 1.5f * density, -over), Size(mw + 3f * density, barH + over * 2))
            drawRect(c.inkMuted, Offset(mx - mw / 2, -over), Size(mw, barH + over * 2))
        }
        Text(caption, style = t.caption, color = c.inkMuted)
    }
}

private fun scaleMax(nice: Double, vararg values: Double) = max(nice, values.maxOrNull()?.times(1.25) ?: nice)

@Composable
private fun ReasonsCard(lot: ParkingLot, s: LotStats, myAvgReverse: Double?, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val title = when (toneOf(lot.difficulty, lot.hasEnoughData)) {
        DifficultyTone.HARD -> "왜 어려울까요"
        DifficultyTone.EASY -> "왜 편할까요"
        else -> "점수의 근거"
    }
    ParkingCard(modifier, padding = PaddingValues(22.dp), spacing = 18.dp) {
        Text(title, style = t.heading)
        val rMax = scaleMax(5.0, s.avgReverse, s.overallAvgReverse)
        MetricBar(
            "평균 후진", "${formatCount(s.avgReverse)}회",
            (s.avgReverse / rMax).toFloat(), (s.overallAvgReverse / rMax).toFloat(),
            "세로선 = 전체 평균 ${formatCount(s.overallAvgReverse)}회",
        )
        val tMax = scaleMax(4.0, s.avgRampTurns, s.overallAvgRampTurns)
        MetricBar(
            "램프 회전", "${formatCount(s.avgRampTurns)}바퀴",
            (s.avgRampTurns / tMax).toFloat(), (s.overallAvgRampTurns / tMax).toFloat(),
            "전체 평균 ${formatCount(s.overallAvgRampTurns)}바퀴",
        )
        val dMax = scaleMax(200.0, s.avgDurationSec.toDouble(), s.overallAvgDurationSec.toDouble())
        MetricBar(
            "진입 → 주차", formatDurationKo(s.avgDurationSec),
            (s.avgDurationSec / dMax).toFloat(), (s.overallAvgDurationSec / dMax).toFloat(),
            "전체 평균 ${formatDurationKo(s.overallAvgDurationSec)}",
        )
        Spacer(Modifier.weight(1f))
        if (myAvgReverse != null) {
            SummaryBox("나는 여기서 평균 후진 ${formatCount(myAvgReverse)}회")
        }
    }
}

@Composable
private fun SummaryBox(text: String) {
    val c = ParkingTheme.colors
    Text(
        text,
        style = ParkingTheme.type.label.sized(18.sp, 1.35f),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(c.surface)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    )
}

/** 0.0~1.0 → "만차" / "붐빔" / "여유" (색이 아니라 단어 + 막대 길이 + 채움 밝기) */
private fun congestionWord(v: Double) = when {
    v >= 0.95 -> "만차"
    v >= 0.7 -> "붐빔"
    else -> "여유"
}

@Composable
private fun FloorCongestionCard(s: LotStats, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    ParkingCard(modifier, padding = PaddingValues(22.dp), spacing = 16.dp) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("층별 혼잡", style = t.heading, modifier = Modifier.weight(1f))
            Text(s.congestionLabel, style = t.caption.sized(15.sp, 1.3f), color = c.inkMuted)
        }
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            s.floorCongestion.take(6).forEach { f ->
                val word = congestionWord(f.occupancy)
                Row(
                    Modifier.semantics(mergeDescendants = true) { contentDescription = "${f.floor} $word" },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(f.floor, style = t.heading, modifier = Modifier.width(44.dp))
                    Canvas(Modifier.weight(1f).height(28.dp)) {
                        val r = CornerRadius(6.dp.toPx(), 6.dp.toPx())
                        drawRoundRect(c.track, cornerRadius = r)
                        val busy = f.occupancy >= 0.8
                        drawRoundRect(
                            if (busy) c.ink else c.lineStrong,
                            size = Size(size.width * f.occupancy.toFloat().coerceIn(0f, 1f), size.height),
                            cornerRadius = r,
                        )
                    }
                    Text(word, style = t.label.sized(17.sp, 1.2f), textAlign = TextAlign.End, modifier = Modifier.width(44.dp))
                }
            }
        }
        Spacer(Modifier.weight(1f))
        SummaryBox(s.congestionSummary)
    }
}

/** 시안 C-08 히트맵 칸 36 × 30 (간격 6) */
private val HEAT_CELL_W = 36.dp
private val HEAT_CELL_H = 30.dp

@Composable
private fun HeatmapCard(s: LotStats, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val shades: List<Color> = listOf(c.surfaceRaised, c.hatchB, c.hatchA, c.inkMuted, c.ink)
    val days = listOf("월", "화", "수", "목", "금", "토", "일")
    ParkingCard(modifier, padding = PaddingValues(22.dp), spacing = 14.dp) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("시간대별", style = t.heading, modifier = Modifier.weight(1f))
            Text("진할수록 붐빔", style = t.caption.sized(15.sp, 1.3f), color = c.inkMuted)
        }
        Column(
            Modifier.semantics(mergeDescendants = true) { contentDescription = "요일·시간대별 혼잡 히트맵. 진할수록 붐빔" },
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(Modifier.clearAndSetSemantics { }, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Spacer(Modifier.width(28.dp))
                s.hourLabels.forEach { h ->
                    Text(h, style = t.caption, color = c.inkMuted, textAlign = TextAlign.Center, modifier = Modifier.width(HEAT_CELL_W), maxLines = 1)
                }
            }
            s.hourlyHeat.take(7).forEachIndexed { di, row ->
                Row(Modifier.clearAndSetSemantics { }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(days.getOrElse(di) { "" }, style = t.caption.sized(15.sp, 1.2f, FontWeight.Medium), color = c.inkMuted, modifier = Modifier.width(28.dp))
                    val cols = max(row.size, s.hourLabels.size)
                    for (i in 0 until cols) {
                        val v = row.getOrNull(i)
                        val lvl = if (v == null) 0 else (v * 5).toInt().coerceIn(0, 4)
                        Box(
                            Modifier
                                .size(HEAT_CELL_W, HEAT_CELL_H)
                                .clip(RoundedCornerShape(5.dp))
                                .background(shades[lvl])
                                .parkingBorder(1.dp, c.line, 5.dp),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.weight(1f))
        Row(Modifier.clearAndSetSemantics { }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("한산", style = t.caption, color = c.inkMuted)
            shades.forEachIndexed { i, shade ->
                Box(
                    Modifier
                        .size(22.dp, 14.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(shade)
                        .then(if (i == 0) Modifier.parkingBorder(1.dp, c.line, 3.dp) else Modifier),
                )
            }
            Text("붐빔", style = t.caption, color = c.inkMuted)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SparseDetail(lot: ParkingLot, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    ParkingCard(modifier, border = CardBorder.Dashed, padding = PaddingValues(28.dp), spacing = 14.dp) {
        Text("아직 기록이 적어요. 첫 기록을 남겨 주세요", style = t.title.sized(28.sp, 1.3f))
        Text(
            "기록이 ${com.parkinggack.app.model.ParkingLot.MIN_SAMPLES}대 이상 모이면 근거와 혼잡 정보를 보여 드릴게요",
            style = t.body,
            color = c.inkMuted,
        )
        val chips = interleaveChips(lot.tags, lot.statChips, 4)
        if (chips.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                chips.forEach { ChipItemView(it) }
            }
        }
        if (lot.publicInfo.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth(0.5f).clip(RoundedCornerShape(12.dp)).background(c.surface).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("공공데이터 기본 정보", style = t.caption.copy(fontWeight = FontWeight.Bold), color = c.inkMuted)
                lot.publicInfo.forEach { Text(it, style = t.body.sized(16.sp, 1.4f)) }
            }
        }
    }
}

@CarPreview
@Composable
private fun LotDetailPreview() = PreviewFrame {
    LotDetailScreen(PreviewData.hyundai, myAvgReverse = 2.0, onRouteVia = {}, onRate = {}, onBack = {})
}

@CarPreviewLight
@Composable
private fun LotDetailLightPreview() = PreviewFrame(dark = false) {
    LotDetailScreen(PreviewData.hyundai, myAvgReverse = null, onRouteVia = {}, onRate = {}, onBack = {})
}

@CarPreview
@Composable
private fun LotDetailSparsePreview() = PreviewFrame {
    LotDetailScreen(PreviewData.sparseLot, myAvgReverse = null, onRouteVia = {}, onRate = {}, onBack = {})
}
