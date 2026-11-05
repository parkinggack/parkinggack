package com.parkinggack.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.SwitchPoint
import com.parkinggack.app.ui.theme.NotoSansKr
import com.parkinggack.app.ui.theme.ParkingColors
import com.parkinggack.app.ui.theme.ParkingTheme
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/*
 * 위에서 본 주차 동선 그림 (C-12, C-12 상태별, C-05 썸네일).
 *
 * 실제 도면이 아니라 '그림'이다: 최종 위치 기준으로 칸 1개(2.5m × 5.0m) + 통로 띠 + 주차 형태대로 이어 그린 옆 칸.
 * 옆 차는 절대 그리지 않는다. 전진 = 실선, 후진 = 점선, 전환점 = 번호 원 (색만으로 구분하지 않음).
 *
 * 좌표: Pose는 m 단위, x 오른쪽, y 앞, headingRad는 +y 기준 반시계(+).
 * 보기 좋게 통로가 화면 가로(왼쪽 → 오른쪽 진입)가 되도록 장면 전체를 회전한 뒤, 화면 y를 뒤집어 그린다.
 */

private const val STALL_W = 2.5
private const val STALL_L = 5.0
private const val PARALLEL_L = 6.0
private const val CAR_W = 1.85
private const val CAR_L = 4.7
/** 평행주차 연석 너머 보도 띠 폭 */
private const val SIDEWALK_W = 2.5
/** 이보다 긴 궤적은 앞부분(램프 등)을 잘라 낸다 */
private const val TRIM_ABOVE_M = 50.0
/** 첫 전환점 앞으로 남길 길이 */
private const val TRIM_LEAD_M = 20.0

/**
 * @param progress 0..1 그리기 진행. 시각(tMs)이 있으면 시간 비율, 없으면 길이 비율. 1이면 전체.
 * @param approximate 오차가 큰 궤적 → 전환점만 직선으로 잇고, 흐린 색·점선 칸으로 '대략'임을 보여 준다.
 * @param showLabels true면 '통로'·'주차 칸 (그림)'·'진입'·'내 차' 라벨과 진입 화살표까지. false(썸네일)면 '통로'만.
 */
@Composable
fun TrajectoryView(
    poses: List<Pose>,
    switchPoints: List<SwitchPoint>,
    shape: ParkingShape,
    progress: Float,
    approximate: Boolean,
    modifier: Modifier = Modifier,
    showLabels: Boolean = true,
) {
    val colors = ParkingTheme.colors
    val measurer = rememberTextMeasurer()
    val scene = remember(poses, switchPoints, shape, approximate, showLabels) {
        buildScene(poses, switchPoints, shape, approximate, oppositeRow = showLabels)
    }
    Canvas(
        modifier
            .clipToBounds()
            .semantics { contentDescription = "위에서 본 주차 동선 그림. 실제 도면이나 옆 차 위치가 아니에요" },
    ) {
        drawRect(colors.surfaceRaised)
        if (scene != null) drawScene(scene, progress.coerceIn(0f, 1f), colors, measurer, showLabels)
    }
}

// ---------------------------------------------------------------------------------------------
// 장면 계산 (순수 수학, m 단위, 회전된 좌표계: 통로 = +x, 위 = +y)
// ---------------------------------------------------------------------------------------------

private data class V(val x: Double, val y: Double) {
    operator fun plus(o: V) = V(x + o.x, y + o.y)
    operator fun minus(o: V) = V(x - o.x, y - o.y)
    operator fun times(k: Double) = V(x * k, y * k)
    fun dot(o: V) = x * o.x + y * o.y
    val len get() = hypot(x, y)
    fun unit(): V = len.let { if (it < 1e-9) V(0.0, 1.0) else V(x / it, y / it) }
}

/** heading(+y 기준 반시계) → 앞 방향 단위 벡터 */
private fun forwardOf(heading: Double) = V(-sin(heading), cos(heading))

