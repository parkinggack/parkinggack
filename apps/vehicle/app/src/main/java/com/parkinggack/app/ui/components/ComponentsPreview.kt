package com.parkinggack.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.ReasonTag
import com.parkinggack.app.ui.screens.PreviewData
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/** Components.dc.html 대응: 색 · 글자 · 배너 · 난이도 배지 5단계 · 이유 태그 · 아이콘 · 버튼 · 선택지 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ComponentSheet() {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val sectionTitle = t.heading
    Row(
        Modifier.fillMaxSize().background(c.surface).padding(horizontal = 64.dp, vertical = 40.dp),
        horizontalArrangement = Arrangement.spacedBy(40.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(28.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("색 · 제때 디자인 시스템 (차 화면 ${if (c.isDark) "다크" else "라이트"})", style = sectionTitle)
                val swatches: List<Pair<String, Color>> = listOf(
                    "surface" to c.surface, "surface-raised" to c.surfaceRaised, "line" to c.line, "line-strong" to c.lineStrong,
                    "track" to c.track, "ink-muted" to c.inkMuted, "ink" to c.ink, "hatch-a" to c.hatchA,
                )
                swatches.chunked(4).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { (name, color) ->
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(12.dp)).background(color).parkingBorder(1.dp, c.line, 12.dp))
                                Text(name, style = t.label)
                                Text(hex(color), style = t.caption.copy(fontFamily = FontFamily.Monospace), color = c.inkMuted)
                            }
                        }
                    }
                }
                Text(
                    "상태는 색이 아니라 채움과 단어로 구분해요. 빨강·초록 상태색, 그라데이션, 그림자는 쓰지 않아요.",
                    style = t.caption, color = c.inkMuted,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("글자 · 차 화면", style = sectionTitle)
                ParkingCard(Modifier.fillMaxWidth(), border = CardBorder.None, padding = PaddingValues(horizontal = 24.dp, vertical = 20.dp), spacing = 10.dp) {
                    listOf(
                        Triple("car-display 72", "★4.3", t.display),
                        Triple("car-title 34", "B2에 대셨나요?", t.title),
                        Triple("car-heading 22", "층별 혼잡", t.heading),
                        Triple("car-body 20", "도착지 주차장은 조금 까다로워요", t.body),
                        Triple("car-label 16", "평균 후진 3.2회", t.label),
                        Triple("car-caption 14", "최근 30일 · 차량 142대 기준", t.caption),
                    ).forEach { (token, sample, style) ->
                        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text(token, style = t.caption, color = c.inkMuted, modifier = Modifier.width(110.dp).alignByBaseline())
                            Text(
                                sample, style = style, maxLines = 1,
                                color = if (style == t.caption) c.inkMuted else Color.Unspecified,
                                modifier = Modifier.alignByBaseline(),
                            )
                        }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("주행 중 배너", style = sectionTitle)
                DrivingBanner("도착지 주차 ★4.3 어려움", level = 4)
                RecordingBadge(reverseCount = 1, elapsedSec = 72)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(28.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("난이도 배지 · 5단계", style = sectionTitle)
                ParkingCard(Modifier.fillMaxWidth(), border = CardBorder.None, padding = PaddingValues(horizontal = 20.dp, vertical = 12.dp), spacing = 0.dp) {
                    val levels = listOf(
                        1 to "넓고 평면, 후진 거의 없음", 2 to "", 3 to "", 4 to "좁은 램프 · 기둥 많음", 5 to "기계식 · 나선 램프 · 후진 잦음",
                    )
                    levels.forEach { (n, desc) ->
                        val d = Difficulty(n.toDouble())
                        Row(Modifier.height(48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            DifficultyBars(d.level, size = BarsSize.Medium)
                            Text("★$n", style = t.heading, modifier = Modifier.width(48.dp))
                            Text(d.label, style = t.heading.sized(20.sp), modifier = Modifier.width(110.dp))
                            Text(desc, style = t.caption, color = c.inkMuted, maxLines = 1)
                        }
                    }
                    Row(Modifier.height(48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        DifficultyBars(null, size = BarsSize.Medium)
                        Text(NO_DATA_LABEL, style = t.heading.sized(20.sp), color = c.inkMuted)
                        Text("데이터 부족 = 점선", style = t.caption, color = c.inkMuted)
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("이유 태그 · 아이콘", style = sectionTitle)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ReasonTag.entries.forEach { ReasonTagChip(it) }
                }
                FlowRow(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surfaceRaised).padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    listOf(Glyph.Pin to "위치·메모", Glyph.Zone to "구역", Glyph.Phone to "폰", Glyph.Reverse to "후진").forEach { (g, label) ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            GlyphIcon(g, tint = c.inkMuted)
                            Text(label, style = t.caption, color = c.inkMuted)
                        }
                    }
                    Text("24px 격자 · 2px 선 · 둥근 끝 · currentColor", style = t.caption, color = c.inkMuted, modifier = Modifier.align(Alignment.CenterVertically))
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("버튼 · 선택지", style = sectionTitle)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    PrimaryButton("주 버튼", {}, Modifier.weight(1f))
                    SecondaryButton("보조 버튼", {}, Modifier.weight(1f))
                    GhostButton("약한 버튼", {}, Modifier.weight(1f), height = 76.dp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    ChoiceButton("B1", false, {}, Modifier.width(96.dp))
                    ChoiceButton("B2", true, {}, Modifier.width(96.dp))
                    Text("선택지 · 기본 / 선택됨 (inverse 뒤집기) · 최소 76dp", style = t.caption, color = c.inkMuted)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    ToggleVisual(true)
                    ToggleVisual(false)
                    EstimateChip()
                }
            }
        }
    }
}

private fun hex(color: Color): String = "#%06x".format(color.toArgb() and 0xFFFFFF)

@Preview(widthDp = 1280, heightDp = 1080, name = "컴포넌트 (다크)")
@Composable
private fun ComponentSheetPreview() = ParkingTheme(dark = true) { ComponentSheet() }

@Preview(widthDp = 1280, heightDp = 1080, name = "컴포넌트 (라이트)")
@Composable
private fun ComponentSheetLightPreview() = ParkingTheme(dark = false) { ComponentSheet() }

/** C-12 상태별: 직각 / 평행 / 사선 / 오차가 클 때 */
@Preview(widthDp = 1280, heightDp = 720, name = "동선 그림 · 형태별")
@Composable
private fun TrajectoryShapesPreview() = ParkingTheme(dark = true) { TrajectoryShapesSheet() }

