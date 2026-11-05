package com.parkinggack.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.session.PhoneLinkState
import com.parkinggack.app.ui.components.AppHeader
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.QrCode
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.cssLineBox
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized
import kotlinx.coroutines.delay

/**
 * 폰 연결 화면 (C-10 설정 › 폰 연결, 시안 없음). 폰 앱 M-13 "차 화면의 QR을 찍어주세요 / 코드로 연결할게요"의 짝.
 * QR = `${web}/pair/${code}`, 숫자 6자리 코드는 손으로 입력하는 경우. 키보드 없음, 정차 중 화면.
 * 시안이 없어 C-07과 같은 배치·문구 톤으로 만듦.
 */
@Composable
fun PhoneLinkScreen(
    state: PhoneLinkState,
    onRetry: () -> Unit,
    onClose: () -> Unit,
    /** 남은 시간 계산용 (테스트·미리보기에서 고정) */
    nowMs: () -> Long = System::currentTimeMillis,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(Modifier.fillMaxSize().background(c.surface)) {
        AppHeader(title = "폰 연결", onBack = onClose)
        Row(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 48.dp, vertical = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(40.dp),
        ) {
            // 왼쪽: QR 카드
            ParkingCard(
                Modifier.fillMaxHeight().aspectRatio(0.86f, matchHeightConstraintsFirst = true),
                border = if (state is PhoneLinkState.Ready) CardBorder.Strong else CardBorder.Subtle,
                padding = PaddingValues(24.dp),
                spacing = 14.dp,
            ) {
                when (state) {
                    is PhoneLinkState.Ready -> {
                        QrCode(state.url, Modifier.sizeIn(maxWidth = 360.dp, maxHeight = 360.dp).aspectRatio(1f).align(Alignment.CenterHorizontally))
                        Text("폰 카메라나 주차각 앱으로 찍어 주세요", style = t.body.sized(17.sp, 1.3f), color = c.inkMuted, modifier = Modifier.align(Alignment.CenterHorizontally))
                    }
                    is PhoneLinkState.Linked -> CenterNote("연결됐어요", "이제 주차를 마치면 폰에 바로 보여요")
                    PhoneLinkState.Loading -> CenterNote("코드를 만들고 있어요", null)
                    PhoneLinkState.Expired -> CenterNote("코드가 만료됐어요", "새 코드를 만들어 주세요")
                    PhoneLinkState.Offline -> CenterNote("인터넷에 연결되면 코드를 만들게요", "연결된 뒤 다시 시도해 주세요")
                }
            }
            // 오른쪽: 안내 + 숫자 코드 + 버튼
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                when (state) {
                    is PhoneLinkState.Ready -> {
                        val guide = t.title.sized(34.sp, 1.35f)
                        Text("폰의 주차각 앱에서\nQR을 찍어 주세요", style = guide, modifier = Modifier.cssLineBox(guide))
                        Text("또는 '코드로 연결할게요'를 누르고 아래 숫자를 넣어 주세요", style = t.body, color = c.inkMuted)
                        Spacer(Modifier.size(8.dp))
                        Text(
                            state.code.chunked(3).joinToString(" "),
                            style = t.display.copy(fontFamily = FontFamily.Monospace, fontSize = 88.sp, lineHeight = 96.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp),
                        )
                        Countdown(state.expiresAtMs, nowMs)
                        Spacer(Modifier.weight(1f))
                        SecondaryButton("닫기", onClose, Modifier.fillMaxWidth(), height = 72.dp, transparent = true)
                    }
                    is PhoneLinkState.Linked -> {
                        val title = t.title.sized(40.sp, 1.3f)
                        Text("폰과 연결됐어요", style = title, modifier = Modifier.cssLineBox(title))
                        state.phoneName?.let { Text(it, style = t.heading, color = c.inkMuted) }
                        Text("주차 위치와 동선이 연결된 폰에만 보여요. 연결은 설정에서 끊을 수 있어요", style = t.body, color = c.inkMuted)
                        Spacer(Modifier.weight(1f))
                        PrimaryButton("확인", onClose, Modifier.fillMaxWidth())
                    }
                    PhoneLinkState.Loading -> {
                        Text("잠시만요", style = t.title)
                        Spacer(Modifier.weight(1f))
                        SecondaryButton("닫기", onClose, Modifier.fillMaxWidth(), height = 72.dp, transparent = true)
                    }
                    PhoneLinkState.Expired, PhoneLinkState.Offline -> {
                        Text(if (state == PhoneLinkState.Expired) "코드는 10분 동안만 쓸 수 있어요" else "지금은 서버에 닿지 않아요", style = t.title.sized(30.sp, 1.35f))
                        Spacer(Modifier.weight(1f))
                        PrimaryButton(if (state == PhoneLinkState.Expired) "새 코드 만들기" else "다시 시도", onRetry, Modifier.fillMaxWidth())
                        SecondaryButton("닫기", onClose, Modifier.fillMaxWidth(), height = 72.dp, transparent = true)
                    }
                }
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.ColumnScope.CenterNote(title: String, body: String?) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Spacer(Modifier.weight(1f))
    Text(title, style = t.heading.sized(26.sp, 1.35f), modifier = Modifier.align(Alignment.CenterHorizontally))
    body?.let { Text(it, style = t.body, color = c.inkMuted, modifier = Modifier.align(Alignment.CenterHorizontally)) }
    Spacer(Modifier.weight(1f))
}

@Composable
private fun Countdown(expiresAtMs: Long, nowMs: () -> Long) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    var now by remember { mutableLongStateOf(nowMs()) }
    LaunchedEffect(expiresAtMs) { while (true) { now = nowMs(); delay(1_000) } }
    val left = ((expiresAtMs - now) / 1000).coerceAtLeast(0)
    Text("${left / 60}분 ${"%02d".format(left % 60)}초 남았어요", style = t.body.sized(18.sp, 1.35f), color = c.inkMuted)
}

@CarPreview
@Composable
private fun PhoneLinkPreview() = PreviewFrame {
    PhoneLinkScreen(PhoneLinkState.Ready("483920", "https://parkinggack.vercel.app/pair/483920", 0L + 9 * 60_000 + 12_000), {}, {}, nowMs = { 0L })
}
