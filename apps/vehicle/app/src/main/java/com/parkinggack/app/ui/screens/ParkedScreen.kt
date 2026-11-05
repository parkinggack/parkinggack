package com.parkinggack.app.ui.screens

import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription

import com.parkinggack.app.ui.components.popIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.Pose
import com.parkinggack.app.ui.components.ActionTile
import com.parkinggack.app.ui.components.BigFloorText
import com.parkinggack.app.ui.components.EstimateChip
import com.parkinggack.app.ui.components.Glyph
import com.parkinggack.app.ui.components.GlyphIcon
import com.parkinggack.app.ui.components.ParkedBadge
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.ProgressTrack
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.TrajectoryView
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.components.GlyphIcon
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/**
 * C-05 주차 완료 카드. P를 넣은 뒤 3초 안에 끝나야 한다 — 아무것도 안 누르면 추정 층으로 자동 저장.
 * 신뢰도: 높음 = 큰 층 / 보통 = 큰 층 + 점선 '추정' / 낮음 = 층 버튼부터.
 * 오른쪽 '오늘 주차' 카드의 동선 썸네일을 누르면 C-12 리플레이.
 * 주차왕 참여자면 '오늘 주차' 카드에 한 줄: "주차왕 이번 주 12등 → 10등".
 */
