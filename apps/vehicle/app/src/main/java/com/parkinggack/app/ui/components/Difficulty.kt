package com.parkinggack.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.hero
import com.parkinggack.app.ui.theme.sized

/** 난이도 막대 크기 프리셋 (시안별 px 그대로) */
@Immutable
data class BarsSize(val barWidth: Dp, val height: Dp, val gap: Dp, val corner: Dp, val stroke: Dp) {
    companion object {
        /** 목록·헤더 (8 × 24) */
        val Small = BarsSize(8.dp, 24.dp, 3.dp, 2.dp, 1.5.dp)
        /** 주행 배너 (9 × 28) */
        val Banner = BarsSize(9.dp, 28.dp, 4.dp, 2.dp, 1.5.dp)
        /** 카드 (10 × 30) */
        val Medium = BarsSize(10.dp, 30.dp, 4.dp, 2.dp, 2.dp)
        /** C-02 큰 카드 (14 × 40) */
        val Large = BarsSize(14.dp, 40.dp, 5.dp, 3.dp, 2.dp)
    }
}

/**
 * 난이도 막대 5칸. 높이가 점점 커지고, [level]칸만 채움. 나머지는 테두리만.
 * [level]이 null이면 데이터 부족 → 5칸 모두 점선.
 */
@Composable
fun DifficultyBars(
    level: Int?,
    modifier: Modifier = Modifier,
    size: BarsSize = BarsSize.Medium,
    fill: Color = ParkingTheme.colors.ink,
    outline: Color = ParkingTheme.colors.lineStrong,
) {
    val width = size.barWidth * 5 + size.gap * 4
    Canvas(modifier.size(width, size.height).clearAndSetSemantics { }) {
        val bw = size.barWidth.toPx()
        val gap = size.gap.toPx()
        val sw = size.stroke.toPx()
        val r = size.corner.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 2.dp.toPx()))
        for (i in 0 until 5) {
            val h = this.size.height * (2 + i) / 6f
            val left = i * (bw + gap)
            val top = this.size.height - h
            val filled = level != null && i < level
            if (filled) {
                drawRoundRect(fill, Offset(left, top), Size(bw, h), CornerRadius(r, r))
            } else {
                drawRoundRect(
                    color = outline,
                    topLeft = Offset(left + sw / 2, top + sw / 2),
                    size = Size(bw - sw, h - sw),
                    cornerRadius = CornerRadius((r - sw / 2).coerceAtLeast(0f)),
                    style = Stroke(width = sw, pathEffect = if (level == null) dash else null),
                )
            }
        }
    }
}

enum class BadgeStyle {
    /** C-02 메인 카드: ★ 40 + 점수 96, 막대 Large, 라벨 26 */
    Hero,
    /** C-02 상태 카드: ★4.3 64, 막대 Medium, 라벨 20 */
    Large,
    /** C-03 후보·C-08 헤더: ★1.8 52, 막대 Small, 라벨 18 */
    Medium,
    /** 목록 한 줄: 막대 Small + "★1.4 아주 쉬움" */
    Inline,
}

const val NO_DATA_STAR = "★–.–"
const val NO_DATA_LABEL = "기록 모으는 중"

/** 난이도 배지: ★점수 + 막대 + 라벨 (색만으로 구분하지 않음). [difficulty] null이면 '기록 모으는 중'. */
@Composable
fun DifficultyBadge(
    difficulty: Difficulty?,
    modifier: Modifier = Modifier,
    style: BadgeStyle = BadgeStyle.Large,
    inlineTextStyle: TextStyle? = null,
    /** Inline: 막대와 글자 사이 (시안 C-01 16, C-03 10) */
    inlineGap: Dp = 12.dp,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val level = difficulty?.level
    val label = difficulty?.label ?: NO_DATA_LABEL
    val star = difficulty?.starText ?: NO_DATA_STAR
    val numberColor = if (difficulty == null) c.inkMuted else c.ink
    val a11y = if (difficulty == null) "난이도 $NO_DATA_LABEL" else "난이도 $star $label"

    when (style) {
        BadgeStyle.Hero -> Row(
            modifier.semantics(mergeDescendants = true) { contentDescription = a11y },
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                val starStyle = t.heading.hero(40.sp, 0.em)
                val scoreStyle = t.display.hero(96.sp, (-0.02).em)
                Text("★", style = starStyle, color = numberColor, modifier = Modifier.cssLineBox(starStyle).alignByBaseline())
                Text(
                    star.removePrefix("★"),
                    style = scoreStyle,
                    color = numberColor,
                    modifier = Modifier.cssLineBox(scoreStyle).alignByBaseline(),
                )
            }
            Column(Modifier.padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DifficultyBars(level, size = BarsSize.Large)
                Text(label, style = t.heading.sized(26.sp, 1.2f))
            }
        }

        BadgeStyle.Large, BadgeStyle.Medium -> {
            val large = style == BadgeStyle.Large
            Row(
                modifier.semantics(mergeDescendants = true) { contentDescription = a11y },
                horizontalArrangement = Arrangement.spacedBy(if (large) 16.dp else 12.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                val starStyle = t.display.hero(if (large) 64.sp else 52.sp, (-0.015).em)
                Text(star, style = starStyle, color = numberColor, modifier = Modifier.cssLineBox(starStyle))
                Column(
                    Modifier.padding(bottom = if (large) 4.dp else 2.dp),
                    verticalArrangement = Arrangement.spacedBy(if (large) 6.dp else 4.dp),
                ) {
                    DifficultyBars(level, size = if (large) BarsSize.Medium else BarsSize.Small)
                    Text(label, style = t.heading.sized(if (large) 20.sp else 18.sp, 1.2f))
                }
            }
        }

        BadgeStyle.Inline -> Row(
            modifier.semantics(mergeDescendants = true) { contentDescription = a11y },
            horizontalArrangement = Arrangement.spacedBy(inlineGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DifficultyBars(level, size = BarsSize.Small)
            Text(
                if (difficulty == null) NO_DATA_LABEL else "$star $label",
                style = inlineTextStyle ?: t.heading.sized(20.sp).copy(fontWeight = FontWeight.Bold),
                color = numberColor,
                maxLines = 1,
            )
        }
    }
}

/** C-02 기준: ★4 이상 어려움 / ★1~2 쉬움 / 그 사이 보통 (표시 라벨과 같은 반올림 등급 사용) */
enum class DifficultyTone { HARD, MEDIUM, EASY, NO_DATA }

fun toneOf(difficulty: Difficulty?, hasEnoughData: Boolean = difficulty != null): DifficultyTone = when {
    difficulty == null || !hasEnoughData -> DifficultyTone.NO_DATA
    difficulty.level >= 4 -> DifficultyTone.HARD
    difficulty.level <= 2 -> DifficultyTone.EASY
    else -> DifficultyTone.MEDIUM
}
