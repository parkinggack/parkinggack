package com.parkinggack.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/*
 * 주행 중 표시 (C-04a/b). 터치 입력 없음 — clickable을 절대 달지 않는다. 한 줄, 2초 안에 읽히게.
 */

/** "도착지 주차 ★4.3 어려움" 배너. [level]이 있으면 난이도 막대를 같이 보여 준다. */
@Composable
fun DrivingBanner(text: String, modifier: Modifier = Modifier, level: Int? = null, showLogo: Boolean = true) {
    val c = ParkingTheme.colors
    Row(
        modifier
            .popIn(fromY = (-36).dp, fromScale = 0.9f) // 위에서 내려앉으며 통
            .height(72.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(c.surfaceRaised)
            .parkingBorder(2.dp, c.ink, 16.dp)
            .padding(start = 16.dp, end = 28.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (showLogo) LogoMark(size = 40.dp)
        if (level != null) DifficultyBars(level, size = BarsSize.Banner)
        Text(text, style = ParkingTheme.type.heading.sized(26.sp, 1.2f), maxLines = 1)
    }
}

/** "● 주차 기록 중 | 후진 1 · 1:12" */
@Composable
fun RecordingBadge(reverseCount: Int, elapsedSec: Int, modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    Row(
        modifier
            .popIn(fromY = (-36).dp, fromScale = 0.9f)
            .height(72.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(c.surfaceRaised)
            .parkingBorder(2.dp, c.ink, 16.dp)
            .padding(start = 24.dp, end = 28.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // 채운 점(18) + 트랙 고리(바깥 5) — 시안처럼 고리는 자리를 차지하지 않는다. 깜빡임 없음 (주행 중 시선 끌지 않게)
        Canvas(Modifier.size(18.dp)) {
            drawCircle(c.track, radius = 14.dp.toPx())
            drawCircle(c.ink, radius = 9.dp.toPx())
        }
        Text("주차 기록 중", style = ParkingTheme.type.heading.sized(26.sp, 1.2f), maxLines = 1)
        Box(Modifier.width(2.dp).height(32.dp).background(c.lineStrong))
        Text(
            "후진 $reverseCount · ${formatClock(elapsedSec)}",
            style = ParkingTheme.type.body.sized(24.sp, 1.2f, FontWeight.Medium),
            color = c.inkMuted,
            maxLines = 1,
            modifier = Modifier.bumpOn(reverseCount, from = 0.8f), // 후진이 늘어난 순간 톡
        )
    }
}

/** 72 → "1:12" */
fun formatClock(sec: Int): String {
    val s = sec.coerceAtLeast(0)
    return "${s / 60}:${"%02d".format(s % 60)}"
}
