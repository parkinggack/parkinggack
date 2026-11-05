package com.parkinggack.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.CardTiming
import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.UserSettings
import com.parkinggack.app.ui.components.ChoiceButton
import com.parkinggack.app.ui.components.Glyph
import com.parkinggack.app.ui.components.IconSquareButton
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.ToggleVisual
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized

/** 시안 순서의 운전 경력 4칸 ('말하지 않을게요'는 아무것도 고르지 않은 상태) */
internal val EXPERIENCE_OPTIONS = listOf(
    DrivingExperience.UNDER_1Y, DrivingExperience.Y1_3, DrivingExperience.Y3_10, DrivingExperience.OVER_10Y,
)

/** C-10 도착지 난이도 카드 표시 시점: 시안 순서 '항상 / 어려운 곳만 / 끄기' */
internal val CARD_TIMING_OPTIONS = listOf(
    CardTiming.ALWAYS to "항상",
    CardTiming.HARD_ONLY to "어려운 곳만",
    CardTiming.NEVER to "끄기",
)

private enum class ClearState { Idle, Confirming, Done }

/**
 * C-10 설정. 변경은 바로 [onChange]로 넘긴다 (저장 버튼 없음).
 * '기록 모두 지우기'는 시스템 팝업 없이 화면 안에서 한 번 더 확인.
 */
