package com.parkinggack.app.ui.components

import androidx.compose.runtime.remember
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.ui.theme.ParkingDimens
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/*
 * 버튼: 차 화면 최소 64dp, 주요 76dp. 그림자·그라데이션 없음. 주 버튼 = inverse 뒤집기.
 */

@Composable
private fun ButtonBase(
    text: String,
    onClick: (() -> Unit)?,
    modifier: Modifier,
    height: Dp,
    background: Color,
    contentColor: Color,
    border: Color?,
    borderWidth: Dp = 1.5.dp,
    fontSize: TextUnit,
    fontWeight: FontWeight,
    role: Role = Role.Button,
    horizontalPadding: Dp = 20.dp,
) {
    val shape = RoundedCornerShape(16.dp)
    val interaction = remember { MutableInteractionSource() }
    var m = modifier
        .pressBounce(interaction)
        .heightIn(min = height.coerceAtLeast(ParkingDimens.targetCar))
        .clip(shape)
        .background(background)
    if (border != null) m = m.parkingBorder(borderWidth, border, 16.dp)
    if (onClick != null) m = m.clickable(interactionSource = interaction, indication = LocalIndication.current, role = role, onClick = onClick)
    Box(m.padding(horizontal = horizontalPadding), contentAlignment = Alignment.Center) {
        Text(
            text,
            style = ParkingTheme.type.heading.sized(fontSize, 1.25f, fontWeight),
            color = contentColor,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
    }
}

/** 주 버튼 (inverse 채움, 76dp) */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = ParkingDimens.targetPrimary,
    fontSize: TextUnit = 22.sp,
    horizontalPadding: Dp = 20.dp,
) {
    val c = ParkingTheme.colors
    ButtonBase(
        text, onClick, modifier, height, c.inverse, c.onInverse, null,
        fontSize = fontSize, fontWeight = FontWeight.Bold, horizontalPadding = horizontalPadding,
    )
}

/** 보조 버튼 (line-strong 테두리) */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = ParkingDimens.targetPrimary,
    fontSize: TextUnit = 22.sp,
    fontWeight: FontWeight = FontWeight.Bold,
    transparent: Boolean = false,
    horizontalPadding: Dp = 20.dp,
) {
    val c = ParkingTheme.colors
    ButtonBase(
        text, onClick, modifier, height,
        if (transparent) Color.Transparent else c.surfaceRaised, c.ink, c.lineStrong,
        fontSize = fontSize, fontWeight = fontWeight, horizontalPadding = horizontalPadding,
    )
}

/** 약한 버튼 (line 테두리, 흐린 글자) */
@Composable
fun GhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = ParkingDimens.targetCar,
    fontSize: TextUnit = 20.sp,
) {
    val c = ParkingTheme.colors
    ButtonBase(text, onClick, modifier, height, c.surface, c.inkMuted, c.line, fontSize = fontSize, fontWeight = FontWeight.Medium)
}

/** 누를 수 없는 상태 안내 (예: "층을 먼저 골라 주세요"). 점선 테두리로 '아직'을 표시. */
@Composable
fun PendingButton(text: String, modifier: Modifier = Modifier, height: Dp = ParkingDimens.targetPrimary, fontSize: TextUnit = 20.sp) {
    val c = ParkingTheme.colors
    Box(
        modifier
            .heightIn(min = height)
            .dashedBorder(2.dp, c.lineStrong, 16.dp)
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = ParkingTheme.type.heading.sized(fontSize, 1.25f, FontWeight.Medium), color = c.inkMuted, textAlign = TextAlign.Center)
    }
}

/** 선택지 버튼. 선택됨 = inverse 뒤집기 */
@Composable
fun ChoiceButton(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 80.dp,
    fontSize: TextUnit = 28.sp,
) {
    val c = ParkingTheme.colors
    val shape = RoundedCornerShape(16.dp)
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier
            .bumpOn(selected, enabled = selected) // 고른 순간 톡
            .pressBounce(interaction)
            .heightIn(min = height.coerceAtLeast(ParkingDimens.targetCar))
            .clip(shape)
            .background(if (selected) c.inverse else c.surfaceRaised)
            .parkingBorder(2.dp, if (selected) c.inverse else c.line, 16.dp)
            .selectable(selected = selected, interactionSource = interaction, indication = LocalIndication.current, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = ParkingTheme.type.heading.sized(fontSize, 1.2f),
            color = if (selected) c.onInverse else c.ink,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
    }
}

/** 머리의 사각 아이콘 버튼 (뒤로·닫기·설정). 64dp. */
@Composable
fun IconSquareButton(
    glyph: Glyph,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = ParkingDimens.targetCar,
    filled: Boolean = true,
) {
    val c = ParkingTheme.colors
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier
            .pressBounce(interaction, pressedScale = 0.9f)
            .size(size.coerceAtLeast(ParkingDimens.targetCar))
            .clip(RoundedCornerShape(16.dp))
            .background(if (filled) c.surfaceRaised else Color.Transparent)
            .parkingBorder(1.5.dp, c.lineStrong, 16.dp)
            .semantics { this.contentDescription = contentDescription }
            .clickable(interactionSource = interaction, indication = LocalIndication.current, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        GlyphIcon(glyph, size = 26.dp, tint = c.ink)
    }
}

/** C-05 아래 큰 타일: 아이콘 + 제목 + 설명 (96dp) */
@Composable
fun ActionTile(
    glyph: Glyph,
    title: String,
    subtitle: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 96.dp,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier
            .pressBounce(interaction)
            .heightIn(min = height)
            .clip(RoundedCornerShape(16.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, c.lineStrong, 16.dp)
            .clickable(interactionSource = interaction, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        GlyphIcon(glyph, size = 28.dp, tint = c.ink)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = t.heading.sized(22.sp, 1.25f), maxLines = 1)
            if (subtitle != null) Text(subtitle, style = t.caption.sized(15.sp, 1.3f), color = c.inkMuted, maxLines = 1)
        }
    }
}

/** 켜기/끄기 모양 (96×56). 누르기는 감싸는 행 전체에서 받는다 (toggleable). 켜짐 = 채움 + 오른쪽 손잡이. */
@Composable
fun ToggleVisual(checked: Boolean, modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    Row(
        modifier
            .size(96.dp, 56.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(if (checked) c.inverse else c.surfaceRaised)
            .parkingBorder(2.dp, c.ink, 28.dp)
            .padding(4.dp),
        horizontalArrangement = if (checked) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(22.dp)).background(if (checked) c.onInverse else c.ink))
    }
}

/** 버튼 안 글자색을 바꿔야 할 때 */
@Composable
fun WithContentColor(color: Color, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalContentColor provides color, content = content)
}
