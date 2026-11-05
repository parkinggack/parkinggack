package com.parkinggack.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ReasonTag
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

enum class ChipSize { Regular, Small }

/**
 * 이유 태그·수치 칩. Regular = C-02 메인 (44, 아이콘 24, 18sp), Small = 상태 카드·후보 카드 (36, 15sp, 아이콘 없음).
 */
@Composable
fun TagChip(
    text: String,
    modifier: Modifier = Modifier,
    glyph: Glyph? = null,
    size: ChipSize = ChipSize.Regular,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val regular = size == ChipSize.Regular
    Row(
        modifier
            .height(if (regular) 44.dp else 36.dp)
            .parkingBorder(1.5.dp, c.line, 8.dp)
            .padding(horizontal = if (regular) 16.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (glyph != null && regular) GlyphIcon(glyph, size = 24.dp)
        Text(
            text,
            style = t.label.sized(if (regular) 18.sp else 15.sp, 1.2f, FontWeight.Medium),
            maxLines = 1,
        )
    }
}

@Composable
fun ReasonTagChip(tag: ReasonTag, modifier: Modifier = Modifier, size: ChipSize = ChipSize.Regular) {
    TagChip(tag.label, modifier, glyph = tag.glyph, size = size)
}

/** "평균 후진 3.2회" 같은 수치 칩 — 후진 이야기면 후진 아이콘 */
@Composable
fun StatChip(text: String, modifier: Modifier = Modifier, size: ChipSize = ChipSize.Regular) {
    TagChip(text, modifier, glyph = statGlyph(text), size = size)
}

internal fun statGlyph(text: String): Glyph? = when {
    "후진" in text -> Glyph.Reverse
    "램프" in text || "회전" in text -> Glyph.SpiralRamp
    "기둥" in text -> Glyph.ManyPillars
    "층" in text -> Glyph.ManyFloors
    else -> null
}

/** 이유 태그와 수치 칩을 시안 순서(태그 → 수치 → 태그 …)로 섞어 최대 [max]개 */
sealed interface ChipItem {
    data class Tag(val tag: ReasonTag) : ChipItem
    data class Stat(val text: String) : ChipItem
}

fun interleaveChips(tags: List<ReasonTag>, stats: List<String>, max: Int = 3): List<ChipItem> {
    val out = mutableListOf<ChipItem>()
    var ti = 0
    var si = 0
    while (out.size < max && (ti < tags.size || si < stats.size)) {
        if (ti < tags.size) out += ChipItem.Tag(tags[ti++])
        if (out.size < max && si < stats.size) out += ChipItem.Stat(stats[si++])
    }
    return out
}

@Composable
fun ChipItemView(item: ChipItem, size: ChipSize = ChipSize.Regular) {
    when (item) {
        is ChipItem.Tag -> ReasonTagChip(item.tag, size = size)
        is ChipItem.Stat -> StatChip(item.text, size = size)
    }
}

/**
 * 작은 표시 칩. 채움/테두리/점선을 골라 상태를 단어와 모양으로 보여 준다.
 * 예: "정차 중에만 보여요"(채움 line), "추천"(inverse), "후보 2"(테두리), "추정"(점선).
 */
@Composable
fun Pill(
    text: String,
    modifier: Modifier = Modifier,
    height: Dp = 34.dp,
    textStyle: TextStyle = ParkingTheme.type.label.sized(15.sp, 1.2f, FontWeight.Medium),
    textColor: Color = ParkingTheme.colors.ink,
    fill: Color? = null,
    border: Color? = ParkingTheme.colors.line,
    borderWidth: Dp = 1.5.dp,
    dashed: Boolean = false,
    horizontalPadding: Dp = 12.dp,
) {
    var m = modifier.height(height).clip(RoundedCornerShape(8.dp))
    if (fill != null) m = m.background(fill)
    if (border != null) m = m.parkingBorder(borderWidth, border, 8.dp, dashed)
    Box(m.padding(horizontal = horizontalPadding), contentAlignment = Alignment.Center) {
        Text(text, style = textStyle, color = textColor, maxLines = 1)
    }
}

/** "정차 중에만 보여요" */
@Composable
fun MutedPill(text: String, modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    Pill(
        text, modifier, height = 40.dp,
        textStyle = ParkingTheme.type.label.sized(16.sp, 1.2f, FontWeight.Medium),
        textColor = c.inkMuted, fill = c.line, border = null, horizontalPadding = 16.dp,
    )
}

/** C-05 보통 신뢰도: "추정" 점선 칩 */
@Composable
fun EstimateChip(modifier: Modifier = Modifier, text: String = "추정") {
    val c = ParkingTheme.colors
    Pill(
        text, modifier, height = 44.dp,
        textStyle = ParkingTheme.type.heading.sized(22.sp, 1.2f),
        textColor = c.inkMuted, border = c.lineStrong, borderWidth = 2.dp, dashed = true, horizontalPadding = 16.dp,
    )
}

/** 저장된 메모: 위치 아이콘 + "엘리베이터 2번 쪽" */
@Composable
fun NoteChip(text: String, modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    Row(
        modifier
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(c.surface)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        GlyphIcon(Glyph.Pin, size = 24.dp)
        Text(text, style = ParkingTheme.type.label.sized(18.sp, 1.2f, FontWeight.Medium), maxLines = 1)
    }
}

/** "P 주차 완료" 배지 */
@Composable
fun ParkedBadge(modifier: Modifier = Modifier, text: String = "주차 완료") {
    val c = ParkingTheme.colors
    Row(
        modifier
            .height(40.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, c.line, 8.dp)
            .padding(start = 8.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PMark(size = 28.dp)
        Text(text, style = ParkingTheme.type.label.sized(18.sp, 1.2f))
    }
}

/** 채운 원 안의 P */
@Composable
fun PMark(modifier: Modifier = Modifier, size: Dp = 28.dp) {
    val c = ParkingTheme.colors
    Box(modifier.size(size).clip(CircleShape).background(c.inverse), contentAlignment = Alignment.Center) {
        Text("P", style = ParkingTheme.type.label.sized(if (size >= 28.dp) 15.sp else 14.sp, 1f), color = c.onInverse)
    }
}

/** 테두리 원 안의 번호 (전환점 ①②③) */
@Composable
fun NumberMark(number: Int, modifier: Modifier = Modifier, size: Dp = 28.dp) {
    val c = ParkingTheme.colors
    Box(modifier.size(size).clip(CircleShape).parkingBorder(2.dp, c.ink, size / 2), contentAlignment = Alignment.Center) {
        Text("$number", style = ParkingTheme.type.label.sized(15.sp, 1f))
    }
}