/** @param reverse 이 점으로 '들어오는' 구간이 후진인지 */
private class PathPt(val p: V, val heading: Double, val reverse: Boolean, val t: Long)

private class SwitchMark(val index: Int, val p: V, val at: Double)

private class Scene(
    val pts: List<PathPt>,
    /** 점별 누적 '진행 축' 값 (시간 또는 길이), 0..1로 정규화 */
    val prog: DoubleArray,
    val switches: List<SwitchMark>,
    val shape: ParkingShape,
    /** +1: 칸 줄이 통로 위쪽(+y) */
    val side: Int,
    /** 통로 쪽 칸 끝선의 y */
    val yEdge: Double,
    val aisleWidth: Double,
    /** 칸 줄 깊이 (y 방향) */
    val rowDepth: Double,
    /** 칸 경계선 방향 (통로 → 안쪽 단위 벡터). 평행주차면 사용 안 함 */
    val stallDir: V,
    /** 통로 끝선에서 칸 경계선 x 간격 */
    val pitch: Double,
    /** 통로 끝선 위의 경계선 하나의 x */
    val x0: Double,
    val bounds: Rect,
    val approximate: Boolean,
    val entry: V,
    val entryDir: V,
    val final: PathPt,
    /** 통로 건너편 칸 줄까지 그릴지 (큰 그림 C-12만. 썸네일·형태별 카드는 시안처럼 내 칸 줄 + 통로만) */
    val oppositeRow: Boolean = false,
)

private fun angleDiff(a: Double, b: Double): Double {
    var d = b - a
    while (d > PI) d -= 2 * PI
    while (d < -PI) d += 2 * PI
    return d
}

