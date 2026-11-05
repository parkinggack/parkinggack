package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.bumpOn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ZoneScheme
import com.parkinggack.app.ui.components.AppHeader
import com.parkinggack.app.ui.components.ChoiceButton
import com.parkinggack.app.ui.components.FitText
import com.parkinggack.app.ui.components.Glyph
import com.parkinggack.app.ui.components.GlyphIcon
import com.parkinggack.app.ui.components.PendingButton
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.dashedBorder
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.hero
import com.parkinggack.app.ui.theme.sized

/**
 * C-06 층·구역 빠른 선택. 키보드 없이 큰 버튼 그리드만 (층 한 줄, 구역 한 줄, 기둥 번호 3×4).
 * 선택 상태는 화면 안에서만 들고 있다가 '저장'에서 넘긴다. 구역·번호는 한 번 더 누르면 해제.
 */
@Composable
fun ZonePickerScreen(
    lotName: String,
    floors: List<String>,
    scheme: ZoneScheme,
    initialFloor: String?,
    initialZone: String?,
    initialNumber: String?,
    onSave: (floor: String, zone: String?, number: String?) -> Unit,
    onBack: () -> Unit,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    var floor by rememberSaveable { mutableStateOf(initialFloor) }
    var zone by rememberSaveable { mutableStateOf(initialZone) }
    var number by rememberSaveable { mutableStateOf(initialNumber) }
    val orderedFloors = remember(floors, initialFloor) {
        val withInitial = if (initialFloor != null && initialFloor !in floors) floors + initialFloor else floors
        floorsBottomUp(withInitial)
    }

    val summary = buildString {
        append(floor ?: "층 미선택")
        if (zone != null) {
            append(" · "); append(zone)
            if (number != null) { append("-"); append(number) }
        } else if (number != null) {
            append(" · "); append(number)
        }
    }

    Column(Modifier.fillMaxSize().background(c.surface)) {
        AppHeader(title = "주차 위치 기억하기", onBack = onBack) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("저장될 위치", style = t.label.sized(16.sp, 1.3f, FontWeight.Normal), color = c.inkMuted)
                Box(
                    Modifier
                        .bumpOn(summary) // 고른 값이 바뀔 때마다 톡
                        .height(52.dp)
                        .parkingBorder(2.dp, if (floor != null) c.ink else c.lineStrong, 14.dp, dashed = floor == null)
                        .padding(horizontal = 20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(summary, style = t.display.sized(if (floor != null) 28.sp else 20.sp, 1.2f), maxLines = 1)
                }
            }
        }
        // 시안은 세로 587dp. Pleos 창처럼 넉넉하면 버튼을 키우고 왼쪽 아래에 '저장될 위치'를 크게 보여 준다
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
        val roomy = maxHeight >= 720.dp
        val btnH = if (roomy) 104.dp else 80.dp
        val btnF = if (roomy) 32.sp else 28.sp
        Row(
            Modifier.fillMaxSize().padding(horizontal = 32.dp, vertical = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            Column(
                Modifier.weight(764f).fillMaxHeight().then(if (roomy) Modifier else Modifier.verticalScroll(rememberScrollState())),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                ChoiceGrid("층", orderedFloors, columns = maxOf(7, minOf(orderedFloors.size, 9)), selected = floor, height = btnH, fontSize = btnF) {
                    floor = it
                }
                ChoiceGrid("구역", scheme.zones, columns = 8, selected = zone, height = btnH, fontSize = btnF) {
                    zone = if (zone == it) null else it
                }
                if (scheme.description != null) {
                    Row(
                        Modifier.fillMaxWidth().dashedBorder(1.5.dp, c.lineStrong, 16.dp).padding(horizontal = 20.dp, vertical = 18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        GlyphIcon(Glyph.Zone, size = 28.dp)
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("$lotName 구역 체계", style = t.label.sized(18.sp, 1.3f))
                            Text(scheme.description, style = t.label.sized(16.sp, 1.35f, FontWeight.Normal), color = c.inkMuted)
                        }
                    }
                }
                if (roomy) {
                    Spacer(Modifier.weight(1f))
                    SavedPreview(summary, lotName, picked = floor != null)
                }
            }
            Column(Modifier.weight(420f).fillMaxHeight(), verticalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f, fill = false).padding(bottom = 16.dp).verticalScroll(rememberScrollState())) {
                    ChoiceGrid("기둥 번호", scheme.numbers, columns = 3, selected = number, height = if (roomy) 92.dp else 72.dp, fontSize = if (roomy) 30.sp else 26.sp) {
                        number = if (number == it) null else it
                    }
                }
                val f = floor
                if (f != null) {
                    PrimaryButton("저장", { onSave(f, zone, number) }, Modifier.fillMaxWidth(), height = if (roomy) 100.dp else 80.dp, fontSize = if (roomy) 30.sp else 26.sp)
                } else {
                    PendingButton("층을 먼저 골라 주세요", Modifier.fillMaxWidth(), height = if (roomy) 100.dp else 80.dp)
                }
            }
        }
        }
    }
}

/** 넉넉한 화면에서만: 고른 위치를 크게 (머리의 '저장될 위치' 칩과 같은 값) */
@Composable
private fun SavedPreview(summary: String, lotName: String, picked: Boolean) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, if (picked) c.lineStrong else c.line, 16.dp, dashed = !picked)
            .padding(horizontal = 28.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("저장될 위치", style = t.label.sized(18.sp, 1.3f), color = c.inkMuted)
        FitText(
            text = summary,
            style = t.display.hero(if (picked) 96.sp else 40.sp, (-0.02).em),
            modifier = Modifier.fillMaxWidth().bumpOn(summary),
            minSize = 40.sp,
            color = if (picked) c.ink else c.inkMuted,
        )
        Text(lotName, style = t.heading.sized(22.sp, 1.3f), color = c.inkMuted, maxLines = 1)
    }
}

/** 라벨 + 큰 버튼 격자 */
@Composable
private fun ChoiceGrid(
    label: String,
    items: List<String>,
    columns: Int,
    selected: String?,
    height: Dp,
    fontSize: TextUnit,
    onPick: (String) -> Unit,
) {
    val c = ParkingTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, style = ParkingTheme.type.label.sized(18.sp, 1.3f), color = c.inkMuted)
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { item ->
                        ChoiceButton(item, item == selected, { onPick(item) }, Modifier.weight(1f), height = height, fontSize = fontSize)
                    }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@CarPreview
@Composable
private fun ZonePickerPreview() = PreviewFrame {
    ZonePickerScreen(
        lotName = PreviewData.avenuefrance.name,
        floors = PreviewData.avenuefrance.floors,
        scheme = PreviewData.avenuefrance.zoneScheme,
        initialFloor = "B2", initialZone = "D", initialNumber = "07",
        onSave = { _, _, _ -> }, onBack = {},
    )
}

@CarPreviewLight
@Composable
private fun ZonePickerEmptyLightPreview() = PreviewFrame(dark = false) {
    ZonePickerScreen(
        lotName = PreviewData.hyundai.name,
        floors = PreviewData.hyundai.floors,
        scheme = PreviewData.hyundai.zoneScheme,
        initialFloor = null, initialZone = null, initialNumber = null,
        onSave = { _, _, _ -> }, onBack = {},
    )
}
