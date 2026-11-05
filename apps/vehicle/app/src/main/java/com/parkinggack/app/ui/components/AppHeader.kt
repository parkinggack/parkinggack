package com.parkinggack.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.ui.theme.ParkingDimens
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/**
 * 앱 머리 (88dp, surface-raised, 아래 구분선).
 * 뒤로 버튼이 없으면 로고 마크를 보여 준다 (홈). [trailing]은 제목 오른쪽 (칩, 저장될 위치 등).
 * 시안 맨 위 44px 'Pleos Connect 시스템 영역'은 OS가 그리므로 여기서 그리지 않는다.
 */
@Composable
fun AppHeader(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    onSettings: (() -> Unit)? = null,
    subtitle: String? = null,
    showLogo: Boolean = onBack == null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Row(
        modifier
            .fillMaxWidth()
            .height(if (subtitle != null) 112.dp else ParkingDimens.headerHeight)
            .background(c.surfaceRaised)
            .bottomDivider(c.line)
            .padding(horizontal = 32.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        if (onBack != null) IconSquareButton(Glyph.Back, "뒤로", onBack)
        // 제목이 비어 있으면(홈) 로고만 — 앱 이름은 로고의 접근성 설명으로
        if (showLogo) LogoMark(size = 48.dp, contentDescription = if (title.isEmpty()) "주차각" else null)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (title.isNotEmpty()) Text(
                title,
                style = t.title.sized(if (subtitle != null) 28.sp else 30.sp, 1.25f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle != null) Text(subtitle, style = t.label.sized(16.sp, 1.3f).copy(fontWeight = t.caption.fontWeight), color = c.inkMuted)
        }
        trailing()
        if (onSettings != null) IconSquareButton(Glyph.Settings, "설정", onSettings)
    }
}