private fun buildScene(
    poses: List<Pose>,
    switchPoints: List<SwitchPoint>,
    shapeIn: ParkingShape,
    approximate: Boolean,
    oppositeRow: Boolean = false,
): Scene? {
    if (poses.isEmpty()) return null
    val sorted = switchPoints.sortedBy { it.tMs }

    // 1) 그릴 점 (단순화 포함). reverse = 이 점으로 들어오는 구간의 진행 방향
    val full: List<PathPt> = if (approximate && poses.size > 2) {
        val out = mutableListOf(PathPt(V(poses.first().x, poses.first().y), poses.first().headingRad, poses.first().reverse, poses.first().tMs))
        var motion = poses.first().reverse
        sorted.forEach { sp ->
            out += PathPt(V(sp.pose.x, sp.pose.y), sp.pose.headingRad, motion, sp.tMs)
            motion = sp.toReverse
        }
        val last = poses.last()
        out += PathPt(V(last.x, last.y), last.headingRad, motion, last.tMs)
        out
    } else {
        poses.map { PathPt(V(it.x, it.y), it.headingRad, it.reverse, it.tMs) }
    }
    val tFirst = full.first().t
    val tLast = full.last().t

    // 램프를 여러 바퀴 돈 긴 궤적이면 칸 크기 그림이 너무 작아지므로, 첫 전환점(없으면 끝) 앞 20m부터만 그린다.
    // 진행값은 원래 시간 범위 기준이라 리플레이 타임라인과 맞는다.
    val raw: List<PathPt> = run {
        var total = 0.0
        for (i in 1 until full.size) total += (full[i].p - full[i - 1].p).len
        if (total <= TRIM_ABOVE_M) return@run full
        val anchorT = sorted.firstOrNull()?.tMs ?: tLast
        val anchor = full.indexOfFirst { it.t >= anchorT }.let { if (it < 0) full.lastIndex else it }
        var start = anchor
        var back = 0.0
        while (start > 0 && back < TRIM_LEAD_M) { back += (full[start].p - full[start - 1].p).len; start-- }
        if (start > 0) full.subList(start, full.size) else full
    }

    val first = raw.first()
    val fin = raw.last()

    // 2) 진입 방향: 첫 구간(같은 진행 방향)에서 6m 정도 간 방향
    var approachEnd = 0
    run {
        var dist = 0.0
        for (i in 1 until raw.size) {
            if (raw[i].reverse != raw[1.coerceAtMost(raw.size - 1)].reverse) break
            dist += (raw[i].p - raw[i - 1].p).len
            approachEnd = i
            if (dist >= 6.0) break
        }
    }
    val approachVec = raw[approachEnd].p - first.p
    val a: V = if (approachVec.len > 0.5) approachVec.unit() else {
        val f = forwardOf(first.heading)
        if (first.reverse) f * -1.0 else f
    }

    // 3) 주차 형태 (UNKNOWN이면 통로와 차 방향 각도로 판별)
    val hf = forwardOf(fin.heading)
    val angle = acos(abs(a.dot(hf)).coerceIn(0.0, 1.0)) * 180 / PI // 0 = 나란히, 90 = 직각
    val shape = when (shapeIn) {
        ParkingShape.UNKNOWN -> when {
            angle < 25 -> ParkingShape.PARALLEL
            angle > 70 -> ParkingShape.PERPENDICULAR
            else -> ParkingShape.ANGLED
        }
        else -> shapeIn
    }

    // 4) 통로 방향 d (진입 방향 쪽으로 부호를 맞춤)
    var d = when (shape) {
        ParkingShape.PERPENDICULAR -> V(hf.y, -hf.x)
        ParkingShape.PARALLEL -> hf
        else -> a
    }
    if (d.dot(a) < 0) d = d * -1.0

    // 5) 회전: d → +x
    val rho = -atan2(d.y, d.x)
    val cr = cos(rho)
    val sr = sin(rho)
    fun rot(v: V) = V(v.x * cr - v.y * sr, v.x * sr + v.y * cr)
    val pts = raw.map { PathPt(rot(it.p), it.heading + rho, it.reverse, it.t) }
    val car = pts.last()

    // 진입 구간 평균 y → 칸 줄이 통로 어느 쪽인지
    val approachPts = pts.subList(0, approachEnd + 1)
    val yA = approachPts.sumOf { it.p.y } / approachPts.size
    val side = if (car.p.y >= yA) 1 else -1

    // 6) 칸 기하
    val hRot = forwardOf(car.heading)
    var u = if (hRot.y * side > 0) hRot else hRot * -1.0 // 통로 → 칸 안쪽
    val yEdge: Double
    val rowDepth: Double
    val pitch: Double
    val x0: Double
    var aisleW: Double
    when (shape) {
        ParkingShape.PARALLEL -> {
            u = V(1.0, 0.0)
            yEdge = car.p.y - side * STALL_W / 2
            rowDepth = STALL_W
            pitch = PARALLEL_L
            x0 = car.p.x - PARALLEL_L / 2
            aisleW = 3.5
        }
        else -> {
            if (shape == ParkingShape.PERPENDICULAR) {
                u = V(0.0, side.toDouble())
                aisleW = 6.0
            } else {
                var beta = atan2(u.y * side, u.x) // (0, π)
                beta = beta.coerceIn(30 * PI / 180, 150 * PI / 180)
                u = V(cos(beta), side * sin(beta))
                aisleW = 4.5
            }
            val sinB = abs(u.y)
            yEdge = car.p.y - side * (STALL_L / 2) * sinB
            rowDepth = STALL_L * sinB
            pitch = STALL_W / sinB
            val xCenterAtEdge = car.p.x - (STALL_L / 2) * u.x
            x0 = xCenterAtEdge - pitch / 2
        }
    }
    // 진입 경로가 통로 안에 들어오도록 통로 폭 보정
    aisleW = max(aisleW, abs(yEdge - yA) + 1.5)

    // 7) 진행 축 (시간이 단조 증가하면 시간, 아니면 길이)
    val n = pts.size
    val prog = DoubleArray(n)
    val tSpan = (tLast - tFirst).toDouble()
    val timeOk = tSpan > 0 && (1 until n).all { pts[it].t >= pts[it - 1].t }
    if (timeOk) {
        for (i in 0 until n) prog[i] = ((pts[i].t - tFirst) / tSpan).coerceIn(0.0, 1.0)
    } else {
        var acc = 0.0
        for (i in 1 until n) { acc += (pts[i].p - pts[i - 1].p).len; prog[i] = acc }
        if (acc > 0) for (i in 0 until n) prog[i] /= acc
    }

    val switches = sorted.map { sp ->
        val p = rot(V(sp.pose.x, sp.pose.y))
        val at = if (timeOk) ((sp.tMs - tFirst) / tSpan).coerceIn(0.0, 1.0) else {
            // 길이 기준: 가장 가까운 점의 진행값
            var best = 0
            var bd = Double.MAX_VALUE
            for (i in 0 until n) { val dd = (pts[i].p - p).len; if (dd < bd) { bd = dd; best = i } }
            prog[best]
        }
        SwitchMark(sp.index, p, at)
    }

    // 8) 맞출 범위: 동선 + 내 칸 + 통로 띠 + 칸 줄 깊이
    var minX = pts.minOf { it.p.x }
    var maxX = pts.maxOf { it.p.x }
    var minY = pts.minOf { it.p.y }
    var maxY = pts.maxOf { it.p.y }
    val aisleFar = yEdge - side * aisleW
    val rowFar = yEdge + side * rowDepth
    minY = minOf(minY, aisleFar, rowFar, yEdge)
    maxY = maxOf(maxY, aisleFar, rowFar, yEdge)
    // 큰 그림(C-12): 시안처럼 통로 건너편 칸 줄도 거의 다 보이게 넣는다 → 칸·차 크기가 시안 축척(≈32px/m)과 비슷해진다
    if (oppositeRow && shape == ParkingShape.PERPENDICULAR && !approximate) {
        val oppFar = aisleFar - side * STALL_L * 0.95
        minY = minOf(minY, oppFar)
        maxY = maxOf(maxY, oppFar)
    }
    val halfDiag = hypot(CAR_W, CAR_L) / 2
    minX = min(minX, car.p.x - halfDiag)
    maxX = max(maxX, car.p.x + halfDiag)
    val pad = 1.2
    minX -= pad; maxX += pad; minY -= pad * 0.6; maxY += pad * 0.6
    // 너무 작은 동선이 과하게 커지지 않게 최소 범위
    val minW = 14.0
    val minH = 9.0
    if (maxX - minX < minW) { val cx = (minX + maxX) / 2; minX = cx - minW / 2; maxX = cx + minW / 2 }
    if (maxY - minY < minH) { val cy = (minY + maxY) / 2; minY = cy - minH / 2; maxY = cy + minH / 2 }

    return Scene(
        pts = pts, prog = prog, switches = switches, shape = shape, side = side,
        yEdge = yEdge, aisleWidth = aisleW, rowDepth = rowDepth, stallDir = u, pitch = pitch, x0 = x0,
        bounds = Rect(minX.toFloat(), minY.toFloat(), maxX.toFloat(), maxY.toFloat()),
        approximate = approximate, entry = pts.first().p, entryDir = rot(a), final = car,
        oppositeRow = oppositeRow,
    )
}

