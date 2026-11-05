package com.parkinggack.app.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.AlignmentLine
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.layout.LastBaseline
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.parkinggack.app.ui.theme.NOTO_SANS_KR_LINE_RATIO
import kotlin.math.roundToInt

/** 점선 테두리 — '데이터 부족', '추정', '자리 표시'처럼 아직 확정되지 않은 것에 쓴다. */
fun Modifier.dashedBorder(
    width: Dp,
    color: Color,
    cornerRadius: Dp,
    dash: Dp = 6.dp,
    gap: Dp = 5.dp,
): Modifier = drawBehind {
    val w = width.toPx()
    val r = (cornerRadius.toPx() - w / 2).coerceAtLeast(0f)
    drawRoundRect(
        color = color,
        topLeft = Offset(w / 2, w / 2),
        size = Size(size.width - w, size.height - w),
        cornerRadius = CornerRadius(r, r),
        style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash.toPx(), gap.toPx()))),
    )
}

/** 실선 또는 점선 테두리를 한 번에 고르기 */
fun Modifier.parkingBorder(width: Dp, color: Color, cornerRadius: Dp, dashed: Boolean = false): Modifier =
    if (dashed) dashedBorder(width, color, cornerRadius) else border(width, color, RoundedCornerShape(cornerRadius))

/** 아래쪽 1px 구분선 */
fun Modifier.bottomDivider(color: Color, width: Dp = 1.dp): Modifier = drawBehind {
    val w = width.toPx()
    drawLine(color, Offset(0f, size.height - w / 2), Offset(size.width, size.height - w / 2), strokeWidth = w)
}

/** 위쪽 구분선 */
fun Modifier.topDivider(color: Color, width: Dp = 1.dp): Modifier = drawBehind {
    val w = width.toPx()
    drawLine(color, Offset(0f, w / 2), Offset(size.width, w / 2), strokeWidth = w)
}

/**
 * 글자 상자를 CSS `line-height`처럼 잡는다: 줄마다 정확히 [style]의 lineHeight, 남거나 모자란 높이는 글자 위아래에 반씩.
 *
 * Compose(기본 Trim.Both)는 첫 줄 위·끝 줄 아래를 글꼴 높이(Noto Sans KR ≈ 1.448배)로 두어
 * 전체 높이가 `글꼴 높이 + (줄 수 - 1) × lineHeight`가 된다. 한 줄짜리는 lineHeight를 아예 무시한다.
 * 그래서 시안의 `line-height: 1` 큰 숫자(★4.3, B2 · D-07, 층 B2)는 위아래로 크게 벌어지고,
 * `line-height: 1.25` 제목은 몇 px씩 내려간다. 이 수정자는 글자를 그대로 그리되 자리와 기준선만 CSS와 같게 옮긴다.
 * 줄 수와 상관없이 맞는다 (차이 = lineHeight - 글꼴 높이 → 위로 절반 옮기고 높이에 더함).
 */
fun Modifier.cssLineBox(style: TextStyle): Modifier {
    val lh = style.lineHeight
    val fs = style.fontSize
    if (!lh.isSp || !fs.isSp) return this
    return layout { measurable, constraints ->
        val p = measurable.measure(constraints.copy(minHeight = 0, maxHeight = Constraints.Infinity))
        val delta = lh.toPx() - fs.toPx() * NOTO_SANS_KR_LINE_RATIO
        val height = (p.height + delta).roundToInt().coerceAtLeast(1)
        val dy = (delta / 2).roundToInt()
        val lines = buildMap<AlignmentLine, Int> {
            p[FirstBaseline].takeIf { it != AlignmentLine.Unspecified }?.let { put(FirstBaseline, it + dy) }
            p[LastBaseline].takeIf { it != AlignmentLine.Unspecified }?.let { put(LastBaseline, it + dy) }
        }
        layout(p.width, height.coerceIn(constraints.minHeight, constraints.maxHeight), lines) { p.place(0, dy) }
    }
}