/** C-12-states 시안 대응 (미리보기·스냅숏 공용): 형태별 동선 그림 248 × 300 + 설명 */
@Composable
internal fun TrajectoryShapesSheet() {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(
        Modifier.fillMaxSize().background(c.surface).padding(40.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("C-12 주차 형태별 그림", style = t.title.sized(28.sp))
            Text(
                "통로 방향과 마지막 차 방향의 각도로 형태를 판별해서, 옆 칸을 그 모양대로 이어 그림",
                style = t.body.sized(18.sp), color = c.inkMuted,
            )
        }
        Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            val cases = listOf(
                Triple("직각주차 · 약 90°", PreviewData.summary to PreviewData.trajectory, "옆 칸을 세로로 이어 그림. 가장 흔한 형태"),
                Triple("평행주차 · 약 0°", PreviewData.parallelSummary to PreviewData.parallelTrajectory, "길쭉한 칸을 가로로 이어 그림. 후진 S자 + 앞으로 맞춤"),
                Triple("사선주차 · 45~70°", PreviewData.angledSummary to PreviewData.angledTrajectory, "비스듬한 칸. 보통 앞으로 들어가서 후진 없음"),
                Triple(
                    "오차가 클 때",
                    PreviewData.approximateSummary.copy(shape = ParkingShape.UNKNOWN) to PreviewData.trajectory,
                    "저속 구간이 길거나 신호가 끊기면 전환점만 직선으로 이어 단순하게 보여 줌",
                ),
            )
            cases.forEach { (label, data, desc) ->
                val (summary, poses) = data
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(label, style = t.label, color = c.inkMuted)
                    ParkingCard(
                        Modifier.fillMaxWidth().weight(1f),
                        border = if (summary.approximate) CardBorder.Dashed else CardBorder.Strong,
                        radius = 16.dp,
                        padding = PaddingValues(14.dp),
                    ) {
                        TrajectoryView(
                            poses, summary.switchPoints, summary.shape, 1f, summary.approximate,
                            Modifier.fillMaxWidth().height(300.dp),
                            showLabels = false,
                        )
                        if (summary.approximate) {
                            Pill(
                                "대략적인 동선이에요", height = 32.dp, textStyle = t.caption.copy(fontWeight = FontWeight.Bold),
                                border = c.lineStrong, dashed = true,
                            )
                        }
                        Text(desc, style = t.caption.sized(15.sp, 1.5f), color = c.inkMuted)
                    }
                }
            }
        }
    }
}

@Preview(widthDp = 560, heightDp = 260, name = "C-05 썸네일")
@Composable
private fun TrajectoryThumbPreview() = ParkingTheme(dark = true) {
    Box(Modifier.size(560.dp, 260.dp).background(ParkingTheme.colors.surfaceRaised).padding(20.dp)) {
        TrajectoryView(
            PreviewData.trajectory, PreviewData.switchPoints, ParkingShape.PERPENDICULAR, 1f, false,
            Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp)), showLabels = false,
        )
    }
}