// ---------------------------------------------------------------------------------------------
// 그리기
// ---------------------------------------------------------------------------------------------

private class Mapper(val bounds: Rect, w: Float, h: Float) {
    val k: Float = min(w / bounds.width, h / bounds.height)
    private val ox = (w - bounds.width * k) / 2
    private val oy = (h - bounds.height * k) / 2
    fun x(x: Double) = ox + (x.toFloat() - bounds.left) * k
    fun y(y: Double) = oy + (bounds.bottom - y.toFloat()) * k
    fun o(v: V) = Offset(x(v.x), y(v.y))
    /** 화면에 보이는 세계 범위 */
    val worldLeft = bounds.left - ox / k
    val worldRight = bounds.left + (w - ox) / k
    val worldBottom = bounds.bottom - (h - oy) / k
    val worldTop = bounds.bottom + oy / k
}

private fun DrawScope.drawScene(s: Scene, progress: Float, c: ParkingColors, tm: TextMeasurer, showLabels: Boolean) {
    val m = Mapper(s.bounds, size.width, size.height)
    val small = min(size.width, size.height) < 260.dp.toPx()
    val lw = (if (small) 5 else 6).dp.toPx()
    val stallLine = 2.dp.toPx()
    val pathColor = if (s.approximate) c.lineStrong else c.ink
    val labelSize = if (small) 14.sp else 15.sp
    val labelStyle = TextStyle(fontFamily = NotoSansKr, fontSize = labelSize, color = c.inkMuted)

    // 통로 띠
    val aisleTop = max(s.yEdge, s.yEdge - s.side * s.aisleWidth)
    val aisleBottom = min(s.yEdge, s.yEdge - s.side * s.aisleWidth)
    drawRect(c.surface, Offset(0f, m.y(aisleTop)), Size(size.width, m.y(aisleBottom) - m.y(aisleTop)))
    val aisleMid = (aisleTop + aisleBottom) / 2
    drawLine(
        c.track, Offset(0f, m.y(aisleMid)), Offset(size.width, m.y(aisleMid)), strokeWidth = 2.dp.toPx(),
        pathEffect = PathEffect.dashPathEffect(floatArrayOf((if (small) 10 else 14).dp.toPx(), (if (small) 10 else 14).dp.toPx())),
    )

    // 칸
    drawStalls(s, m, c, stallLine)

    // 라벨 — 바탕색 판을 깔아 칸 경계선·점선이 글자를 지나가지 않게
    val trail = s.pts.map { m.o(it.p) }
    val aisleLabel = tm.measure("통로", labelStyle)
    run {
        val up = Offset(10.dp.toPx(), m.y(aisleMid) - aisleLabel.size.height - 4.dp.toPx())
        val down = Offset(10.dp.toPx(), m.y(aisleMid) + 4.dp.toPx())
        // 동선이 '통로' 글자 자리를 지나가면 점선 반대쪽으로
        val at = if (trail.passesThrough(rectOf(up, aisleLabel), lw) && !trail.passesThrough(rectOf(down, aisleLabel), lw)) down else up
        drawLabel(aisleLabel, at, c.surface)
    }
    if (s.shape == ParkingShape.PARALLEL) {
        val walkMid = s.yEdge + s.side * (s.rowDepth + SIDEWALK_W / 2)
        val walkLabel = tm.measure("보도", labelStyle)
        drawText(walkLabel, topLeft = Offset(10.dp.toPx(), m.y(walkMid) - walkLabel.size.height / 2f))
    }
    if (showLabels) {
        val rowNear = s.yEdge + s.side * s.rowDepth * 0.12
        val stallLabel = tm.measure("주차 칸 (그림)", labelStyle)
        val ly = if (s.side > 0) m.y(s.yEdge + s.side * s.rowDepth) + 8.dp.toPx() else m.y(s.yEdge + s.side * s.rowDepth) - stallLabel.size.height - 8.dp.toPx()
        if (ly > 0 && ly + stallLabel.size.height < size.height) {
            drawLabel(stallLabel, Offset(10.dp.toPx(), ly), c.surfaceRaised)
        } else {
            // 칸 줄 끝선이 화면 밖이면 통로 쪽 끝 가까이, 칸 줄 안쪽에
            val near = m.y(rowNear)
            drawLabel(stallLabel, Offset(10.dp.toPx(), if (s.side > 0) near - stallLabel.size.height else near), c.surfaceRaised)
        }
        val entryLabel = tm.measure("진입", labelStyle)
        val ep = m.o(s.entry)
        val ey = ep.y + (if (s.side > 0) 14.dp.toPx() else -entryLabel.size.height - 14.dp.toPx())
        drawLabel(
            entryLabel,
            Offset((ep.x + 6.dp.toPx()).coerceIn(4f, size.width - entryLabel.size.width - 4f), ey.coerceIn(0f, size.height - entryLabel.size.height.toFloat())),
            c.surface,
        )
    }

    // 동선 (진행된 만큼)
    val head = drawTrail(s, m, progress.toDouble(), pathColor, lw, small)

    // 진입 화살표
    if (showLabels && s.pts.size > 1) {
        val dir = s.entryDir
        val tip = m.o(s.entry + dir * 2.4)
        val sx = dir.x.toFloat()
        val sy = -dir.y.toFloat()
        val px = -sy
        val py = sx
        val a = 18.dp.toPx()
        val b = 12.dp.toPx()
        val p = Path().apply {
            moveTo(tip.x - sx * a + px * b, tip.y - sy * a + py * b)
            lineTo(tip.x, tip.y)
            lineTo(tip.x - sx * a - px * b, tip.y - sy * a - py * b)
        }
        drawPath(p, pathColor, style = Stroke(4.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
    }

    // 차 (진행 중이면 현재 위치, 끝나면 최종 위치)
    drawCar(head.first, head.second, m, c, s.approximate)
    if (showLabels && progress >= 1f) {
        val carLabel = tm.measure("내 차", TextStyle(fontFamily = NotoSansKr, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = pathColor))
        val cp = m.o(s.final.p)
        // 돌아간 차가 화면에서 차지하는 반폭 (사선·평행이면 옆으로 길어진다) → 그 바깥에, 차 가운데 높이로
        val th = s.final.heading
        val halfW = ((abs(cos(th)) * CAR_W / 2 + abs(sin(th)) * CAR_L / 2) * m.k).toFloat()
        val gap = 16.dp.toPx()
        val toRight = cp.x + halfW + gap
        val lx = if (toRight + carLabel.size.width < size.width - 4.dp.toPx()) toRight else cp.x - halfW - gap - carLabel.size.width
        val ly = cp.y - carLabel.size.height / 2f
        drawLabel(carLabel, Offset(lx.coerceAtLeast(4.dp.toPx()), ly.coerceIn(0f, size.height - carLabel.size.height)), c.surfaceRaised)
    }

    // 전환점 번호 (도달한 것만)
    val r = (if (small) 13 else 18).dp.toPx()
    val numStyle = TextStyle(fontFamily = NotoSansKr, fontSize = if (small) 14.sp else 18.sp, fontWeight = FontWeight.Bold, color = if (s.approximate) c.inkMuted else c.ink)
    s.switches.forEach { sw ->
        if (sw.at <= progress + 1e-6) {
            val o = m.o(sw.p)
            drawCircle(c.surfaceRaised, r, o)
            drawCircle(pathColor, r, o, style = Stroke((if (small) 2.5f else 3f) * density))
            val t = tm.measure("${sw.index}", numStyle)
            drawText(t, topLeft = Offset(o.x - t.size.width / 2f, o.y - t.size.height / 2f))
        }
    }
}

private fun DrawScope.drawStalls(s: Scene, m: Mapper, c: ParkingColors, w: Float) {
    val dash = if (s.approximate) PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx())) else null
    val sep = c.hatchA
    val back = if (s.approximate) c.hatchA else c.lineStrong
    val farY = s.yEdge + s.side * s.rowDepth
    val left = m.worldLeft.toDouble()
    val right = m.worldRight.toDouble()

    if (s.shape == ParkingShape.PARALLEL) {
        // 길쭉한 칸을 가로로 이어 그림: 경계선(세로 짧은 선) + 통로 쪽 점선 + 연석 쪽 굵은 선
        val kFrom = if (s.approximate) 0 else floor((left - s.x0) / s.pitch).toInt() - 1
        val kTo = if (s.approximate) 1 else ceil((right - s.x0) / s.pitch).toInt() + 1
        for (k in kFrom..kTo) {
            val x = s.x0 + k * s.pitch
            drawLine(sep, Offset(m.x(x), m.y(s.yEdge)), Offset(m.x(x), m.y(farY)), w, pathEffect = dash)
        }
        val edgeFrom = if (s.approximate) m.x(s.x0) else 0f
        val edgeTo = if (s.approximate) m.x(s.x0 + s.pitch) else size.width
        drawLine(sep, Offset(edgeFrom, m.y(s.yEdge)), Offset(edgeTo, m.y(s.yEdge)), w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx())))
        // 연석 너머 보도 띠 + 연석 선 (시안 C-12-states: 보도 띠는 칸보다 조금 넓게)
        val beyond = farY + s.side * SIDEWALK_W
        drawRect(c.line, Offset(0f, min(m.y(farY), m.y(beyond))), Size(size.width, abs(m.y(beyond) - m.y(farY))))
        drawLine(back, Offset(edgeFrom, m.y(farY)), Offset(edgeTo, m.y(farY)), w * 1.5f, pathEffect = dash)
        return
    }

    // 직각·사선: 경계선은 stallDir 방향, 간격 pitch
    val u = s.stallDir
    val along = s.rowDepth / abs(u.y) // 경계선 길이 (u 방향)
    val dx = u.x * along
    val kFrom = if (s.approximate) 0 else floor((left - s.x0 - max(0.0, dx)) / s.pitch).toInt() - 1
    val kTo = if (s.approximate) 1 else ceil((right - s.x0 - min(0.0, dx)) / s.pitch).toInt() + 1
    for (k in kFrom..kTo) {
        val x = s.x0 + k * s.pitch
        drawLine(sep, Offset(m.x(x), m.y(s.yEdge)), Offset(m.x(x + dx), m.y(farY)), w, pathEffect = dash)
    }
    // 칸 줄 끝선
    if (s.approximate) {
        val xs = listOf(s.x0 + dx, s.x0 + s.pitch + dx)
        drawLine(back, Offset(m.x(xs[0]), m.y(farY)), Offset(m.x(xs[1]), m.y(farY)), w, pathEffect = dash)
    } else {
        drawLine(back, Offset(0f, m.y(farY)), Offset(size.width, m.y(farY)), w)
    }

    // 직각주차면 통로 건너편 칸 줄도 (경계선만, 끝선 없이)
    if (s.shape == ParkingShape.PERPENDICULAR && !s.approximate && s.oppositeRow) {
        val oppEdge = s.yEdge - s.side * s.aisleWidth
        val oppFar = oppEdge - s.side * STALL_L
        for (k in kFrom..kTo) {
            val x = s.x0 + k * s.pitch
            drawLine(sep, Offset(m.x(x), m.y(oppEdge)), Offset(m.x(x), m.y(oppFar)), w)
        }
    }
}

