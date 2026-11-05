package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.popIn
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.SwitchPoint
import com.parkinggack.app.ui.components.NumberMark
import com.parkinggack.app.ui.components.PMark
import com.parkinggack.app.ui.components.Pill
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.TrajectoryView
import com.parkinggack.app.ui.components.cssLineBox
import com.parkinggack.app.ui.components.formatClock
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.components.topDivider
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.hero
import com.parkinggack.app.ui.theme.sized

const val REPLAY_CAPTION = "동선을 그림으로 다시 그렸어요 · 실제 도면이나 옆 차 위치가 아니에요"
const val APPROXIMATE_LABEL = "대략적인 동선이에요"
private const val REPLAY_MS = 4000

/**
 * C-12 주차 동선 리플레이 (정차 중). 4초 동안 동선이 그려지고 '다시 보기'로 처음부터.
 * 실선 = 앞으로, 점선 = 후진, 번호 = 방향을 바꾼 곳. 필수 문구 [REPLAY_CAPTION].
 *
 * [initialProgress]: 처음 열 때 어디서 시작할지 (0 = 처음부터 재생, 1 = 다 그린 상태로 멈춤).
 * 비우면 미리보기(LocalInspectionMode)에서는 1, 실제 화면에서는 0. 스냅숏 테스트는 1을 넘긴다.
 */
@Composable
fun ReplayScreen(
    summary: ManeuverSummary,
    trajectory: List<Pose>,
    onClose: () -> Unit,
    initialProgress: Float? = null,
    /** 제목 앞말 — 방금 주차면 "오늘", C-09에서 연 지난 기록이면 "어제" / "11.1 (일)" ([formatDayLabel]) */
    dayLabel: String = "오늘",
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val inspection = LocalInspectionMode.current
    val start = (initialProgress ?: if (inspection) 1f else 0f).coerceIn(0f, 1f)
    val progress = remember { Animatable(start) }
    var run by remember { mutableIntStateOf(0) }
    LaunchedEffect(run) {
        // 다 그린 상태로 열었으면 '다시 보기'를 누를 때까지 그대로
        if (run == 0 && start >= 1f) return@LaunchedEffect
        progress.snapTo(if (run == 0) start else 0f)
        val remainingMs = ((1f - progress.value) * REPLAY_MS).toInt().coerceAtLeast(1)
        progress.animateTo(1f, tween(durationMillis = remainingMs, easing = LinearEasing))
    }

    val t0 = trajectory.firstOrNull()?.tMs ?: summary.switchPoints.minOfOrNull { it.tMs } ?: 0L
    // 표시 시간은 요약 기준, 막대 위 전환점 위치는 동선 그림과 같은 시간 범위(궤적 처음~끝) 기준
    val totalMs = (summary.durationSec * 1000L).takeIf { it > 0 }
        ?: ((trajectory.lastOrNull()?.tMs ?: t0) - t0).coerceAtLeast(1L)
    val spanMs = ((trajectory.lastOrNull()?.tMs ?: t0) - t0).takeIf { it > 0 } ?: totalMs
    val switches = summary.switchPoints.sortedBy { it.tMs }
    val fractions = switches.map { ((it.tMs - t0).toFloat() / spanMs).coerceIn(0f, 1f) }

    Row(
        Modifier.fillMaxSize().background(c.surface).padding(horizontal = 40.dp, vertical = 28.dp),
        horizontalArrangement = Arrangement.spacedBy(32.dp),
    ) {
        Column(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(12.dp))
                .background(c.surfaceRaised)
                .parkingBorder(1.5.dp, c.lineStrong, 12.dp),
        ) {
            TrajectoryView(
                poses = trajectory,
                switchPoints = summary.switchPoints,
                shape = summary.shape,
                progress = progress.value,
                approximate = summary.approximate,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                showLabels = true,
            )
            // 시안: 그림 500 + 아래 칸(타임라인·안내) 나머지 ≈ 117. 내용은 위에 붙인다.
            Column(
                Modifier.fillMaxWidth().heightIn(min = 116.dp).topDivider(c.line, 1.5.dp).padding(start = 24.dp, end = 24.dp, top = 14.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("0:00", style = t.caption.sized(15.sp, 1.2f), color = c.inkMuted)
                    TimelineBar(progress.value, fractions, Modifier.weight(1f))
                    Text(formatClock((totalMs / 1000).toInt()), style = t.caption.sized(15.sp, 1.2f), color = c.inkMuted)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        Modifier.size(20.dp).clip(CircleShape).parkingBorder(1.5.dp, c.lineStrong, 10.dp).clearAndSetSemantics { },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("i", style = t.caption.copy(fontWeight = FontWeight.Bold, lineHeight = 14.sp), color = c.inkMuted)
                    }
                    Text(REPLAY_CAPTION, style = t.label.sized(16.sp, 1.3f, FontWeight.Normal), color = c.inkMuted)
                }
            }
        }

        Column(Modifier.width(388.dp).fillMaxHeight().popIn(1), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("$dayLabel 주차 동선", style = t.heading, modifier = Modifier.weight(1f))
                if (summary.shape != ParkingShape.UNKNOWN) Pill(summary.shape.label)
            }
            if (summary.approximate) {
                Pill(
                    APPROXIMATE_LABEL, height = 32.dp, textStyle = t.caption.copy(fontWeight = FontWeight.Bold),
                    border = c.lineStrong, dashed = true,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val heroStyle = t.display.hero(56.sp, 0.sp)
                Text("후진 ${summary.reverseCount}회", style = heroStyle, modifier = Modifier.cssLineBox(heroStyle))
                Text(
                    "핸들 ${summary.steeringTurns}번 꺾음 · ${formatDurationKo(summary.durationSec)}",
                    style = t.body, color = c.inkMuted,
                )
            }
            Timeline(switches, t0, totalMs)
            Legend()
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PrimaryButton("다시 보기", { run += 1 }, Modifier.weight(1f))
                SecondaryButton("닫기", onClose, Modifier.width(130.dp), fontSize = 20.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

/** 진행 막대 + 전환점 표시 원 */
@Composable
private fun TimelineBar(progress: Float, marks: List<Float>, modifier: Modifier) {
    val c = ParkingTheme.colors
    Canvas(modifier.height(20.dp).clearAndSetSemantics { }) {
        val h = 8.dp.toPx()
        val y = (size.height - h) / 2
        val r = CornerRadius(h / 2, h / 2)
        drawRoundRect(c.track, Offset(0f, y), Size(size.width, h), r)
        drawRoundRect(c.ink, Offset(0f, y), Size(size.width * progress.coerceIn(0f, 1f), h), r)
        marks.forEach { f ->
            val center = Offset(size.width * f, size.height / 2)
            drawCircle(c.surfaceRaised, 10.dp.toPx(), center)
            drawCircle(c.ink, 10.dp.toPx() - 1.25.dp.toPx(), center, style = Stroke(2.5.dp.toPx()))
        }
    }
}

/** 전환점 설명 (운전자를 평가하지 않는 사실 서술) */
private fun describe(sp: SwitchPoint, i: Int, all: List<SwitchPoint>): String {
    val isLast = i == all.lastIndex
    val firstReverse = all.indexOfFirst { it.toReverse } == i
    return when {
        sp.toReverse && firstReverse && isLast -> "멈춘 뒤 후진해서 칸으로"
        sp.toReverse && firstReverse -> "지나쳐 멈춤 → 후진"
        sp.toReverse && isLast -> "다시 후진해서 칸으로"
        sp.toReverse -> "다시 후진"
        isLast -> "앞으로 맞춤"
        else -> "앞으로 조금"
    }
}

@Composable
private fun Timeline(switches: List<SwitchPoint>, t0: Long, totalMs: Long) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val row = t.body.sized(17.sp, 1.3f)
    val time = t.body.sized(17.sp, 1.3f)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        TimelineRow(time = "0:00", text = "통로로 들어옴", style = row, timeStyle = time) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(c.ink))
        }
        switches.forEachIndexed { i, sp ->
            TimelineRow(formatClock(((sp.tMs - t0) / 1000).toInt()), describe(sp, i, switches), row, time) {
                NumberMark(sp.index)
            }
        }
        TimelineRow(formatClock((totalMs / 1000).toInt()), "주차 완료", row.copy(fontWeight = FontWeight.Bold), time) {
            PMark(size = 28.dp)
        }
    }
}

