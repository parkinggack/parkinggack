package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.popIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.ui.components.BadgeStyle
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.DifficultyBadge
import com.parkinggack.app.ui.components.FitText
import com.parkinggack.app.ui.components.Glyph
import com.parkinggack.app.ui.components.GlyphIcon
import com.parkinggack.app.ui.components.NavScaffold
import com.parkinggack.app.ui.components.NavTab
import com.parkinggack.app.ui.components.NoteChip
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.StatRow
import com.parkinggack.app.ui.components.TrajectoryView
import com.parkinggack.app.ui.components.bottomDivider
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.hero
import com.parkinggack.app.ui.theme.sized

// 내 기록 0건 (C-01·C-09). '아직 기록이 적어요'는 주차장 기록이 모자랄 때 쓰는 말(기획서 11장 데이터 부족) — 0건엔 맞지 않다 (3-1)
const val EMPTY_RECORD_TITLE = "아직 주차 기록이 없어요."
const val EMPTY_RECORD_BODY = "첫 기록을 남겨 주세요"
/** C-01 오른쪽 '내 주차' 줄 (기록 0건) — 왼쪽 카드와 같은 말을 두 번 하지 않게 */
const val EMPTY_SUMMARY_LINE = "주차하면 지난 주차를 여기서 보여 드려요"

/**
 * C-01 홈. 앱을 열자마자 '최근 주차 위치'가 먼저. 왼쪽은 아이콘 메뉴 (홈 · 내 기록 · 주차왕 · 설정).
 * 오른쪽 '내 주차'는 두 줄: 지난 주차 한 줄(→ C-09), 주차왕 이번 주 순위(→ C-13).
 *
 * 시안은 1280×676dp. Pleos 창(1280×921dp 상당)처럼 세로가 넉넉하면 빈 곳 대신
 * 왼쪽 카드에 지난 주차 동선 그림, 오른쪽 '내 주차'에 숫자 칸·월별 그래프를 더 보여 준다 (자리가 모자라면 숨김).
 */
@Composable
fun HomeScreen(
    lastRecord: ParkingRecord?,
    favorites: List<ParkingLot>,
    lastSummaryLine: String?,
    onOpenLot: (ParkingLot) -> Unit,
    onSendToPhone: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
    records: List<ParkingRecord> = listOfNotNull(lastRecord),
    monthlyAvgReverse: List<Pair<String, Double>> = emptyList(),
    onOpenReplay: (ParkingRecord) -> Unit = {},
    /** "주차왕 이번 주 12등" — 없으면 줄을 숨김 */
    kingLine: String? = null,
    /** 주차왕 줄 오른쪽 작은 글 ("상위 8%") */
    kingTrailing: String? = null,
    onOpenRanking: () -> Unit = {},
) {
    NavScaffold(
        selected = NavTab.Home,
        onSelect = { tab ->
            when (tab) {
                NavTab.Home -> Unit
                NavTab.Records -> onOpenHistory()
                NavTab.King -> onOpenRanking()
            }
        },
        onSettings = onOpenSettings,
    ) {
        Row(
            Modifier.weight(1f).fillMaxHeight().padding(horizontal = 32.dp, vertical = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            LastParkingCard(lastRecord, onSendToPhone, onOpenReplay, Modifier.weight(520f).fillMaxHeight().popIn(0))
            Column(Modifier.weight(560f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                FavoritesCard(favorites, onOpenLot)
                MySummaryCard(
                    lastSummaryLine, kingLine, kingTrailing, records, monthlyAvgReverse, onOpenHistory, onOpenRanking,
                    Modifier.weight(1f).fillMaxWidth().popIn(2),
                )
            }
        }
    }
}

@Composable
private fun LastParkingCard(
    record: ParkingRecord?,
    onSendToPhone: () -> Unit,
    onOpenReplay: (ParkingRecord) -> Unit,
    modifier: Modifier,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    ParkingCard(
        modifier,
        border = if (record == null) CardBorder.Dashed else CardBorder.Strong,
        padding = PaddingValues(28.dp),
        spacing = 10.dp,
    ) {
        Text("최근 주차 위치", style = t.label.sized(18.sp, 1.3f), color = c.inkMuted)
        if (record == null) {
            Spacer(Modifier.height(8.dp))
            Text(EMPTY_RECORD_TITLE, style = t.title.sized(34.sp, 1.3f))
            Text(EMPTY_RECORD_BODY, style = t.body.sized(22.sp, 1.4f), color = c.inkMuted)
            Spacer(Modifier.height(4.dp))
            Text(
                "주차를 마치면 몇 층 어디에 댔는지 여기에 바로 보여 드릴게요",
                style = t.body.sized(18.sp, 1.45f),
                color = c.inkMuted,
            )
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                if (maxHeight >= 260.dp) HowItWorks(Modifier.align(Alignment.Center).popIn(3))
            }
        } else {
            FitText(
                text = record.positionText,
                style = t.display.hero(100.sp, (-0.03).em),
                modifier = Modifier.fillMaxWidth(),
                minSize = 56.sp,
            )
            Text(
                record.lotName,
                style = t.heading.sized(24.sp, 1.3f),
                modifier = Modifier.padding(top = 6.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(formatParkedLine(record.parkedAtMs, LocalNowMs.current()), style = t.body.sized(18.sp, 1.4f), color = c.inkMuted)
            record.note?.let { NoteChip(it, Modifier.padding(top = 4.dp)) }
        }
        val summary = record?.summary
        if (record != null && summary != null && record.trajectory.size >= 2) {
            // 남는 세로 자리에 지난 주차 동선 (C-05 썸네일과 같은 그림, 누르면 C-12)
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().padding(top = 14.dp, bottom = 18.dp)) {
                if (maxHeight >= 150.dp) {
                    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text("주차 동선", style = t.label.sized(18.sp, 1.3f), color = c.inkMuted, modifier = Modifier.weight(1f))
                            Text(
                                "후진 ${summary.reverseCount}회 · ${formatDurationKo(summary.durationSec)}  ›",
                                style = t.body.sized(18.sp, 1.3f, FontWeight.Medium),
                                color = c.inkMuted,
                            )
                        }
                        TrajectoryView(
                            poses = record.trajectory,
                            switchPoints = summary.switchPoints,
                            shape = summary.shape,
                            progress = 1f,
                            approximate = summary.approximate,
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable(role = Role.Button, onClickLabel = "동선 크게 보기") { onOpenReplay(record) },
                            showLabels = false,
                        )
                    }
                }
            }
        } else if (record != null) {
            Spacer(Modifier.weight(1f))
        }
        if (record != null) {
            PrimaryButton("폰으로 보내기", onSendToPhone, Modifier.fillMaxWidth(), fontSize = 24.sp)
        }
    }
}

