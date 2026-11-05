package com.parkinggack.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.ui.theme.ParkingTheme

/**
 * C-08 "별점 남기기" — 화면 안 시트 (시스템 팝업 없음, 키보드 없음).
 * 별점 = 주차하기 어려웠던 정도 (★1 아주 쉬움 … ★5 아주 어려움). 서버 난이도 점수에 반영.
 * @param sentStars 보낸 뒤면 고맙다는 문구만 보여 줌
 */
@Composable
fun RatingSheet(lotName: String, sentStars: Int?, onRate: (Int) -> Unit, onClose: () -> Unit) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f))
            // 뒤 화면 터치 막기 (바깥을 눌러도 닫히지 않음 — 닫기 버튼으로만)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Image) {},
        contentAlignment = Alignment.Center,
    ) {
        ParkingCard(
            Modifier.width(880.dp),
            border = CardBorder.Strong,
            padding = PaddingValues(horizontal = 40.dp, vertical = 36.dp),
            spacing = 20.dp,
        ) {
            Text(lotName, style = t.body, color = c.inkMuted)
            if (sentStars == null) {
                Text("이 주차장, 주차하기 어땠나요?", style = t.title)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    (1..5).forEach { stars ->
                        ChoiceButton(
                            text = "★$stars",
                            selected = false,
                            onClick = { onRate(stars) },
                            modifier = Modifier.weight(1f),
                            height = 96.dp,
                            fontSize = 30.sp,
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    (1..5).forEach { stars ->
                        Text(
                            Difficulty(stars.toDouble()).label,
                            style = t.label,
                            color = c.inkMuted,
                            modifier = Modifier.weight(1f),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        )
                    }
                }
                SecondaryButton("닫기", onClose, Modifier.fillMaxWidth(), height = 64.dp, fontSize = 20.sp)
            } else {
                Text("고마워요. 난이도 점수에 반영할게요", style = t.title)
                Text("남긴 별점 ★$sentStars · ${Difficulty(sentStars.toDouble()).label}", style = t.body, color = c.inkMuted)
                Column(Modifier.fillMaxWidth()) {
                    PrimaryButton("확인", onClose, Modifier.fillMaxWidth())
                }
            }
        }
    }
}