/** 진행값까지 동선을 그리고, 머리(현재 위치·방향)를 돌려준다. */
private fun DrawScope.drawTrail(s: Scene, m: Mapper, progress: Double, color: Color, lw: Float, small: Boolean): Pair<V, Double> {
    val pts = s.pts
    if (pts.size < 2) return pts.last().p to pts.last().heading
    val solid = Stroke(lw, cap = StrokeCap.Round, join = StrokeJoin.Round)
    val dashed = Stroke(
        lw, cap = StrokeCap.Round, join = StrokeJoin.Round,
        pathEffect = PathEffect.dashPathEffect(floatArrayOf((if (small) 8 else 10).dp.toPx(), (if (small) 9 else 12).dp.toPx())),
    )
    var path = Path()
    var runReverse = pts[1].reverse
    path.moveTo(m.x(pts[0].p.x), m.y(pts[0].p.y))
    var headP = pts[0].p
    var headH = pts[0].heading
    fun flush() = drawPath(path, color, style = if (runReverse) dashed else solid)

    for (i in 1 until pts.size) {
        val a = pts[i - 1]
        val b = pts[i]
        if (s.prog[i - 1] >= progress && i > 1) break
        if (b.reverse != runReverse) {
            flush()
            path = Path().apply { moveTo(m.x(a.p.x), m.y(a.p.y)) }
            runReverse = b.reverse
        }
        val span = s.prog[i] - s.prog[i - 1]
        if (s.prog[i] <= progress || span <= 0) {
            path.lineTo(m.x(b.p.x), m.y(b.p.y))
            headP = b.p
            headH = b.heading
        } else {
            val f = ((progress - s.prog[i - 1]) / span).coerceIn(0.0, 1.0)
            val p = a.p + (b.p - a.p) * f
            path.lineTo(m.x(p.x), m.y(p.y))
            headP = p
            headH = a.heading + angleDiff(a.heading, b.heading) * f
            break
        }
    }
    flush()
    return headP to headH
}

