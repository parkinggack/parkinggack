package com.parkinggack.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalInspectionMode
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams
import com.android.resources.Density
import com.android.resources.NightMode
import com.android.resources.ScreenOrientation
import com.android.resources.ScreenRatio
import com.android.resources.ScreenSize
import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.ui.screens.DestinationCardScreen
import com.parkinggack.app.ui.screens.DrivingOverlay
import com.parkinggack.app.ui.screens.EasierLotsScreen
import com.parkinggack.app.ui.screens.HistoryScreen
import com.parkinggack.app.ui.screens.HomeScreen
import com.parkinggack.app.ui.screens.LocalNowMs
import com.parkinggack.app.ui.screens.LotDetailScreen
import com.parkinggack.app.ui.screens.OnboardingScreen
import com.parkinggack.app.ui.screens.ParkedScreen
import com.parkinggack.app.ui.screens.PreviewData
import com.parkinggack.app.ui.screens.ReplayScreen
import com.parkinggack.app.ui.screens.SendToPhoneScreen
import com.parkinggack.app.ui.screens.SettingsScreen
import com.parkinggack.app.ui.screens.ZonePickerScreen
import com.parkinggack.app.ui.theme.DesignScale
import com.parkinggack.app.ui.theme.ParkingTheme
import org.junit.Rule
import org.junit.Test

/**
 * Pleos Connect 에뮬레이터에서 앱이 실제로 받는 창 크기로 그린 스냅숏.
 *
 * Pleos Connect v2.1.0 AVD는 2560×1440 @160dpi이고, 앱은 런처 오른쪽 칸 **1682×1210px**에 뜬다
 * (`dumpsys activity` mBounds 853,90–2535,1300). 앱은 [DesignScale]로 시안 폭 1280dp에 맞춰 키워 그리므로
 * 여기서도 같은 래퍼를 씌운다 → 앱 입장에서는 1280×921dp.
 *
 * 결과: `./gradlew exportScreenshots` → docs/screenshots/vehicle/pleos_*.png
 */
class PleosPanelScreenshotTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = PLEOS_PANEL,
        theme = "android:Theme.Material.NoActionBar",
        renderingMode = SessionParams.RenderingMode.NORMAL,
        showSystemUi = false,
        useDeviceResolution = true,
    )

    @Test fun pleos_c01_home() = panel {
        HomeScreen(
            lastRecord = PreviewData.lastRecord,
            favorites = PreviewData.favorites,
            lastSummaryLine = "지난 주차 후진 2회, 평소보다 쉬웠어요",
            onOpenLot = {}, onSendToPhone = {}, onOpenHistory = {}, onOpenSettings = {},
            kingLine = "주차왕 이번 주 12등", kingTrailing = "상위 8%",
            records = PreviewData.records,
            monthlyAvgReverse = PreviewData.monthlyAvgReverse,
        )
    }

    @Test fun pleos_c01_home_empty() = panel {
        HomeScreen(
            lastRecord = null, favorites = emptyList(), lastSummaryLine = null,
            onOpenLot = {}, onSendToPhone = {}, onOpenHistory = {}, onOpenSettings = {},
        )
    }

    @Test fun pleos_c02_destination_hard() = panel { DestinationCardScreen("현대백화점 판교점", PreviewData.hyundai, {}, {}) }

    @Test fun pleos_c03_easier_lots() = panel { EasierLotsScreen(PreviewData.hyundai, PreviewData.suggestions, {}, {}) }

    @Test fun pleos_c04a_driving_banner() = panel {
        DrivingOverlay(bannerText = "도착지 주차 ★4.3 어려움", recording = false, reverseCount = 0, elapsedSec = 0, destinationName = "현대백화점 판교점")
    }

        @Test fun pleos_c04b_driving_recording() = panel {
        DrivingOverlay(bannerText = "도착지 주차 ★4.3 어려움", recording = true, reverseCount = 1, elapsedSec = 72)
    }

    @Test fun pleos_c05_parked_high() = panel { Parked(PreviewData.estimateHigh) }

    @Test fun pleos_c05_parked_low() = panel { Parked(PreviewData.estimateLow) }

    @Test fun pleos_c06_zone_picker() = panel {
        ZonePickerScreen(
            lotName = PreviewData.avenuefrance.name,
            floors = PreviewData.avenuefrance.floors,
            scheme = PreviewData.avenuefrance.zoneScheme,
            initialFloor = "B2", initialZone = "D", initialNumber = "07",
            onSave = { _, _, _ -> }, onBack = {},
        )
    }

    @Test fun pleos_c07_send_to_phone() = panel {
        SendToPhoneScreen(PreviewData.lastRecord, PreviewData.shareUrl, PreviewData.shortUrl, onClose = {})
    }

    @Test fun pleos_c08_lot_detail() = panel {
        LotDetailScreen(PreviewData.hyundai, myAvgReverse = 2.0, onRouteVia = {}, onRate = {}, onBack = {})
    }

    @Test fun pleos_c09_history() = panel {
        HistoryScreen(PreviewData.records, PreviewData.monthlyAvgReverse, "지난달보다 후진이 1회 줄었어요")
    }

    @Test fun pleos_c10_settings() = panel {
        SettingsScreen(PreviewData.settings, "그랜저 · 자동 인식", onChange = {}, onClearAll = {}, onBack = {})
    }

    @Test fun pleos_c11_onboarding() = panel { OnboardingScreen(onFinish = {}, initialStep = 1) }

    @Test fun pleos_c12_replay() = panel {
        ReplayScreen(PreviewData.summary, PreviewData.trajectory, onClose = {}, initialProgress = 1f)
    }

    @Test fun pleos_c13_king() = panel {
        com.parkinggack.app.ui.screens.KingScreen(
            com.parkinggack.app.model.KingUi.Joined(PreviewData.kingStanding, PreviewData.kingBoard), {}, {}, {}, {}, {},
        )
    }

    private fun panel(content: @Composable () -> Unit) {
        paparazzi.snapshot {
            CompositionLocalProvider(LocalNowMs provides { PreviewData.nowMs }, LocalInspectionMode provides true) {
                ParkingTheme(dark = true) {
                    Box(Modifier.fillMaxSize().background(ParkingTheme.colors.surface)) {
                        DesignScale(content)
                    }
                }
            }
        }
    }

    @Composable
    private fun Parked(estimate: FloorEstimate) = ParkedScreen(
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

    private companion object {
        /** Pleos Connect 런처 오른쪽 칸 (앱 창) 1682×1210px, mdpi */
        val PLEOS_PANEL = DeviceConfig(
            screenWidth = 1682,
            screenHeight = 1210,
            xdpi = 160,
            ydpi = 160,
            density = Density.MEDIUM,
            orientation = ScreenOrientation.LANDSCAPE,
            ratio = ScreenRatio.NOTLONG,
            size = ScreenSize.XLARGE,
            nightMode = NightMode.NIGHT,
            softButtons = false,
            locale = "ko-rKR",
        )
    }
}
