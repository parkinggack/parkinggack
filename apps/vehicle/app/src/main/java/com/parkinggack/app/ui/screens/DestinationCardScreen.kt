package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.popIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.ui.components.BadgeStyle
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.ChipItemView
import com.parkinggack.app.ui.components.DifficultyBadge
import com.parkinggack.app.ui.components.DifficultyTone
import com.parkinggack.app.ui.components.Glyph
import com.parkinggack.app.ui.components.IconSquareButton
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.cssLineBox
import com.parkinggack.app.ui.components.interleaveChips
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.components.toneOf
import com.parkinggack.app.ui.components.CarPosition
import com.parkinggack.app.ui.components.LiveMap
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/**
 * C-02 도착지 난이도 카드 (+ 상태 3종: 어려움 ★4↑ / 쉬움 ★1~2 '좋아요'만 / 데이터 부족 점선).
 * Pleos 기본 내비 지도는 넣을 수 없어서 바탕은 앱 안 지도([LiveMap], 목적지 주차장 표시).
 * 스냅숏·미리보기에서는 간단한 경로 그림([NaviMapPlaceholder]).
 */
@Composable
fun DestinationCardScreen(
    destinationName: String,
    lot: ParkingLot,
    onShowEasier: () -> Unit,
    onDismiss: () -> Unit,
    car: CarPosition? = null,
) {
    val c = ParkingTheme.colors
    Box(Modifier.fillMaxSize().background(c.surface)) {
        LiveMap(car = car, destination = lot.location, modifier = Modifier.fillMaxSize()) {
            NaviMapPlaceholder(destinationName, Modifier.fillMaxSize())
        }
        DestinationCard(
            lot, onShowEasier, onDismiss,
            Modifier
                .popIn(0, fromY = 40.dp)
                .padding(start = 24.dp, top = 24.dp, bottom = 24.dp)
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .fillMaxHeight(),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DestinationCard(lot: ParkingLot, onShowEasier: () -> Unit, onDismiss: () -> Unit, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val tone = toneOf(lot.difficulty, lot.hasEnoughData)
    ParkingCard(
        modifier,
        border = if (tone == DifficultyTone.NO_DATA) CardBorder.Dashed else CardBorder.Strong,
        padding = PaddingValues(28.dp),
        spacing = 14.dp,
    ) {
        // 시안의 닫기 칸은 52px. 누르는 칸은 차 화면 규칙대로 64dp를 지키되, 줄 높이는 시안대로 52로 둬서
        // 아래 내용이 밀리지 않게 한다 (버튼은 위아래로 6dp씩 여백에 걸친다).
        Row(Modifier.fillMaxWidth().height(52.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("도착지 주차장", style = t.body.sized(18.sp, 1.3f, FontWeight.Medium), color = c.inkMuted, modifier = Modifier.weight(1f))
            IconSquareButton(Glyph.Close, "닫기", onDismiss, Modifier.requiredSize(64.dp), filled = false)
        }

        DifficultyBadge(if (tone == DifficultyTone.NO_DATA) null else lot.difficulty, style = BadgeStyle.Hero)

        if (tone == DifficultyTone.NO_DATA) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val titleStyle = t.title.sized(28.sp, 1.3f)
                Text("아직 기록이 적어요 (${lot.sampleCount}대)", style = titleStyle, modifier = Modifier.cssLineBox(titleStyle))
                Text("첫 기록을 남겨 주세요", style = t.body, color = c.inkMuted)
                Text(lot.name, style = t.body.sized(18.sp, 1.35f), color = c.inkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (lot.publicInfo.isNotEmpty()) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("공공데이터 기본 정보", style = t.caption.copy(fontWeight = FontWeight.Bold), color = c.inkMuted)
                    lot.publicInfo.forEach { Text(it, style = t.body.sized(16.sp, 1.4f)) }
                }
            }
            Spacer(Modifier.weight(1f))
            PrimaryButton("알겠어요", onDismiss, Modifier.fillMaxWidth(), fontSize = 24.sp)
        } else {
            RatedCardBody(lot, tone, onShowEasier, onDismiss)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.RatedCardBody(lot: ParkingLot, tone: DifficultyTone, onShowEasier: () -> Unit, onDismiss: () -> Unit) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val title = when (tone) {
        DifficultyTone.HARD -> "도착지 주차장은 조금 까다로워요"
        DifficultyTone.EASY -> "주차하기 편한 곳이에요"
        else -> "주차 난이도는 보통이에요"
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val titleStyle = t.title.sized(28.sp, 1.3f)
        Text(title, style = titleStyle, modifier = Modifier.cssLineBox(titleStyle))
        Text(lot.name, style = t.body, color = c.inkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    val chips = interleaveChips(lot.tags, lot.statChips, 3)
    if (chips.isNotEmpty()) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            chips.forEach { ChipItemView(it) }
        }
    }
    Text("최근 30일 · 차량 ${lot.sampleCount}대 기준", style = t.label.sized(16.sp, 1.35f, FontWeight.Normal), color = c.inkMuted)
    Spacer(Modifier.weight(1f))
    if (tone == DifficultyTone.EASY) {
        PrimaryButton("좋아요", onDismiss, Modifier.fillMaxWidth(), fontSize = 24.sp)
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PrimaryButton("더 쉬운 곳 보기", onShowEasier, Modifier.fillMaxWidth(), fontSize = 24.sp)
            SecondaryButton(
                "괜찮아요, 그냥 갈게요", onDismiss, Modifier.fillMaxWidth(),
                height = 64.dp, fontSize = 20.sp, fontWeight = FontWeight.Medium, transparent = true,
            )
        }
    }
}

/**
 * 내비 지도 자리 표시. 실제 앱에서는 Pleos 기본 내비 지도가 이 자리에 온다.
 * 차분한 바탕 + 도로 몇 줄 + 목적지까지 경로 + 목적지 이름표. 카드에 가리지 않게 오른쪽에 그린다.
 */
@Composable
internal fun NaviMapPlaceholder(destinationName: String?, modifier: Modifier = Modifier, caption: String = "내비 지도 · 경로 (Pleos 기본 내비)") {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    BoxWithConstraints(modifier.background(c.placeholder)) {
        val w = maxWidth
        val h = maxHeight
        Canvas(Modifier.fillMaxSize().clearAndSetSemantics { }) {
            val W = size.width
            val H = size.height
            fun p(x: Float, y: Float) = Offset(W * x, H * y)
            // 큰 길 (띠)
            val main = Path().apply {
                moveTo(-20f, H * 0.74f)
                cubicTo(W * 0.3f, H * 0.70f, W * 0.55f, H * 0.76f, W * 0.8f, H * 0.66f)
                cubicTo(W * 0.9f, H * 0.62f, W * 0.97f, H * 0.6f, W + 20f, H * 0.62f)
            }
            drawPath(main, c.surfaceRaised, style = Stroke(28.dp.toPx(), cap = StrokeCap.Round))
            drawPath(main, c.line, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round))
            // 작은 길
            listOf(
                listOf(p(0.62f, -0.05f), p(0.66f, 0.4f), p(0.70f, 1.05f)),
                listOf(p(0.88f, -0.05f), p(0.86f, 0.5f), p(0.9f, 1.05f)),
                listOf(p(0.5f, 0.2f), p(0.75f, 0.24f), p(1.05f, 0.22f)),
                listOf(p(0.55f, 0.45f), p(0.8f, 0.47f), p(1.05f, 0.44f)),
            ).forEach { pts ->
                val road = Path().apply {
                    moveTo(pts[0].x, pts[0].y)
                    quadraticTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y)
                }
                drawPath(road, c.surfaceRaised, style = Stroke(12.dp.toPx(), cap = StrokeCap.Round))
            }
            // 경로 (테두리 + 선)
            val route = Path().apply {
                moveTo(W * 0.762f, H + 20f)
                lineTo(W * 0.751f, H * 0.62f)
                lineTo(W * 0.735f, H * 0.45f)
                lineTo(W * 0.781f, H * 0.45f)
                lineTo(W * 0.781f, H * 0.38f)
            }
            drawPath(route, c.surface, style = Stroke(16.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawPath(route, c.ink, style = Stroke(8.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            // 목적지
            val dest = p(0.781f, 0.317f)
            drawCircle(c.ink, 24.dp.toPx(), dest)
            drawCircle(c.surfaceRaised, 9.dp.toPx(), dest)
        }
        if (destinationName != null) {
            Text(
                destinationName,
                style = t.label.sized(16.sp, 1.3f, FontWeight.Medium),
                maxLines = 1,
                modifier = Modifier
                    .offset(x = w * 0.812f, y = h * 0.29f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(c.surfaceRaised)
                    .parkingBorder(1.dp, c.line, 8.dp)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        Text(
            caption,
            style = t.caption,
            color = c.inkMuted,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(24.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(c.surfaceRaised)
                .parkingBorder(1.dp, c.line, 8.dp)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

@CarPreview
@Composable
private fun DestinationHardPreview() = PreviewFrame {
    DestinationCardScreen("현대백화점 판교점", PreviewData.hyundai, onShowEasier = {}, onDismiss = {})
}

@CarPreview
@Composable
private fun DestinationEasyPreview() = PreviewFrame {
    DestinationCardScreen("아브뉴프랑 판교", PreviewData.avenuefrance, onShowEasier = {}, onDismiss = {})
}

@CarPreview
@Composable
private fun DestinationSparsePreview() = PreviewFrame {
    DestinationCardScreen("판교테크원", PreviewData.sparseLot, onShowEasier = {}, onDismiss = {})
}

@CarPreviewLight
@Composable
private fun DestinationHardLightPreview() = PreviewFrame(dark = false) {
    DestinationCardScreen("현대백화점 판교점", PreviewData.hyundai, onShowEasier = {}, onDismiss = {})
}