/** 그림 위 라벨: 글자 뒤에 [bg]색 작은 판을 깔아 아래 선이 글자를 가로지르지 않게 */
private fun DrawScope.drawLabel(t: TextLayoutResult, topLeft: Offset, bg: Color) {
    val px = 4.dp.toPx()
    val py = 1.dp.toPx()
    drawRoundRect(
        bg,
        Offset(topLeft.x - px, topLeft.y - py),
        Size(t.size.width + px * 2, t.size.height + py * 2),
        CornerRadius(4.dp.toPx(), 4.dp.toPx()),
    )
    drawText(t, topLeft = topLeft)
}

private fun rectOf(topLeft: Offset, t: TextLayoutResult) = Rect(topLeft, Size(t.size.width.toFloat(), t.size.height.toFloat()))

/** 동선(꺾은선)이 [r]을 지나가는지. 선 두께 [pad]만큼 넓혀 구간마다 4px 간격으로 찍어 본다 */
private fun List<Offset>.passesThrough(r: Rect, pad: Float): Boolean {
    val box = r.inflate(pad)
    if (size == 1) return box.contains(this[0])
    for (i in 0 until size - 1) {
        val a = this[i]
        val b = this[i + 1]
        val n = (max(abs(b.x - a.x), abs(b.y - a.y)) / 4f).toInt().coerceIn(1, 400)
        for (k in 0..n) {
            val f = k / n.toFloat()
            if (box.contains(Offset(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f))) return true
        }
    }
    return false
}

