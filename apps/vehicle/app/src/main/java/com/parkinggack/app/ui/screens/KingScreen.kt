package com.parkinggack.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.KingBoard
import com.parkinggack.app.model.KingCopy
import com.parkinggack.app.model.KingRow
import com.parkinggack.app.model.KingStanding
import com.parkinggack.app.model.KingUi
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.Glyph
import com.parkinggack.app.ui.components.GlyphIcon
import com.parkinggack.app.ui.components.NavScaffold
import com.parkinggack.app.ui.components.NavTab
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.hero
import com.parkinggack.app.ui.theme.sized

/**
 * C-13 주차왕 (정차 중에만, 왼쪽 아이콘 메뉴로 들어옴). 왼쪽 = 이번 주 내 등수·점수 나눠 보기, 오른쪽 = 상위 5 + 내 앞뒤.
 * 순위판엔 닉네임·점수만 (장소·시간 없음). 참여 전이면 같은 자리에 참여 카드.
 */
@Composable
fun KingScreen(
    state: KingUi,
    onNavigate: (NavTab) -> Unit,
    onSettings: () -> Unit,
    onJoin: () -> Unit,
    onReroll: () -> Unit,
    onRetry: () -> Unit,
    /** 주차왕 그만두기 (DELETE /v1/me/king) — 차에서도 되돌릴 수 있게 (3-5) */
    onLeave: () -> Unit = {},
) {
    val c = ParkingTheme.colors
    // 왼쪽 메뉴는 C-01·C-09와 같은 SideNav (주행 중 C-04에서도 눌리지 않는 모드로 같이 쓰임)
    NavScaffold(NavTab.King, onNavigate, onSettings) {
        Box(Modifier.weight(1f).fillMaxHeight()) {
            Row(
                Modifier.fillMaxSize().padding(start = 32.dp, end = 32.dp, top = 24.dp, bottom = 30.dp),
                horizontalArrangement = Arrangement.spacedBy(32.dp),
            ) {
                when (state) {
                    is KingUi.Joined -> {
                        StandingCard(state.standing, onLeave, Modifier.width(460.dp).fillMaxHeight())
                        BoardList(state.standing, state.board, Modifier.weight(1f).fillMaxHeight())
                    }
                    is KingUi.NotJoined -> {
                        JoinCard(state, onJoin, onReroll, Modifier.width(460.dp).fillMaxHeight())
                        RulesCard(Modifier.weight(1f).fillMaxHeight())
                    }
                    KingUi.Loading -> CenterMessage("순위를 불러오고 있어요", null, null)
                    KingUi.Offline -> CenterMessage("인터넷에 연결되면 순위를 보여 드릴게요", "다시 시도", onRetry) // 카피에 '못'을 쓰지 않는다
                }
            }
            if ((state as? KingUi.Joined)?.board?.demo == true) {
                Text(
                    "순위는 시연용 예시예요",
                    style = ParkingTheme.type.caption,
                    color = c.lineStrong,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(end = 32.dp, bottom = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun StandingCard(s: KingStanding, onLeave: () -> Unit, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    var confirmLeave by rememberSaveable { mutableStateOf(false) }
    ParkingCard(modifier, border = CardBorder.Strong, radius = 16.dp, padding = PaddingValues(horizontal = 28.dp, vertical = 26.dp), spacing = 0.dp) {
        Box(Modifier.fillMaxWidth()) {
            ParkedCarArt(Modifier.align(Alignment.TopEnd).padding(top = 0.dp).size(width = 130.dp, height = 122.dp))
            Column {
                Text("이번 주", style = t.body.sized(20.sp, 1.3f), color = c.inkMuted)
                Text(
                    s.rank?.let { "${it}등" } ?: "–",
                    style = t.display.hero(104.sp, (-0.038).em),
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    "${s.leagueLabel} ${s.total}명 중" + (s.score?.let { " · ${it.total}점" } ?: ""),
                    style = t.body.sized(22.sp, 1.35f),
                    color = c.inkMuted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        Column(Modifier.padding(top = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val sc = s.score
            ScoreBar("후진·핸들", sc?.maneuver ?: 0, 70)
            ScoreBar("가 본 주차장", sc?.lotsVisited ?: 0, 15)
            ScoreBar("지난달보다 나아진 만큼", sc?.improvement ?: 0, 15)
        }
        Spacer(Modifier.weight(1f))
        KingCopy.movement(s)?.let { line ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (s.rank != null && s.prevWeekRank != null && s.prevWeekRank > s.rank) GlyphIcon(Glyph.ArrowUp, size = 26.dp, tint = c.ink)
                Text(line, style = t.heading.sized(22.sp, 1.35f))
            }
        }
        // 그만두기 — 한 번 더 확인 (순위판에서 바로 빠짐, 기록은 그대로, 다시 참여할 수 있음)
        Row(Modifier.padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (confirmLeave) {
                Text("순위판에서 빠질까요?", style = t.body.sized(18.sp, 1.3f), modifier = Modifier.weight(1f))
                PrimaryButton("그만두기", { confirmLeave = false; onLeave() }, height = 64.dp, fontSize = 18.sp)
                SecondaryButton("취소", { confirmLeave = false }, height = 64.dp, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            } else {
                SecondaryButton("주차왕 그만두기", { confirmLeave = true }, height = 64.dp, fontSize = 18.sp, fontWeight = FontWeight.Medium, transparent = true)
            }
        }
    }
}

@Composable
private fun ScoreBar(label: String, value: Int, max: Int) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(label, style = t.body.sized(18.sp, 1.3f), color = c.inkMuted, modifier = Modifier.weight(1f))
            Text("$value", style = t.body.sized(18.sp, 1.3f, FontWeight.Bold))
            Text(" / $max", style = t.body.sized(18.sp, 1.3f), color = c.inkMuted)
        }
        Canvas(Modifier.fillMaxWidth().height(10.dp)) {
            val r = CornerRadius(size.height / 2)
            drawRoundRect(c.surface, cornerRadius = r)
            val f = (value.toFloat() / max).coerceIn(0f, 1f)
            if (f > 0f) drawRoundRect(c.ink, size = Size(size.width * f, size.height), cornerRadius = r)
        }
    }
}

/** 카드 오른쪽 위 그림: 주차 칸 선 + 위에서 본 차 (시안 C-13) */
@Composable
private fun ParkedCarArt(modifier: Modifier) {
    val c = ParkingTheme.colors
    Canvas(modifier) {
        val s = size.width / 130f
        val line = c.line
        listOf(0f, 62f, 124f).forEach { x -> drawLine(line, Offset(x * s, 0f), Offset(x * s, 120f * s), strokeWidth = 2.5f * s, cap = StrokeCap.Round) }
        drawLine(line, Offset(0f, 120f * s), Offset(130f * s, 120f * s), strokeWidth = 2.5f * s, cap = StrokeCap.Round)
        val cx = 31f * s; val cy = 56f * s
        rotate(0f, Offset(cx, cy)) {
            drawRoundRect(c.ink, Offset(cx - 17f * s, cy - 32f * s), Size(34f * s, 64f * s), CornerRadius(10f * s))
            drawRoundRect(c.surface.copy(alpha = 0.85f), Offset(cx - 12.5f * s, cy - 19f * s), Size(25f * s, 11f * s), CornerRadius(3f * s))
            drawRoundRect(c.surface.copy(alpha = 0.6f), Offset(cx - 11f * s, cy + 18f * s), Size(22f * s, 7f * s), CornerRadius(2f * s))
        }
    }
}

@Composable
private fun BoardList(s: KingStanding, board: KingBoard?, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().height(44.dp).padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${s.leagueLabel} · 이번 주 점수 순", style = t.body.sized(18.sp, 1.3f), color = c.inkMuted, modifier = Modifier.weight(1f))
            Text("월요일에 다시 시작해요", style = t.body.sized(18.sp, 1.3f), color = c.inkMuted)
        }
        if (board == null) {
            Text("순위판을 불러오고 있어요", style = t.body, color = c.inkMuted)
            return@Column
        }
        board.top.forEach { BoardRow(it) }
        if (board.around.isNotEmpty()) {
            Text(
                "···",
                style = t.body.sized(18.sp, 1.1f),
                color = c.lineStrong,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().height(20.dp),
            )
            board.around.forEach { BoardRow(it) }
        }
    }
}

@Composable
private fun BoardRow(r: KingRow) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val bg = if (r.isMe) c.inverse else c.surfaceRaised
    val fg = if (r.isMe) c.onInverse else c.ink
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 54.dp)
            .clip(shape)
            .background(bg)
            .then(if (r.isMe) Modifier else Modifier.cardStroke(c.line))
            .padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Text("${r.rank}", style = t.heading.sized(22.sp, 1.2f), color = fg, textAlign = TextAlign.End, modifier = Modifier.width(34.dp))
        Text(
            r.nickname,
            style = t.heading.sized(22.sp, 1.2f, if (r.rank <= 3 || r.isMe) FontWeight.Bold else FontWeight.Medium),
            color = fg,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (r.rank == 1) GlyphIcon(Glyph.Crown, size = 26.dp, tint = fg)
        if (r.isMe) {
            Box(
                Modifier.height(30.dp).clip(RoundedCornerShape(8.dp)).background(c.onInverse).padding(horizontal = 10.dp),
                contentAlignment = Alignment.Center,
            ) { Text("나", style = t.label.sized(16.sp, 1.2f), color = c.inverse) }
        }
        Text("${r.score}점", style = t.heading.sized(22.sp, 1.2f), color = fg)
    }
}

private fun Modifier.cardStroke(color: androidx.compose.ui.graphics.Color) =
    this.then(Modifier.border(1.5.dp, color, RoundedCornerShape(14.dp)))

@Composable
private fun JoinCard(s: KingUi.NotJoined, onJoin: () -> Unit, onReroll: () -> Unit, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    ParkingCard(modifier, border = CardBorder.Strong, radius = 16.dp, padding = PaddingValues(horizontal = 28.dp, vertical = 26.dp), spacing = 12.dp) {
        Text("주차왕에 참여할까요?", style = t.title.sized(32.sp, 1.3f))
        Text("같은 경력, 같은 동네 사람들끼리 겨뤄요", style = t.body, color = c.inkMuted)
        Spacer(Modifier.height(8.dp))
        Text("닉네임", style = t.label, color = c.inkMuted)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(s.nickname, style = t.heading.sized(26.sp, 1.3f), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            SecondaryButton("다시 뽑기", onReroll, height = 64.dp, fontSize = 18.sp, horizontalPadding = 18.dp)
        }
        Text("내 리그", style = t.label, color = c.inkMuted, modifier = Modifier.padding(top = 8.dp))
        Text(s.leagueLabel, style = t.heading.sized(24.sp, 1.3f))
        Spacer(Modifier.weight(1f))
        PrimaryButton(if (s.joining) "참여하는 중이에요" else "참여할게요", onJoin, Modifier.fillMaxWidth())
    }
}

@Composable
private fun RulesCard(modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    ParkingCard(modifier, padding = PaddingValues(horizontal = 28.dp, vertical = 26.dp), spacing = 14.dp) {
        Text("점수는 이렇게 매겨요", style = t.heading)
        RuleLine("후진·핸들", "70점")
        RuleLine("가 본 주차장", "15점")
        RuleLine("지난달보다 나아진 만큼", "15점")
        Spacer(Modifier.height(6.dp))
        Text("빠르기는 점수에 넣지 않아요. 주차장 안에서 시속 10km를 넘으면 그 주차는 빠져요", style = t.body.sized(19.sp, 1.45f), color = c.inkMuted)
        Text("순위판에는 닉네임과 점수만 보여요. 장소와 시간은 보이지 않아요", style = t.body.sized(19.sp, 1.45f), color = c.inkMuted)
        Text("매주 월요일에 다시 시작해요", style = t.body.sized(19.sp, 1.45f), color = c.inkMuted)
    }
}

@Composable
private fun RuleLine(label: String, value: String) {
    val t = ParkingTheme.type
    Row(Modifier.fillMaxWidth()) {
        Text(label, style = t.body.sized(20.sp, 1.35f), modifier = Modifier.weight(1f))
        Text(value, style = t.body.sized(20.sp, 1.35f, FontWeight.Bold))
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.CenterMessage(title: String, action: String?, onAction: (() -> Unit)?) {
    val t = ParkingTheme.type
    Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = t.title)
        if (action != null && onAction != null) {
            Spacer(Modifier.height(20.dp))
            PrimaryButton(action, onAction, Modifier.width(320.dp))
        }
    }
}
