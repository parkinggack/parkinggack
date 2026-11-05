package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.popIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.LotSuggestion
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.ui.components.AppHeader
import com.parkinggack.app.ui.components.BadgeStyle
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.ChipSize
import com.parkinggack.app.ui.components.DifficultyBadge
import com.parkinggack.app.ui.components.LotsMap
import com.parkinggack.app.ui.components.MutedPill
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.Pill
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.ReasonTagChip
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.cssLineBox
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.theme.NotoSansKr
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized
import kotlin.math.cos
import kotlin.math.max

/**
 * C-03 더 쉬운 주차장 비교 (정차 중에만). 첫 후보 = 추천 (굵은 테두리 + 주 버튼).
 *
 * 왼쪽: 지금 도착지 + 지도(도착지 핀, 후보 번호 핀 1·2·3). 오른쪽: 후보를 가로로 긴 줄 카드로 위에서 아래로.
 * 시안은 세로 카드 4장을 옆으로 놓았는데, Pleos 창(1280×921dp)에서는 카드가 세로로만 길어지고 가운데가 비어서 바꿨다.
 * 줄 카드는 높이가 넉넉하면(Pleos 창) 점수를 크게, 시안 크기(1280×676dp)에서는 한 줄로 줄여 보여 준다.
 */
@Composable
fun EasierLotsScreen(
    current: ParkingLot,
    suggestions: List<LotSuggestion>,
    onRouteVia: (LotSuggestion) -> Unit,
    onBack: () -> Unit,
) {
    val c = ParkingTheme.colors
    val shown = suggestions.take(3)
    Column(Modifier.fillMaxSize().background(c.surface)) {
        AppHeader(title = "더 쉬운 주차장", onBack = onBack) {
            MutedPill("정차 중에만 보여요")
        }
        Row(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 32.dp, vertical = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            CurrentLotAside(current, shown, Modifier.weight(5f).fillMaxHeight().popIn(0))
            Column(Modifier.weight(7f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (shown.isEmpty()) {
                    ParkingCard(Modifier.fillMaxWidth().weight(1f).popIn(1), border = CardBorder.Dashed) {
                        Text("근처에 더 쉬운 주차장이 아직 없어요", style = ParkingTheme.type.heading)
                        Text("지금 도착지로 그대로 안내할게요", style = ParkingTheme.type.body, color = c.inkMuted)
                    }
                }
                shown.forEachIndexed { i, s ->
                    SuggestionRow(s, i, { onRouteVia(s) }, Modifier.fillMaxWidth().weight(1f).popIn(1 + i))
                }
                // 후보가 3곳보다 적어도 줄 높이는 같게
                if (shown.isNotEmpty()) repeat(3 - shown.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun CurrentLotAside(current: ParkingLot, suggestions: List<LotSuggestion>, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    ParkingCard(modifier, border = CardBorder.Dashed, background = c.surface, padding = PaddingValues(20.dp), spacing = 10.dp) {
        Text("지금 도착지", style = t.label, color = c.inkMuted)
        val nameStyle = t.heading.sized(22.sp, 1.3f)
        Text(current.name, style = nameStyle, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.cssLineBox(nameStyle))
        DifficultyBadge(
            if (current.hasEnoughData) current.difficulty else null,
            style = BadgeStyle.Inline,
            inlineTextStyle = t.heading.sized(22.sp, 1.3f, FontWeight.Bold),
            inlineGap = 10.dp,
        )
        Spacer(Modifier.size(2.dp))
        val desc = "${current.name}과 주변 후보 주차장 ${suggestions.size}곳 지도"
        LotsMap(
            destination = current.location,
            candidates = suggestions.map { it.lot.location },
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(c.placeholder)
                .parkingBorder(1.dp, c.line, 12.dp)
                .semantics { contentDescription = desc },
        ) {
            NearbySketch(current, suggestions, Modifier.fillMaxSize())
        }
        // 요금 출처 (공공누리: 출처 표시) — 요금이 한 곳이라도 보일 때만
        suggestions.firstNotNullOfOrNull { it.lot.feeSource?.takeIf { _ -> it.lot.feeText != null } }?.let {
            Text("요금: $it", style = t.caption.sized(14.sp, 1.35f), color = c.inkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * 지도 자리 표시 (스냅숏·미리보기 — 네트워크 없음): 도착지와 후보의 상대 위치(위경도 → 평면)를 점과 번호로만.
 * 번호 핀 모양은 실제 지도([LotsMap])와 같다.
 */
@Composable
private fun NearbySketch(current: ParkingLot, suggestions: List<LotSuggestion>, modifier: Modifier) {
    val c = ParkingTheme.colors
    val measurer = rememberTextMeasurer()
    Canvas(modifier) {
        val pts = listOf(current.location) + suggestions.map { it.lot.location }
        val lat0 = current.location.lat
        val kx = cos(Math.toRadians(lat0))
        val xy = pts.map { Offset(((it.lng - current.location.lng) * kx).toFloat(), (-(it.lat - lat0)).toFloat()) }
        val minX = xy.minOf { it.x }
        val maxX = xy.maxOf { it.x }
        val minY = xy.minOf { it.y }
        val maxY = xy.maxOf { it.y }
        val pad = 40.dp.toPx()
        val spanX = max(maxX - minX, 1e-6f)
        val spanY = max(maxY - minY, 1e-6f)
        val k = minOf((size.width - pad * 2) / spanX, (size.height - pad * 2) / spanY)
        val cx = (minX + maxX) / 2
        val cy = (minY + maxY) / 2
        fun toScreen(o: Offset) = Offset(size.width / 2 + (o.x - cx) * k, size.height / 2 + (o.y - cy) * k)

        // 잔잔한 격자 (도로 느낌만)
        val step = 48.dp.toPx()
        var gx = step / 2
        while (gx < size.width) { drawLine(c.surfaceRaised, Offset(gx, 0f), Offset(gx, size.height), 6.dp.toPx()); gx += step * 1.7f }
        var gy = step / 2
        while (gy < size.height) { drawLine(c.surfaceRaised, Offset(0f, gy), Offset(size.width, gy), 6.dp.toPx()); gy += step * 1.4f }

        val numStyle = TextStyle(fontFamily = NotoSansKr, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = c.ink)
        xy.drop(1).forEachIndexed { i, o ->
            val p = toScreen(o)
            drawCircle(c.surface, 20.dp.toPx(), p)
            drawCircle(c.ink, 20.dp.toPx(), p, style = Stroke(3.dp.toPx()))
            val l = measurer.measure("${i + 1}", numStyle)
            drawText(l, topLeft = Offset(p.x - l.size.width / 2f, p.y - l.size.height / 2f))
        }
        val d = toScreen(xy.first())
        drawCircle(c.ink, 18.dp.toPx(), d)
        drawCircle(c.surface, 12.dp.toPx(), d)
        drawCircle(c.ink, 6.dp.toPx(), d)
    }
}

/** 지도 핀과 같은 모양의 번호 (바탕색 원 + 굵은 테 + 번호) — 카드와 지도의 짝을 맞춘다 */
@Composable
private fun PinNumber(number: Int, modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    Box(
        modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(c.surface)
            .parkingBorder(3.dp, c.ink, 20.dp)
            .clearAndSetSemantics { contentDescription = "지도 $number 번" },
        contentAlignment = Alignment.Center,
    ) {
        Text("$number", style = ParkingTheme.type.heading.sized(20.sp, 1f, FontWeight.Bold))
    }
}

/** 이 높이 이상이면 점수를 크게(BadgeStyle.Medium), 아니면 한 줄(Inline) */
private val ROOMY_ROW = 190.dp

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SuggestionRow(s: LotSuggestion, index: Int, onRoute: () -> Unit, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val recommended = index == 0
    val difficulty = if (s.lot.hasEnoughData) s.lot.difficulty else null
    val pitch = s.pitch.ifBlank { "걸어서 ${s.walkMinutes}분" }
    ParkingCard(
        modifier,
        border = if (recommended) CardBorder.Selected else CardBorder.Subtle,
        padding = PaddingValues(horizontal = 24.dp, vertical = 16.dp),
        spacing = 0.dp,
    ) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val roomy = maxHeight >= ROOMY_ROW
            Row(
                Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(if (roomy) 14.dp else 8.dp)) {
                    // 지도 번호 · 이름 · 추천
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        PinNumber(index + 1)
                        val nameStyle = t.heading.sized(22.sp, 1.3f)
                        Text(
                            s.lot.name,
                            style = nameStyle,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (recommended) {
                            Pill(
                                "추천", height = 30.dp, textStyle = t.caption.copy(fontWeight = FontWeight.Bold),
                                textColor = c.onInverse, fill = c.inverse, border = null,
                            )
                        }
                    }
                    // 난이도 · 걸어서 몇 분
                    if (roomy) {
                        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                            DifficultyBadge(difficulty, style = BadgeStyle.Medium)
                            // "걸어서 9분, 평면이라 편해요" → 두 줄로 나눠 단어 중간에서 끊기지 않게
                            val parts = pitch.split(", ", limit = 2)
                            Column(Modifier.padding(bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(parts[0], style = t.heading.sized(20.sp, 1.35f, FontWeight.Bold), maxLines = 1)
                                parts.getOrNull(1)?.let {
                                    Text(it, style = t.heading.sized(18.sp, 1.35f), color = c.inkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            DifficultyBadge(
                                difficulty,
                                style = BadgeStyle.Inline,
                                inlineTextStyle = t.heading.sized(20.sp, 1.3f, FontWeight.Bold),
                                inlineGap = 10.dp,
                            )
                            Text(
                                pitch, style = t.heading.sized(18.sp, 1.3f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                        }
                    }
                    // 태그 · 요금 (요금은 공공데이터에 있는 곳만)
                    val fee = s.lot.feeText
                    if (s.lot.tags.isNotEmpty() || fee != null) {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            s.lot.tags.take(3).forEach { ReasonTagChip(it, size = ChipSize.Small) }
                            if (fee != null) {
                                Text(
                                    "요금 $fee",
                                    style = t.caption.sized(15.sp, 1.35f),
                                    color = c.inkMuted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    // 칩(32dp) 줄의 가운데에 맞춤
                                    modifier = Modifier.align(Alignment.CenterVertically).padding(start = 4.dp),
                                )
                            }
                        }
                    }
                }
                val buttonModifier = Modifier.width(196.dp)
                if (recommended) {
                    PrimaryButton("경유지로 안내", onRoute, buttonModifier)
                } else {
                    SecondaryButton("경유지로 안내", onRoute, buttonModifier, transparent = true)
                }
            }
        }
    }
}

@CarPreview
@Composable
private fun EasierLotsPreview() = PreviewFrame {
    EasierLotsScreen(PreviewData.hyundai, PreviewData.suggestions, onRouteVia = {}, onBack = {})
}

@CarPreviewLight
@Composable
private fun EasierLotsLightPreview() = PreviewFrame(dark = false) {
    EasierLotsScreen(PreviewData.hyundai, PreviewData.suggestions.take(2), onRouteVia = {}, onBack = {})
}
