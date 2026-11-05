package com.parkinggack.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.parkinggack.app.model.ReasonTag
import com.parkinggack.app.ui.theme.ParkingTheme

/*
 * 주차각 아이콘 세트 (Components.dc.html): 24px 격자 · 2px 선 · 둥근 끝 · currentColor.
 * SVG path 데이터를 그대로 옮겨 ImageVector로 만든다 (외부 아이콘 라이브러리 없음).
 */

private fun f(v: Float): String = if (v == v.toInt().toFloat()) v.toInt().toString() else v.toString()

/** SVG <rect x y width height rx> → path */
private fun rect(x: Float, y: Float, w: Float, h: Float, r: Float): String =
    "M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}" +
        "V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}" +
        "H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}" +
        "V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z"

/** SVG <circle cx cy r> → path */
private fun circle(cx: Float, cy: Float, r: Float): String =
    "M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z"

enum class Glyph(private val strokeWidth: Float, private vararg val paths: String) {
    // 이유 태그 9종
    SpiralRamp(2f, "M12 4a8 8 0 1 0 8 8", "M12 8a4 4 0 1 0 4 4", "M20 12l-2.4-2.6M20 12l2.4-2.6"),
    NarrowAisle(2f, "M6 3v18M18 3v18", "M9.5 12h5M11 10l-1.5 2 1.5 2M13 10l1.5 2-1.5 2"),
    ManyPillars(2f, "M4 4h16M4 20h16M8 4v16M16 4v16"),
    Mechanical(2f, rect(4f, 3f, 16f, 18f, 2f), "M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"),
    SteepSlope(2f, "M3 19h18L3 8z"),
    FrequentReverse(2f, "M4.5 10a8 8 0 0 1 13.7-3.6L20 8", "M20 4v4h-4", "M19.5 14a8 8 0 0 1-13.7 3.6L4 16", "M4 20v-4h4"),
    Spacious(2f, rect(3f, 5f, 18f, 14f, 2f), "M9 5v14M15 5v14"),
    Flat(2f, rect(4f, 4f, 16f, 16f, 3f), "M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"),
    ManyFloors(2f, "M12 3l9 4.5-9 4.5-9-4.5z", "M3 12l9 4.5 9-4.5", "M3 16.5l9 4.5 9-4.5"),

    // 공용
    Pin(2f, "M12 21s-6-5.4-6-10.5a6 6 0 0 1 12 0C18 15.6 12 21 12 21z", circle(12f, 10.5f, 2.2f)),
    Zone(2f, rect(4f, 4f, 7f, 7f, 1.5f), rect(13f, 4f, 7f, 7f, 1.5f), rect(4f, 13f, 7f, 7f, 1.5f), rect(13f, 13f, 7f, 7f, 1.5f)),
    Phone(2f, rect(7f, 3f, 10f, 18f, 2.5f), "M11 18h2"),
    Reverse(2f, "M9 6L5 10l4 4", "M5 10h10a4.5 4.5 0 0 1 0 9h-2"),
    Back(2.2f, "M15 5l-7 7 7 7"),
    Close(2.2f, "M6 6l12 12M18 6L6 18"),
    Settings(2f, "M4 7h10M18 7h2M4 17h2M10 17h10", circle(16f, 7f, 2f), circle(8f, 17f, 2f)),
    Chevron(2.2f, "M9 5l7 7-7 7"),
    // 왼쪽 아이콘 메뉴 (C-01·C-09·C-13 시안)
    Home(2f, "M4 11l8-7 8 7", "M6 9.5V20h12V9.5"),
    List(2f, "M9 6h11M9 12h11M9 18h11", circle(4.5f, 6f, 1.2f), circle(4.5f, 12f, 1.2f), circle(4.5f, 18f, 1.2f)),
    Crown(2f, "M4 18h16", "M5 15.5L3.5 7l5 4L12 5l3.5 6 5-4-1.5 8.5z"),
    ArrowUp(2.4f, "M12 19V6", "M6.5 11.5L12 6l5.5 5.5"),
    Shield(1.6f, "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z", "M9 12l2 2 4-4"),
    SteeringWheel(1.6f, circle(12f, 12f, 9f), circle(12f, 12f, 2.5f), "M12 14.5V21M9.6 11.3L3.4 9.6M14.4 11.3l6.2-1.7"),

    /** 왼쪽 메뉴 '내 기록' (SideNav). 모양은 [List]와 같음 */
    Records(2f, "M9 6h11M9 12h11M9 18h11", circle(4.5f, 6f, 1.2f), circle(4.5f, 12f, 1.2f), circle(4.5f, 18f, 1.2f)),
    ;

    val imageVector: ImageVector by lazy {
        val b = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        paths.forEach { d ->
            b.addPath(
                pathData = addPathNodes(d),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = strokeWidth,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        b.build()
    }
}

val ReasonTag.glyph: Glyph
    get() = when (this) {
        ReasonTag.SPIRAL_RAMP -> Glyph.SpiralRamp
        ReasonTag.NARROW_AISLE -> Glyph.NarrowAisle
        ReasonTag.MANY_PILLARS -> Glyph.ManyPillars
        ReasonTag.MECHANICAL -> Glyph.Mechanical
        ReasonTag.STEEP_SLOPE -> Glyph.SteepSlope
        ReasonTag.FREQUENT_REVERSE -> Glyph.FrequentReverse
        ReasonTag.SPACIOUS -> Glyph.Spacious
        ReasonTag.FLAT -> Glyph.Flat
        ReasonTag.MANY_FLOORS -> Glyph.ManyFloors
    }

/** 선 아이콘. 색은 기본 LocalContentColor(currentColor). */
@Composable
fun GlyphIcon(
    glyph: Glyph,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    tint: Color = LocalContentColor.current,
    contentDescription: String? = null,
) {
    Icon(imageVector = glyph.imageVector, contentDescription = contentDescription, modifier = modifier.size(size), tint = tint)
}

/** 주차각 로고 마크 (디자인 v2: inverse 둥근 사각형 + P + 주차 칸 모서리) */
@Composable
fun LogoMark(modifier: Modifier = Modifier, size: Dp = 48.dp, contentDescription: String? = null) {
    val c = ParkingTheme.colors
    // 시안(캔버스 C-01) 로고: 둥근 사각형 + P + 주차 칸 모서리(각)
    val vector = remember(c.inverse, c.onInverse) {
        ImageVector.Builder(name = "logo", defaultWidth = 48.dp, defaultHeight = 48.dp, viewportWidth = 48f, viewportHeight = 48f)
            .addPath(pathData = addPathNodes(rect(0f, 0f, 48f, 48f, 13f)), fill = SolidColor(c.inverse))
            .addPath(
                pathData = addPathNodes("M15 36V12h9a7 7 0 0 1 0 14h-9"),
                stroke = SolidColor(c.onInverse), strokeLineWidth = 5f,
                strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
            )
            .addPath(
                pathData = addPathNodes("M27 38h8a3 3 0 0 0 3-3v-8"),
                stroke = SolidColor(c.onInverse), strokeLineWidth = 3.5f,
                strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
            )
            .build()
    }
    Image(imageVector = vector, contentDescription = contentDescription, modifier = modifier.size(size))
}
