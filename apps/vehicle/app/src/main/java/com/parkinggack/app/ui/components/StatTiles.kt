package com.parkinggack.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/** 작은 숫자 칸 하나: 라벨(작게, 흐리게) + 값(굵게) */
data class Stat(val label: String, val value: String)

/**
 * 숫자 칸 줄 (홈 '내 주차', C-09). 카드 안 바탕(surface)에 얹는 칸 — 테두리·그림자 없이 면만.
 * 상태를 색으로 구분하지 않는다: 값은 모두 같은 ink.
 */
@Composable
fun StatRow(stats: List<Stat>, modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        stats.forEach { s ->
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = 92.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.surface)
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // 시스템 글꼴을 키우면(1.3) 좁은 칸(C-09)에서 "이달 평…"으로 잘렸다 → 두 줄까지 (1.0에선 한 줄 그대로)
                Text(s.label, style = t.caption.sized(15.sp, 1.3f), color = c.inkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(s.value, style = t.heading.sized(26.sp, 1.25f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
