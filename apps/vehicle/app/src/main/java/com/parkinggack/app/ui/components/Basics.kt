package com.parkinggack.app.ui.components

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.hero

enum class CardBorder { None, Subtle, Strong, Dashed, Selected }

/** 카드: surface-raised 바탕, 12dp 모서리. 테두리로 강조·데이터 부족(점선)을 구분. */
@Composable
fun ParkingCard(
    modifier: Modifier = Modifier,
    border: CardBorder = CardBorder.Subtle,
    background: Color = ParkingTheme.colors.surfaceRaised,
    radius: Dp = 12.dp,
    padding: PaddingValues = PaddingValues(24.dp),
    spacing: Dp = 12.dp,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = ParkingTheme.colors
    val interaction = remember { MutableInteractionSource() }
    var m = (if (onClick != null) modifier.pressBounce(interaction, pressedScale = 0.98f) else modifier)
        .clip(RoundedCornerShape(radius)).background(background)
    m = when (border) {
        CardBorder.None -> m
        CardBorder.Subtle -> m.parkingBorder(1.5.dp, c.line, radius)
        CardBorder.Strong -> m.parkingBorder(1.5.dp, c.lineStrong, radius)
        CardBorder.Dashed -> m.dashedBorder(1.5.dp, c.lineStrong, radius)
        CardBorder.Selected -> m.parkingBorder(2.5.dp, c.ink, radius)
    }
    if (onClick != null) m = m.clickable(interactionSource = interaction, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
    // 시안(CSS border-box)처럼 내용은 테두리 안쪽에서 padding만큼 떨어진다
    val borderWidth = when (border) {
        CardBorder.None -> 0.dp
        CardBorder.Selected -> 2.5.dp
        else -> 1.5.dp
    }
    Column(m.padding(borderWidth).padding(padding), verticalArrangement = Arrangement.spacedBy(spacing), content = content)
}

/** 진행 막대 (8dp 트랙 + 채움) */
@Composable
fun ProgressTrack(progress: Float, modifier: Modifier = Modifier, height: Dp = 8.dp) {
    val c = ParkingTheme.colors
    Canvas(modifier.fillMaxWidth().height(height)) {
        val r = CornerRadius(size.height / 2, size.height / 2)
        drawRoundRect(c.track, cornerRadius = r)
        val w = size.width * progress.coerceIn(0f, 1f)
        if (w > 0f) drawRoundRect(c.ink, size = Size(w, size.height), cornerRadius = r)
    }
}

/**
 * 한 줄 글자를 폭에 맞춰 줄인다 (층·구역처럼 크게 보여야 하는 값).
 * [maxSize]에서 시작해 들어갈 때까지 4sp씩 줄인다.
 */
@Composable
fun FitText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    maxSize: TextUnit = style.fontSize,
    minSize: TextUnit = 28.sp,
    color: Color = Color.Unspecified,
) {
    BoxWithConstraints(modifier) {
        val measurer = rememberTextMeasurer()
        val density = LocalDensity.current
        val maxPx = with(density) { maxWidth.toPx() }
        val fitted = remember(text, style, maxPx, maxSize, minSize) {
            var size = maxSize.value
            while (size > minSize.value) {
                val ts = style.copy(fontSize = size.sp, lineHeight = (size * lineRatio(style)).sp)
                val w = measurer.measure(text, ts, maxLines = 1, softWrap = false).size.width
                if (w <= maxPx || !maxPx.isFinite()) break
                size -= 4f
            }
            style.copy(fontSize = size.sp, lineHeight = (size * lineRatio(style)).sp)
        }
        // 시안의 큰 숫자는 `line-height: 1` 근처 → 자리 높이를 줄 높이에 맞춘다
        Text(text, style = fitted, color = color, maxLines = 1, softWrap = false, modifier = Modifier.cssLineBox(fitted))
    }
}

private fun lineRatio(style: TextStyle): Float {
    val fs = style.fontSize
    val lh = style.lineHeight
    return if (fs.isSp && lh.isSp && fs.value > 0f) lh.value / fs.value else 1f
}

/** 아주 큰 층 글자 ("B2", 시안 C-05: 220px · 줄 높이 0.85 · 자간 -6px). 폭이 모자라면 줄어든다. */
@Composable
fun BigFloorText(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 220.sp,
    color: Color = ParkingTheme.colors.ink,
) {
    FitText(
        text = text,
        style = ParkingTheme.type.display.hero(fontSize, (-0.027).em, lineHeight = 0.85f),
        modifier = modifier,
        minSize = 72.sp,
        color = color,
    )
}