@Composable
private fun TimelineRow(
    time: String,
    text: String,
    style: androidx.compose.ui.text.TextStyle,
    timeStyle: androidx.compose.ui.text.TextStyle,
    mark: @Composable () -> Unit,
) {
    val c = ParkingTheme.colors
    Row(Modifier.heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) { mark() }
        Text(time, style = timeStyle, color = c.inkMuted, modifier = Modifier.width(48.dp))
        Text(text, style = style, maxLines = 1)
    }
}

@Composable
private fun Legend() {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, c.line, 12.dp)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        listOf(false to "앞으로 간 길", true to "후진한 길 · 번호는 방향을 바꾼 곳").forEach { (dashed, label) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Canvas(Modifier.size(44.dp, 8.dp).clearAndSetSemantics { }) {
                    drawLine(
                        c.ink, Offset(2.dp.toPx(), size.height / 2), Offset(size.width - 2.dp.toPx(), size.height / 2),
                        strokeWidth = 4.dp.toPx(), cap = StrokeCap.Round,
                        pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(7.dp.toPx(), 7.dp.toPx())) else null,
                    )
                }
                Text(label, style = t.label.sized(16.sp, 1.3f, FontWeight.Normal))
            }
        }
    }
}

@CarPreview
@Composable
private fun ReplayPreview() = PreviewFrame {
    ReplayScreen(PreviewData.summary, PreviewData.trajectory, onClose = {})
}

@CarPreview
@Composable
private fun ReplayApproximatePreview() = PreviewFrame {
    ReplayScreen(PreviewData.approximateSummary, PreviewData.trajectory, onClose = {})
}

@CarPreview
@Composable
private fun ReplayParallelPreview() = PreviewFrame {
    ReplayScreen(PreviewData.parallelSummary, PreviewData.parallelTrajectory, onClose = {})
}

@CarPreviewLight
@Composable
private fun ReplayAngledLightPreview() = PreviewFrame(dark = false) {
    ReplayScreen(PreviewData.angledSummary, PreviewData.angledTrajectory, onClose = {})
}
