package com.parkinggack.app.ui.screens

import com.parkinggack.app.ui.components.popIn
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
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.ui.components.AppHeader
import com.parkinggack.app.ui.components.CardBorder
import com.parkinggack.app.ui.components.FitText
import com.parkinggack.app.ui.components.NoteChip
import com.parkinggack.app.ui.components.ParkingCard
import com.parkinggack.app.ui.components.QrCode
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.cssLineBox
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.hero
import com.parkinggack.app.ui.theme.sized

/** C-07 폰으로 보내기: [url]로 만든 QR + 짧은 링크 + 저장된 위치 요약. 폰은 웹 링크, 앱 설치 없음. */
@Composable
fun SendToPhoneScreen(
    record: ParkingRecord,
    url: String,
    shortUrl: String,
    onClose: () -> Unit,
    /** 머리의 뒤로 (시안: C-05로). '닫기'는 [onClose] (홈으로) */
    onBack: () -> Unit = onClose,
) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Column(Modifier.fillMaxSize().background(c.surface)) {
        AppHeader(title = "폰으로 보내기", onBack = onBack)
        Row(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 48.dp, vertical = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(40.dp),
        ) {
            Row(
                Modifier.weight(744f).fillMaxHeight(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(36.dp),
            ) {
                ParkingCard(
                    Modifier.popIn(0, fromScale = 0.9f),
                    border = CardBorder.Strong,
                    padding = PaddingValues(24.dp),
                    spacing = 14.dp,
                ) {
                    QrCode(url, Modifier.sizeIn(maxWidth = 300.dp, maxHeight = 300.dp).aspectRatio(1f).align(Alignment.CenterHorizontally))
                    Text(
                        shortUrl,
                        style = t.body.sized(18.sp, 1.3f, FontWeight.Medium),
                        color = c.inkMuted,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                }
                Column(Modifier.weight(1f).popIn(1), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    val guideStyle = t.title.sized(34.sp, 1.35f)
                    Text("폰으로 찍어 두세요.\n돌아올 때 바로 보여요", style = guideStyle, modifier = Modifier.cssLineBox(guideStyle))
                    Text("앱 설치 없이 웹으로 열려요", style = t.body, color = c.inkMuted)
                }
            }
            ParkingCard(
                Modifier.weight(400f).fillMaxHeight().popIn(2),
                padding = PaddingValues(28.dp),
                spacing = 10.dp,
            ) {
                Text("저장된 위치", style = t.label, color = c.inkMuted)
                FitText(
                    record.positionText,
                    style = t.display.hero(80.sp, (-0.025).em).copy(lineHeight = 84.sp),
                    modifier = Modifier.fillMaxWidth(),
                    minSize = 40.sp,
                )
                Text(record.lotName, style = t.heading, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${formatTimeOfDay(record.parkedAtMs)} 주차", style = t.body.sized(18.sp, 1.35f), color = c.inkMuted)
                record.note?.let { NoteChip(it, Modifier.padding(top = 6.dp)) }
                Spacer(Modifier.weight(1f))
                SecondaryButton("닫기", onClose, Modifier.fillMaxWidth(), height = 72.dp, transparent = true)
            }
        }
    }
}

@CarPreview
@Composable
private fun SendToPhonePreview() = PreviewFrame {
    SendToPhoneScreen(PreviewData.lastRecord, PreviewData.shareUrl, PreviewData.shortUrl, onClose = {})
}

@CarPreviewLight
@Composable
private fun SendToPhoneLightPreview() = PreviewFrame(dark = false) {
    SendToPhoneScreen(PreviewData.lastRecord, PreviewData.shareUrl, PreviewData.shortUrl, onClose = {})
}