@Composable
fun SettingsScreen(
    settings: UserSettings,
    vehicleName: String,
    onChange: (UserSettings) -> Unit,
    onClearAll: () -> Unit,
    onBack: () -> Unit,
    /** 폰 연결 상태 문구 ("연결됨 · 갤럭시 S25" / "아직 연결 안 됨") */
    phoneLinkLabel: String = "아직 연결 안 됨",
    /** 폰 연결 화면(QR·코드) 열기 */
    onOpenPhoneLink: () -> Unit = {},
    /** 폰과 연결돼 있음 → '연결 끊기'를 보여 줌 */
    phonePaired: Boolean = false,
    /** 연결된 폰 모두 끊기 (서버 DELETE /v1/me). 결과를 콜백으로 */
    onUnlinkPhone: ((Boolean) -> Unit) -> Unit = {},
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    var clear by rememberSaveable { mutableStateOf(ClearState.Idle) }
    var unlink by rememberSaveable { mutableStateOf(ClearState.Idle) }

    Column(
        Modifier.fillMaxSize().background(c.surface).padding(start = 48.dp, end = 48.dp, top = 24.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            IconSquareButton(Glyph.Back, "홈으로", onBack)
            Text("설정", style = t.title.sized(30.sp, 1.25f))
        }
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                ToggleCard(
                    "익명 주차 기록 보내기",
                    "누가 어디에 댔는지는 아무도 알 수 없어요. 난이도 점수에만 쓰여요",
                    settings.shareAnonymous,
                    { onChange(settings.copy(shareAnonymous = it)) },
                    Modifier.weight(1f).fillMaxHeight(),
                )
                ToggleCard(
                    "주차 완료 카드",
                    "P를 넣으면 층 확인과 오늘 주차 요약을 보여 줘요",
                    settings.showParkedCard,
                    { onChange(settings.copy(showParkedCard = it)) },
                    Modifier.weight(1f).fillMaxHeight(),
                )
            }
            SegmentCard("운전 경력", "추천 기준을 맞추는 데만 써요") {
                EXPERIENCE_OPTIONS.forEach { e ->
                    ChoiceButton(
                        e.label, settings.experience == e,
                        { onChange(settings.copy(experience = if (settings.experience == e) DrivingExperience.UNKNOWN else e)) },
                        Modifier.weight(1f), height = 64.dp, fontSize = 19.sp,
                    )
                }
            }
            SegmentCard("도착지 난이도 카드", "목적지를 정하면 언제 보여 줄까요") {
                CARD_TIMING_OPTIONS.forEach { (timing, label) ->
                    ChoiceButton(
                        label, settings.cardTiming == timing,
                        { onChange(settings.copy(cardTiming = timing)) },
                        Modifier.weight(1f), height = 64.dp, fontSize = 19.sp,
                    )
                }
            }
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                SettingCard(Modifier.weight(1f).fillMaxHeight()) {
                    if (unlink == ClearState.Confirming) {
                        // 폰 없이 차만 쓰는 사람도 연결을 되돌릴 수 있게 (3-5). 시스템 팝업 없이 화면 안에서 한 번 더 확인
                        Text("연결된 폰을 모두 끊을까요?", style = t.heading.sized(20.sp, 1.35f))
                        Text("내 주차 기록은 차에 그대로 남아요", style = t.label.sized(16.sp, 1.45f, FontWeight.Normal), color = c.inkMuted)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PrimaryButton("끊기", { onUnlinkPhone { ok -> unlink = if (ok) ClearState.Done else ClearState.Idle } }, height = 64.dp, fontSize = 18.sp)
                            SecondaryButton("취소", { unlink = ClearState.Idle }, height = 64.dp, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                        }
                    } else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("내 차", style = t.heading)
                            Text(vehicleName, style = t.body.sized(18.sp, 1.35f, FontWeight.Medium))
                            Text(
                                if (unlink == ClearState.Done && !phonePaired) "폰 연결을 끊었어요" else "폰 연결 · $phoneLinkLabel",
                                style = t.label.sized(16.sp, 1.45f, FontWeight.Normal), color = c.inkMuted,
                            )
                        }
                        SecondaryButton("폰 연결", onOpenPhoneLink, height = 64.dp, fontSize = 18.sp, horizontalPadding = 20.dp)
                        if (phonePaired) {
                            SecondaryButton("연결 끊기", { unlink = ClearState.Confirming }, height = 64.dp, fontSize = 18.sp, fontWeight = FontWeight.Medium, horizontalPadding = 20.dp)
                        }
                    }
                }
                SettingCard(Modifier.weight(1f).fillMaxHeight()) {
                    when (clear) {
                        ClearState.Confirming -> {
                            Text("지운 기록은 되돌릴 수 없어요", style = t.heading.sized(20.sp, 1.35f))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PrimaryButton("지우기", { onClearAll(); clear = ClearState.Done }, height = 64.dp, fontSize = 18.sp)
                                SecondaryButton("취소", { clear = ClearState.Idle }, height = 64.dp, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                        else -> {
                            Text("내 주차 기록", style = t.heading)
                            SecondaryButton(
                                "기록 모두 지우기", { clear = ClearState.Confirming },
                                height = 64.dp, fontSize = 18.sp, fontWeight = FontWeight.Medium,
                            )
                            if (clear == ClearState.Done) {
                                Text("기록을 지웠어요", style = t.label.sized(16.sp, 1.3f, FontWeight.Normal), color = c.inkMuted)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingCard(modifier: Modifier, content: @Composable () -> Unit) {
    val c = ParkingTheme.colors
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, c.line, 12.dp)
            .padding(horizontal = 22.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

/** 행 전체를 누르면 켜고 끈다 (토글 모양만으로는 64dp가 안 되므로). */
@Composable
private fun ToggleCard(title: String, desc: String, checked: Boolean, onToggle: (Boolean) -> Unit, modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Row(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, c.line, 12.dp)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onToggle)
            .padding(horizontal = 22.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = t.heading)
            Text(desc, style = t.label.sized(16.sp, 1.45f, FontWeight.Normal), color = c.inkMuted)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            ToggleVisual(checked)
            Text(if (checked) "켜짐" else "꺼짐", style = t.caption.copy(fontWeight = FontWeight.Bold), color = c.inkMuted)
        }
    }
}

@Composable
private fun SegmentCard(title: String, desc: String, options: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(c.surfaceRaised)
            .parkingBorder(1.5.dp, c.line, 12.dp)
            .padding(horizontal = 22.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Column(Modifier.width(300.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = t.heading)
            Text(desc, style = t.label.sized(16.sp, 1.45f, FontWeight.Normal), color = c.inkMuted)
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp), content = options)
    }
}

@CarPreview
@Composable
private fun SettingsPreview() = PreviewFrame {
    SettingsScreen(PreviewData.settings, "그랜저 · 자동 인식", onChange = {}, onClearAll = {}, onBack = {})
}

@CarPreviewLight
@Composable
private fun SettingsLightPreview() = PreviewFrame(dark = false) {
    SettingsScreen(PreviewData.settings.copy(shareAnonymous = false), "그랜저 · 자동 인식", onChange = {}, onClearAll = {}, onBack = {})
}
