package com.parkinggack.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.unit.dp
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.ui.components.CarPosition
import com.parkinggack.app.ui.components.DrivingBanner
import com.parkinggack.app.ui.components.LiveMap
import com.parkinggack.app.ui.components.RecordingBadge
import com.parkinggack.app.ui.components.SideNav
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.theme.ParkingTheme

/**
 * C-04a/b 주행 중 미니 상태. **터치 입력이 하나도 없다** (clickable 없음).
 * 왼쪽 아이콘 메뉴는 정차 중 화면과 같은 자리에 두되 아이콘만 보인다 (눌리지 않음, 고른 칸 없음).
 * 한 줄만: 기록 중이면 '주차 기록 중 | 후진 n · m:ss', 아니면 [bannerText] ("도착지 주차 ★4.3 어려움").
 * 바탕은 앱 안 지도([LiveMap]: 내 차 + 목적지/경유지 주차장, 터치 없음).
 * Pleos NaviHelper는 내비 지도를 앱에 넣는 API가 없어서 직접 그린다. 스냅숏에서는 시안처럼 판교 경로 그림.
 *
 * @param bannerText null이면 배너 없음. "★4.3"이 들어 있으면 난이도 막대도 함께 그린다.
 */
@Composable
fun DrivingOverlay(
    bannerText: String?,
    recording: Boolean,
    reverseCount: Int,
    elapsedSec: Int,
    car: CarPosition? = null,
    destination: LatLng? = null,
    destinationName: String? = null,
    /** 왼쪽 아이콘 메뉴 (보이기만) */
    showNav: Boolean = true,
) {
    val c = ParkingTheme.colors
    Row(Modifier.fillMaxSize().background(c.surface)) {
        if (showNav) SideNav(selected = null, onSelect = {}, onSettings = {}, enabled = false)
        // 지도 그림이 메뉴 쪽으로 삐져나오지 않게 자른다
        Box(Modifier.weight(1f).fillMaxHeight().clipToBounds().background(c.placeholder)) {
            LiveMap(car = car, destination = destination, modifier = Modifier.fillMaxSize()) {
                NaviMapPlaceholder(destinationName, Modifier.fillMaxSize(), caption = "내비 주행 화면 (Pleos 기본 내비)")
            }
            val bannerModifier = Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = 24.dp)
            when {
                recording -> RecordingBadge(reverseCount, elapsedSec, bannerModifier)
                bannerText != null -> DrivingBanner(bannerText, bannerModifier, level = levelFromBanner(bannerText))
            }
        }
    }
}

/** "도착지 주차 ★4.3 어려움" → 4 (막대 칸 수). 숫자가 없으면 null. */
internal fun levelFromBanner(text: String): Int? {
    val score = Regex("★\\s*(\\d+(?:\\.\\d+)?)").find(text)?.groupValues?.get(1)?.toDoubleOrNull() ?: return null
    return com.parkinggack.app.model.Difficulty(score).level
}

@CarPreview
@Composable
private fun DrivingBannerPreview() = PreviewFrame {
    DrivingOverlay(bannerText = "도착지 주차 ★4.3 어려움", recording = false, reverseCount = 0, elapsedSec = 0)
}

@CarPreview
@Composable
private fun DrivingRecordingPreview() = PreviewFrame {
    DrivingOverlay(bannerText = "도착지 주차 ★4.3 어려움", recording = true, reverseCount = 1, elapsedSec = 72)
}

@CarPreviewLight
@Composable
private fun DrivingViaLightPreview() = PreviewFrame(dark = false) {
    DrivingOverlay(bannerText = "경유지 아브뉴프랑 ★1.8", recording = false, reverseCount = 0, elapsedSec = 0)
}
