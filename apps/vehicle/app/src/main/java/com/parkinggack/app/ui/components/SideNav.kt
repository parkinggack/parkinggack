package com.parkinggack.app.ui.components

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.parkinggack.app.ui.theme.ParkingDimens
import com.parkinggack.app.ui.theme.ParkingTheme

/** 왼쪽 아이콘 메뉴의 칸 (설정은 맨 아래 따로) */
enum class NavTab(val label: String, val glyph: Glyph) {
    Home("홈", Glyph.Home),
    Records("내 기록", Glyph.Records),
    King("주차왕", Glyph.Crown),
}

/** 왼쪽 메뉴 폭 (시안 112px) */
val SideNavWidth = 112.dp

/**
 * 왼쪽 아이콘 메뉴 + 오른쪽 화면 (C-01 · C-09 · C-13).
 * 정차 중 화면에만 있다 — 주행 중에는 C-04 오버레이가 화면 전체를 덮는다.
 */
@Composable
fun NavScaffold(
    selected: NavTab,
    onSelect: (NavTab) -> Unit,
    onSettings: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(modifier.fillMaxSize().background(ParkingTheme.colors.surface)) {
        SideNav(selected, onSelect, onSettings)
        content()
    }
}

/**
 * 왼쪽 아이콘 메뉴 (112dp, chrome 바탕, 오른쪽 1px 구분선): 로고 → 홈 · 내 기록 · 주차왕 … 맨 아래 설정.
 * 고른 칸은 inverse로 뒤집는다 (색이 아니라 채움). 칸은 76dp (주요 버튼 크기), 아이콘만이라 접근성 이름을 붙인다.
 * [enabled]가 false면 아이콘만 보이고 눌리지 않는다 (주행 중 C-04: 터치 입력 없음).
 */
@Composable
fun SideNav(
    selected: NavTab?,
    onSelect: (NavTab) -> Unit,
    onSettings: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val c = ParkingTheme.colors
    Column(
        modifier
            .fillMaxHeight()
            .width(SideNavWidth)
            .background(c.chrome)
            .endDivider(c.line)
            .padding(top = 28.dp, bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // 로고도 홈으로 (시안: 52px, 아래 22px 더 띄움)
        Box(
            Modifier
                .padding(bottom = 22.dp)
                .clip(RoundedCornerShape(13.dp))
                .clickable(enabled = enabled, role = Role.Button, onClickLabel = "홈으로") { onSelect(NavTab.Home) },
        ) {
            LogoMark(size = 52.dp, contentDescription = "주차각 홈")
        }
        NavTab.entries.forEach { tab ->
            NavItem(tab.glyph, tab.label, selected == tab, enabled = enabled, onClick = { onSelect(tab) })
        }
        Spacer(Modifier.weight(1f))
        NavItem(Glyph.Settings, "설정", selected = false, iconSize = 30.dp, enabled = enabled, onClick = onSettings)
    }
}

@Composable
private fun NavItem(glyph: Glyph, label: String, selected: Boolean, iconSize: Dp = 32.dp, enabled: Boolean = true, onClick: () -> Unit) {
    val c = ParkingTheme.colors
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .pressBounce(interaction, pressedScale = 0.9f)
            .size(ParkingDimens.targetPrimary)
            .clip(RoundedCornerShape(22.dp))
            .background(if (selected) c.inverse else Color.Transparent)
            .semantics { contentDescription = label }
            .selectable(
                selected = selected,
                interactionSource = interaction,
                indication = LocalIndication.current,
                enabled = enabled,
                role = Role.Tab,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        GlyphIcon(glyph, size = iconSize, tint = if (selected) c.onInverse else c.inkMuted)
    }
}

/** 오른쪽 1px 구분선 */
private fun Modifier.endDivider(color: Color, width: Dp = 1.dp): Modifier = drawBehind {
    val w = width.toPx()
    drawLine(color, Offset(size.width - w / 2, 0f), Offset(size.width - w / 2, size.height), strokeWidth = w)
}