@Composable
private fun FavoritesCard(favorites: List<ParkingLot>, onOpenLot: (ParkingLot) -> Unit) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    ParkingCard(Modifier.fillMaxWidth().popIn(1), padding = PaddingValues(horizontal = 24.dp, vertical = 20.dp), spacing = 6.dp) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("자주 가는 곳", style = t.heading, modifier = Modifier.weight(1f))
            Text("주차 난이도", style = t.caption.sized(15.sp, 1.3f), color = c.inkMuted)
        }
        if (favorites.isEmpty()) {
            Text(
                "자주 가는 주차장이 생기면 여기에 난이도를 보여 드릴게요",
                style = t.body.sized(18.sp, 1.45f),
                color = c.inkMuted,
                modifier = Modifier.padding(vertical = 12.dp),
            )
        }
        Column {
            val shown = favorites.take(3)
            shown.forEachIndexed { i, lot ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 80.dp)
                        .then(if (i < shown.lastIndex) Modifier.bottomDivider(c.line) else Modifier)
                        .clickable(role = Role.Button) { onOpenLot(lot) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // 실제 이름은 길다 ("현대백화점 판교점 지하주차장") → 잘라 먹지 말고 두 줄까지
                    Text(
                        lot.name,
                        style = t.heading.sized(22.sp, 1.3f),
                        modifier = Modifier.weight(1f).padding(vertical = 8.dp),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    // 시안: 막대(52) + 16 + 글자 칸 150
                    DifficultyBadge(
                        if (lot.hasEnoughData) lot.difficulty else null,
                        Modifier.width(218.dp),
                        style = BadgeStyle.Inline,
                        inlineTextStyle = t.heading.sized(20.sp, 1.3f, FontWeight.Bold),
                        inlineGap = 16.dp,
                    )
                    GlyphIcon(Glyph.Chevron, size = 22.dp, tint = c.lineStrong)
                }
            }
        }
    }
}

@Composable
private fun MySummaryCard(
    line: String?,
    kingLine: String?,
    kingTrailing: String?,
    records: List<ParkingRecord>,
    monthly: List<Pair<String, Double>>,
    onOpenHistory: () -> Unit,
    onOpenRanking: () -> Unit,
    modifier: Modifier,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val now = LocalNowMs.current()
    ParkingCard(modifier, padding = PaddingValues(horizontal = 20.dp, vertical = 18.dp), spacing = 8.dp) {
        Text("내 주차", style = t.label, color = c.inkMuted)
        LinkRow(line ?: EMPTY_SUMMARY_LINE, onOpenHistory)
        if (kingLine != null) LinkRow(kingLine, onOpenRanking, leading = Glyph.Crown, trailing = kingTrailing)
        // 남는 세로 자리: 숫자 칸 → (더 남으면) 월별 평균 후진 그래프
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val h = maxHeight
            if (records.isNotEmpty() && h >= 112.dp) {
                Column(Modifier.fillMaxSize().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatRow(remember(records, now) { homeStats(records, now) }, Modifier.fillMaxWidth())
                    if (monthly.size >= 2 && h >= 340.dp) {
                        Text("월별 평균 후진", style = t.caption.sized(15.sp, 1.3f), color = c.inkMuted, modifier = Modifier.padding(top = 6.dp))
                        MonthlyChart(monthly, Modifier.fillMaxWidth().weight(1f))
                    } else {
                        // 그래프 자리가 모자라면 최근 기록 몇 줄 (C-09 표의 축약)
                        val rows = ((h - 92.dp - 24.dp) / RecentRowHeight).toInt().coerceIn(0, 4)
                        if (rows > 0) RecentRecords(records.take(rows))
                    }
                }
            }
        }
    }
}