/** 위에서 본 차 아이콘: 둥근 사각형 + 앞유리(크게) + 뒷유리(작게). 옆 차는 그리지 않는다. */
private fun DrawScope.drawCar(p: V, heading: Double, m: Mapper, c: ParkingColors, approximate: Boolean) {
    val center = m.o(p)
    val w = (CAR_W * m.k).toFloat()
    val l = (CAR_L * m.k).toFloat()
    val body = if (approximate) c.inkMuted else c.ink
    // 화면에서 앞(위쪽)을 heading 방향으로: 시계방향 회전각 = -heading
    val deg = (-heading * 180 / PI).toFloat()
    rotate(deg, center) {
        val tl = Offset(center.x - w / 2, center.y - l / 2)
        drawRoundRect(body, tl, Size(w, l), CornerRadius(w * 0.21f, w * 0.21f))
        if (!approximate) {
            // 앞유리: 앞에서 15%~31%
            val ww = w * 0.71f
            drawRoundRect(
                c.surfaceRaised.copy(alpha = 0.85f),
                Offset(center.x - ww / 2, tl.y + l * 0.15f), Size(ww, l * 0.165f), CornerRadius(w * 0.09f, w * 0.09f),
            )
            // 뒷유리: 뒤에서 7%~17%
            val rw = w * 0.64f
            drawRoundRect(
                c.surfaceRaised.copy(alpha = 0.5f),
                Offset(center.x - rw / 2, tl.y + l * (1f - 0.165f)), Size(rw, l * 0.095f), CornerRadius(w * 0.07f, w * 0.07f),
            )
        }
    }
}
