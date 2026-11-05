package com.parkinggack.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams
import com.android.resources.Density
import com.android.resources.NightMode
import com.android.resources.ScreenOrientation
import com.android.resources.ScreenRatio
import com.android.resources.ScreenSize
import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.ui.components.ComponentSheet
import com.parkinggack.app.ui.components.TrajectoryShapesSheet
import com.parkinggack.app.ui.components.bottomDivider
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
import com.parkinggack.app.ui.theme.ParkingTheme
import org.junit.Rule
import org.junit.Test

/**
 * 차 화면 스냅숏 (Paparazzi / layoutlib — 에뮬레이터 없이 JVM에서 렌더).
 *
 * - 1280×720 가로, 160dpi (1dp = 1px) → docs/design 시안과 픽셀 단위로 겹쳐 볼 수 있다.
 * - 시안 맨 위 44px 'Pleos Connect 시스템 영역'은 OS가 그리는 자리라 앱은 그 아래 1280×676만 쓴다.
 *   여기서도 같은 띠를 흉내 내 [CarFrame]으로 앱이 실제로 받는 높이에서 렌더한다.
 * - 시각은 [PreviewData.nowMs]로 고정 (결과가 매번 같게).
 *
 * 평소 `testDebugUnitTest`에서는 렌더만 하고 비교는 하지 않는다 (build/reports/paparazzi).
 * 이미지 갱신: `./gradlew exportScreenshots` → docs/screenshots/vehicle 의 PNG (docs/screenshots/README.md)
 */
class ScreenshotTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = CAR_DISPLAY,
        theme = "android:Theme.Material.NoActionBar",
        renderingMode = SessionParams.RenderingMode.NORMAL,
        showSystemUi = false,
        useDeviceResolution = true,
    )

    // ── C-01 홈 ──────────────────────────────────────────────────────────────

    @Test fun c01_home_dark() = car { Home() }

    @Test fun c01_home_light() = car(dark = false) { Home() }

    @Test fun c01_home_empty_dark() = car {
        HomeScreen(
            lastRecord = null, favorites = emptyList(), lastSummaryLine = null,
            onOpenLot = {}, onSendToPhone = {}, onOpenHistory = {}, onOpenSettings = {},
        )
    }

    // ── C-02 도착지 난이도 카드 (어려움 / 쉬움 / 데이터 부족) ───────────────────

    @Test fun c02_destination_hard_dark() = car { DestinationCardScreen("현대백화점 판교점", PreviewData.hyundai, {}, {}) }

    @Test fun c02_destination_hard_light() = car(dark = false) { DestinationCardScreen("현대백화점 판교점", PreviewData.hyundai, {}, {}) }

    @Test fun c02_destination_easy_dark() = car { DestinationCardScreen("아브뉴프랑 판교", PreviewData.avenuefrance, {}, {}) }

    @Test fun c02_destination_sparse_dark() = car { DestinationCardScreen("판교테크원", PreviewData.sparseLot, {}, {}) }

    // ── C-03 더 쉬운 주차장 ──────────────────────────────────────────────────

    @Test fun c03_easier_lots_dark() = car { EasierLotsScreen(PreviewData.hyundai, PreviewData.suggestions, {}, {}) }

    // ── C-04 주행 중 (배너 / 주차 기록 중) ─────────────────────────────────────

    @Test fun c04a_driving_banner_dark() = car {
        DrivingOverlay(bannerText = "도착지 주차 ★4.3 어려움", recording = false, reverseCount = 0, elapsedSec = 0)
    }

    @Test fun c04b_driving_recording_dark() = car {
        DrivingOverlay(bannerText = "도착지 주차 ★4.3 어려움", recording = true, reverseCount = 1, elapsedSec = 72)
    }

    // ── C-05 주차 완료 카드 (신뢰도 높음 / 보통 / 낮음) ─────────────────────────

    @Test fun c05_parked_high_dark() = car { Parked(PreviewData.estimateHigh) }

    @Test fun c05_parked_medium_dark() = car { Parked(PreviewData.estimateMedium) }

    @Test fun c05_parked_low_dark() = car { Parked(PreviewData.estimateLow) }

    @Test fun c05_parked_high_light() = car(dark = false) { Parked(PreviewData.estimateHigh) }

    // ── C-06 ~ C-11 ──────────────────────────────────────────────────────────

    @Test fun c06_zone_picker_dark() = car {
        ZonePickerScreen(
            lotName = PreviewData.avenuefrance.name,
            floors = PreviewData.avenuefrance.floors,
            scheme = PreviewData.avenuefrance.zoneScheme,
            initialFloor = "B2", initialZone = "D", initialNumber = "07",
            onSave = { _, _, _ -> }, onBack = {},
        )
    }

    @Test fun c07_send_to_phone_dark() = car {
        SendToPhoneScreen(PreviewData.lastRecord, PreviewData.shareUrl, PreviewData.shortUrl, onClose = {})
    }

    @Test fun c08_lot_detail_dark() = car {
        LotDetailScreen(PreviewData.hyundai, myAvgReverse = 2.0, onRouteVia = {}, onRate = {}, onBack = {})
    }

    @Test fun c08_rating_sheet_dark() = car {
        androidx.compose.foundation.layout.Box {
            LotDetailScreen(PreviewData.hyundai, myAvgReverse = 2.0, onRouteVia = {}, onRate = {}, onBack = {})
            com.parkinggack.app.ui.components.RatingSheet(PreviewData.hyundai.name, sentStars = null, onRate = {}, onClose = {})
        }
    }

    @Test fun c08_rating_sent_dark() = car {
        androidx.compose.foundation.layout.Box {
            LotDetailScreen(PreviewData.hyundai, myAvgReverse = 2.0, onRouteVia = {}, onRate = {}, onBack = {})
            com.parkinggack.app.ui.components.RatingSheet(PreviewData.hyundai.name, sentStars = 4, onRate = {}, onClose = {})
        }
    }

    @Test fun c10_phone_link_dark() = car {
        com.parkinggack.app.ui.screens.PhoneLinkScreen(
            com.parkinggack.app.session.PhoneLinkState.Ready("483920", "https://parkinggack.vercel.app/pair/483920", 9 * 60_000L + 12_000L),
            onRetry = {}, onClose = {}, nowMs = { 0L },
        )
    }

    @Test fun c10_phone_linked_dark() = car {
        com.parkinggack.app.ui.screens.PhoneLinkScreen(com.parkinggack.app.session.PhoneLinkState.Linked("갤럭시 S25"), onRetry = {}, onClose = {})
    }

    @Test fun c10_phone_link_offline_dark() = car {
        com.parkinggack.app.ui.screens.PhoneLinkScreen(com.parkinggack.app.session.PhoneLinkState.Offline, onRetry = {}, onClose = {})
    }

    // ── C-13 주차왕 (시안 숫자 그대로 — PreviewData.kingStanding/kingBoard) ──
    @Test fun c13_king_dark() = car {
        com.parkinggack.app.ui.screens.KingScreen(com.parkinggack.app.model.KingUi.Joined(PreviewData.kingStanding, PreviewData.kingBoard), {}, {}, {}, {}, {})
    }

    @Test fun c13_king_join_dark() = car {
        com.parkinggack.app.ui.screens.KingScreen(com.parkinggack.app.model.KingUi.NotJoined("판교 느긋한 수달", "판교 · 1년 미만"), {}, {}, {}, {}, {})
    }

    @Test fun c08_lot_detail_sparse_dark() = car {
        LotDetailScreen(PreviewData.sparseLot, myAvgReverse = null, onRouteVia = {}, onRate = {}, onBack = {})
    }

    @Test fun c09_history_dark() = car {
        HistoryScreen(PreviewData.records, PreviewData.monthlyAvgReverse, "지난달보다 후진이 1회 줄었어요")
    }

    @Test fun c09_history_empty_dark() = car {
        HistoryScreen(emptyList(), emptyList(), "첫 기록을 기다리고 있어요")
    }

    @Test fun c10_settings_dark() = car {
        SettingsScreen(PreviewData.settings, "그랜저 · 자동 인식", onChange = {}, onClearAll = {}, onBack = {})
    }

    @Test fun c11_onboarding_step1_dark() = car { OnboardingScreen(onFinish = {}, initialStep = 1) }

    @Test fun c11_onboarding_step2_dark() = car { OnboardingScreen(onFinish = {}, initialStep = 2) }

    @Test fun c11_onboarding_step3_dark() = car { OnboardingScreen(onFinish = {}, initialStep = 3) }

    // ── C-12 동선 리플레이 (다 그린 상태 = progress 1) ──────────────────────────

    @Test fun c12_replay_dark() = car { ReplayScreen(PreviewData.summary, PreviewData.trajectory, onClose = {}, initialProgress = 1f) }

    @Test fun c12_replay_approximate_dark() = car {
        ReplayScreen(PreviewData.approximateSummary, PreviewData.trajectory, onClose = {}, initialProgress = 1f)
    }

    @Test fun c12_replay_parallel_dark() = car {
        ReplayScreen(PreviewData.parallelSummary, PreviewData.parallelTrajectory, onClose = {}, initialProgress = 1f)
    }

    @Test fun c12_replay_angled_dark() = car {
        ReplayScreen(PreviewData.angledSummary, PreviewData.angledTrajectory, onClose = {}, initialProgress = 1f)
    }

    @Test fun c12_shapes_dark() = car(systemBar = false) { TrajectoryShapesSheet() }

    // ── 공통 컴포넌트 (Components.dc.html — 시안도 900을 넘쳐 1280×1080으로) ─────────

    @Test fun components_dark() {
        paparazzi.unsafeUpdateConfig(deviceConfig = CAR_DISPLAY.copy(screenHeight = 1080))
        car(systemBar = false) { ComponentSheet() }
    }

    // ── 도우미 ───────────────────────────────────────────────────────────────

    private fun car(dark: Boolean = true, systemBar: Boolean = true, content: @Composable () -> Unit) {
        paparazzi.snapshot {
            // LocalInspectionMode: 앱 안 지도(LiveMap) 대신 시안과 같은 자리 표시 그림 (layoutlib엔 네트워크 없음)
            CompositionLocalProvider(LocalNowMs provides { PreviewData.nowMs }, LocalInspectionMode provides true) {
                ParkingTheme(dark = dark) {
                    CarFrame(dark, systemBar, content)
                }
            }
        }
    }

    @Composable
    private fun Home() = HomeScreen(
        lastRecord = PreviewData.lastRecord,
        favorites = PreviewData.favorites,
        lastSummaryLine = "지난 주차 후진 2회, 평소보다 쉬웠어요",
        onOpenLot = {}, onSendToPhone = {}, onOpenHistory = {}, onOpenSettings = {},
        kingLine = "주차왕 이번 주 12등", kingTrailing = "상위 8%",
    )

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
        /** 1280×720 가로, mdpi(160) → 1dp = 1px. 차 화면 기본은 야간(다크). */
        val CAR_DISPLAY = DeviceConfig(
            screenWidth = 1280,
            screenHeight = 720,
            xdpi = 160,
            ydpi = 160,
            density = Density.MEDIUM,
            orientation = ScreenOrientation.LANDSCAPE,
            ratio = ScreenRatio.LONG,
            size = ScreenSize.LARGE,
            nightMode = NightMode.NIGHT,
            softButtons = false,
            locale = "ko-rKR",
        )
    }
}

/** OS 상단 띠(44px)를 흉내 내고, 그 아래에 앱 화면을 놓는다. */
@Composable
private fun CarFrame(dark: Boolean, systemBar: Boolean, content: @Composable () -> Unit) {
    val c = ParkingTheme.colors
    Column(Modifier.fillMaxSize().background(c.surface)) {
        if (systemBar) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .background(if (dark) Color(0xFF161616) else Color(0xFFE6E3DC))
                    .bottomDivider(c.line)
                    .padding(start = 64.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text("Pleos Connect 시스템 영역 (OS)", style = ParkingTheme.type.caption, color = c.inkMuted)
            }
        }
        Box(Modifier.fillMaxWidth().weight(1f)) { content() }
    }
}