private val RecentRowHeight = 50.dp

/** '내 주차' 안의 누르는 줄 (60dp, surface 바탕): [아이콘] 글 [오른쪽 작은 글] › */
@Composable
private fun LinkRow(text: String, onClick: () -> Unit, leading: Glyph? = null, trailing: String? = null) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(c.surface)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (leading != null) GlyphIcon(leading, size = 26.dp, tint = c.ink)
        Text(text, style = t.heading.sized(20.sp, 1.3f), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (trailing != null) Text(trailing, style = t.body.sized(17.sp, 1.3f), color = c.inkMuted, maxLines = 1)
        GlyphIcon(Glyph.Chevron, size = 22.dp, tint = c.lineStrong)
    }
}

/** 기록이 없을 때: 이렇게 기록돼요 ①②③ (번호 원은 C-12 전환점 번호와 같은 모양) */
@Composable
private fun HowItWorks(modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val steps = listOf(
        "주차장에 들어가 천천히 달리면 알아서 기록을 시작해요",
        "P를 넣으면 몇 층에 댔는지 바로 보여 드려요",
        "폰으로 보내 두면 돌아올 때 바로 찾을 수 있어요",
    )
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(c.surface)
            .padding(horizontal = 24.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Text("이렇게 기록돼요", style = t.heading)
        steps.forEachIndexed { i, s ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                NumberDot(i + 1)
                Text(s, style = t.body.sized(19.sp, 1.4f))
            }
        }
    }
}

@Composable
private fun NumberDot(n: Int) {
    val c = ParkingTheme.colors
    androidx.compose.foundation.layout.Box(
        Modifier
            .size(36.dp)
            .clip(androidx.compose.foundation.shape.CircleShape)
            .background(c.surfaceRaised)
            .parkingBorder(2.5.dp, c.ink, 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("$n", style = ParkingTheme.type.label.sized(17.sp, 1.2f, FontWeight.Bold))
    }
}

@Composable
private fun RecentRecords(records: List<ParkingRecord>) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column {
        records.forEachIndexed { i, r ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(RecentRowHeight)
                    .then(if (i < records.lastIndex) Modifier.bottomDivider(c.line) else Modifier),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(formatDateShort(r.parkedAtMs), style = t.body.sized(17.sp, 1.3f), color = c.inkMuted, modifier = Modifier.width(92.dp), maxLines = 1)
                Text(r.lotName, style = t.body.sized(18.sp, 1.3f, FontWeight.Bold), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(r.floor ?: "–", style = t.body.sized(18.sp, 1.3f, FontWeight.Bold), maxLines = 1)
                Text(r.summary?.let { "후진 ${it.reverseCount}회" } ?: "", style = t.body.sized(17.sp, 1.3f), color = c.inkMuted, maxLines = 1)
            }
        }
    }
}

@CarPreview
@Composable
private fun HomeScreenPreview() = PreviewFrame {
    HomeScreen(
        lastRecord = PreviewData.lastRecord,
        favorites = PreviewData.favorites,
        lastSummaryLine = "지난 주차 후진 2회, 평소보다 쉬웠어요",
        onOpenLot = {}, onSendToPhone = {}, onOpenHistory = {}, onOpenSettings = {},
        kingLine = "주차왕 이번 주 12등", kingTrailing = "상위 8%",
    )
}

@CarPreview
@Composable
private fun HomeScreenEmptyPreview() = PreviewFrame {
    HomeScreen(
        lastRecord = null,
        favorites = emptyList(),
        lastSummaryLine = null,
        onOpenLot = {}, onSendToPhone = {}, onOpenHistory = {}, onOpenSettings = {},
    )
}

@CarPreviewLight
@Composable
private fun HomeScreenLightPreview() = PreviewFrame(dark = false) {
    HomeScreen(
        lastRecord = PreviewData.lastRecord,
        favorites = PreviewData.favorites,
        lastSummaryLine = "지난 주차 후진 2회, 평소보다 쉬웠어요",
        onOpenLot = {}, onSendToPhone = {}, onOpenHistory = {}, onOpenSettings = {},
        kingLine = "주차왕 이번 주 12등", kingTrailing = "상위 8%",
    )
}