@Composable
fun ParkedScreen(
    estimate: FloorEstimate,
    floors: List<String>,
    summary: ManeuverSummary,
    comparisonText: String,
    trajectory: List<Pose>,
    autoSaveProgress: Float,
    autoSaveSecondsLeft: Int,
    onConfirm: () -> Unit,
    onOtherFloor: () -> Unit,
    onPickFloor: (String) -> Unit,
    onRememberZone: () -> Unit,
    onSendToPhone: () -> Unit,
    onOpenReplay: () -> Unit,
    /** 배지 옆 한 줄: 주차장 이름 · [placeTime]. 없으면 생략 */
    placeLine: String? = null,
    /** 주차 시각 "오전 11:54" — 이름이 길어도 잘리지 않게 따로 (시스템 글꼴을 키우면 시각이 잘렸다, 3-10) */
    placeTime: String? = null,
    /** 이미 저장됨 (C-06에서 돌아왔거나 자동 저장 끝) */
    saved: Boolean = autoSaveSecondsLeft <= 0,
    /** "주차왕 이번 주 12등 → 10등" (참여자만). 없으면 생략 */
    kingLine: String? = null,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    // 신뢰도 낮음: 층 버튼을 먼저. 고르지 않으면 조금 더 기다렸다 층 없이 저장 (기록은 잃지 않게)
    val awaitingPick = estimate.confidence == Confidence.LOW && !saved
    Column(
        Modifier.fillMaxSize().background(c.surface).padding(start = 48.dp, end = 48.dp, top = 36.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(40.dp)) {
            BoxWithConstraints(Modifier.weight(584f).fillMaxHeight()) {
                // 시안은 세로 600dp. Pleos 창처럼 넉넉하면 층 글자·버튼을 키워 빈 곳 없이
                val roomy = maxHeight >= 720.dp
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Row(Modifier.popIn(0), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        ParkedBadge()
                        if (placeLine != null) {
                            val style = t.body.sized(20.sp, 1.3f)
                            val full = listOfNotNull(placeLine, placeTime).joinToString(" · ")
                            // 보이는 건 두 조각(이름만 말줄임), 읽는 건 한 줄 — 화면 읽기·sim 검사가 "이름 · 오후 3:11"로 받게
                            Row(Modifier.weight(1f, fill = false).clearAndSetSemantics { contentDescription = full }) {
                                Text(placeLine, style = style, color = c.inkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                if (placeTime != null) Text(" · $placeTime", style = style, color = c.inkMuted, maxLines = 1, softWrap = false)
                            }
                        }
                    }
                    if (estimate.confidence == Confidence.LOW) {
                        LowConfidenceFloors(floors, onPickFloor, roomy)
                    } else {
                        if (roomy) Spacer(Modifier.weight(1f))
                        // 주인공: 큰 층 글자가 크게 튀어오르며
                        Row(Modifier.popIn(1, fromY = 48.dp, fromScale = 0.8f), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                            BigFloorText(estimate.floor, Modifier.weight(1f, fill = false), fontSize = if (roomy) 300.sp else 220.sp)
                            if (estimate.confidence == Confidence.MEDIUM) EstimateChip(Modifier.padding(bottom = 10.dp))
                        }
                        Text("${estimate.floor}에 대셨나요?", style = t.title.sized(if (roomy) 44.sp else 38.sp, 1.25f), modifier = Modifier.popIn(2))
                        Row(Modifier.popIn(3), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            val h = if (roomy) 104.dp else 88.dp
                            PrimaryButton("맞아요", onConfirm, Modifier.weight(280f), height = h, fontSize = if (roomy) 32.sp else 28.sp)
                            SecondaryButton(
                                "다른 층이에요", onOtherFloor, Modifier.weight(240f),
                                height = h, fontSize = if (roomy) 26.sp else 24.sp, fontWeight = FontWeight.Medium,
                            )
                            Spacer(Modifier.weight(30f))
                        }
                        if (roomy) Spacer(Modifier.weight(0.35f))
                    }
                }
            }
            Column(Modifier.weight(560f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                TodayCard(summary, comparisonText, kingLine, trajectory, onOpenReplay, Modifier.weight(1f).fillMaxWidth().popIn(1))
                Row(Modifier.fillMaxWidth().popIn(2), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    ActionTile(Glyph.Zone, "구역도 기억하기", "기둥 번호까지", onRememberZone, Modifier.weight(1f))
                    ActionTile(Glyph.Phone, "폰으로 보내기", "QR 한 번이면 끝", onSendToPhone, Modifier.weight(1f))
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            ProgressTrack(autoSaveProgress, Modifier.weight(1f))
            Text(
                when {
                    awaitingPick -> "고르지 않으면 ${autoSaveSecondsLeft}초 뒤 층 없이 저장돼요"
                    saved && estimate.confidence == Confidence.LOW -> "저장했어요"
                    saved -> "${withRo(estimate.floor)} 저장했어요"
                    else -> "그대로 두면 ${autoSaveSecondsLeft}초 뒤 ${withRo(estimate.floor)} 저장돼요"
                },
                style = t.body.sized(18.sp, 1.3f),
                color = c.inkMuted,
            )
        }
    }
}

@Composable
private fun ColumnScope.LowConfidenceFloors(floors: List<String>, onPickFloor: (String) -> Unit, roomy: Boolean = false) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Text("몇 층에 대셨나요?", style = t.title.sized(if (roomy) 52.sp else 44.sp, 1.25f))
    Text("이번엔 층을 확실히 모르겠어요. 한 번만 골라 주세요", style = t.body.sized(22.sp, 1.45f), color = c.inkMuted)
    if (roomy) Spacer(Modifier.weight(1f))
    val ordered = floorsBottomUp(floors)
    val rows = ordered.chunked(5)
    // 넉넉하면 두 줄이어도 큰 버튼 (차 화면: 크게, 누르기 쉽게)
    val tall = rows.size <= 1 || roomy
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        rows.forEachIndexed { ri, row ->
            Row(Modifier.popIn(1 + ri), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { f ->
                    Box(
                        Modifier
                            .weight(1f)
                            .heightIn(min = if (roomy) 140.dp else if (tall) 120.dp else 88.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(c.surfaceRaised)
                            .parkingBorder(1.5.dp, c.lineStrong, 16.dp)
                            .clickable(role = Role.Button, onClickLabel = "$f 선택") { onPickFloor(f) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(f, style = t.display.sized(if (roomy) 52.sp else if (tall) 44.sp else 36.sp, 1.2f), maxLines = 1)
                    }
                }
                repeat(5 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
    if (roomy) Spacer(Modifier.weight(0.35f))
}

@Composable
private fun TodayCard(
    summary: ManeuverSummary,
    comparisonText: String,
    kingLine: String?,
    trajectory: List<Pose>,
    onOpenReplay: () -> Unit,
    modifier: Modifier,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, c.lineStrong, 16.dp)
            .clickable(role = Role.Button, onClickLabel = "동선 크게 보기", onClick = onOpenReplay)
            .padding(1.5.dp) // 테두리 두께 (시안 CSS border-box)
            .padding(horizontal = 22.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(Modifier.fillMaxWidth()) {
            Text("오늘 주차", style = t.label.sized(18.sp, 1.3f), color = c.inkMuted, modifier = Modifier.weight(1f))
            Text("동선 크게 보기 ›", style = t.body.sized(18.sp, 1.3f, FontWeight.Medium), color = c.inkMuted)
        }
        Text("후진 ${summary.reverseCount}회 · ${formatDurationKo(summary.durationSec)}", style = t.title, maxLines = 1)
        Text(comparisonText, style = t.body, color = c.inkMuted, maxLines = 1)
        if (kingLine != null) {
            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlyphIcon(Glyph.Crown, size = 24.dp, tint = c.ink)
                Text(kingLine, style = t.heading.sized(20.sp, 1.3f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Spacer(Modifier.height(4.dp))
        TrajectoryView(
            poses = trajectory,
            switchPoints = summary.switchPoints,
            shape = summary.shape,
            progress = 1f,
            approximate = summary.approximate,
            // 시안: 썸네일 513 × 230. 세로가 넉넉하면 남는 높이를 모두 동선 그림에 (빈 곳 없이)
            modifier = Modifier.fillMaxWidth().weight(1f).heightIn(max = ThumbnailMinHeight * 2.4f).clip(RoundedCornerShape(12.dp)),
            showLabels = false,
        )
    }
}

private val ThumbnailMinHeight = 230.dp

@CarPreview
@Composable
private fun ParkedHighPreview() = PreviewFrame {
    ParkedPreviewContent(PreviewData.estimateHigh)
}

@CarPreview
@Composable
private fun ParkedMediumPreview() = PreviewFrame {
    ParkedPreviewContent(PreviewData.estimateMedium)
}

@CarPreview
@Composable
private fun ParkedLowPreview() = PreviewFrame {
    ParkedPreviewContent(PreviewData.estimateLow)
}

@CarPreviewLight
@Composable
private fun ParkedHighLightPreview() = PreviewFrame(dark = false) {
    ParkedPreviewContent(PreviewData.estimateHigh)
}

@Composable
private fun ParkedPreviewContent(estimate: FloorEstimate) {
    ParkedScreen(
        estimate = estimate,
        floors = PreviewData.parkedFloors,
        summary = PreviewData.summary,
        comparisonText = "평소보다 수월했어요",
        trajectory = PreviewData.trajectory,
        autoSaveProgress = 0.4f,
        autoSaveSecondsLeft = 3,
        onConfirm = {}, onOtherFloor = {}, onPickFloor = {}, onRememberZone = {}, onSendToPhone = {}, onOpenReplay = {},
        kingLine = "주차왕 이번 주 12등 → 10등",
    )
}
