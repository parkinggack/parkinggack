package com.parkinggack.app.ui

import com.parkinggack.app.model.UserSettings
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.session.AppUiState
import com.parkinggack.app.ui.components.LocalReduceMotion
import androidx.compose.runtime.CompositionLocalProvider
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parkinggack.app.ParkingApp
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.session.AppController
import com.parkinggack.app.session.Copy
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.PhoneLinkState
import com.parkinggack.app.session.Screen
import com.parkinggack.app.BuildConfig
import com.parkinggack.app.share.ShareService
import com.parkinggack.app.ui.components.RatingSheet
import com.parkinggack.app.ui.screens.DestinationCardScreen
import com.parkinggack.app.ui.screens.DrivingOverlay
import com.parkinggack.app.ui.screens.EasierLotsScreen
import com.parkinggack.app.ui.screens.HistoryScreen
import com.parkinggack.app.ui.screens.HomeScreen
import com.parkinggack.app.ui.screens.KingScreen
import com.parkinggack.app.ui.screens.LotDetailScreen
import com.parkinggack.app.ui.screens.OnboardingScreen
import com.parkinggack.app.ui.screens.ParkedScreen
import com.parkinggack.app.ui.screens.PhoneLinkScreen
import com.parkinggack.app.ui.screens.ReplayScreen
import com.parkinggack.app.ui.screens.SendToPhoneScreen
import com.parkinggack.app.ui.screens.SettingsScreen
import com.parkinggack.app.ui.screens.ZonePickerScreen
import com.parkinggack.app.pleos.SdkStatus
import com.parkinggack.app.service.KeepAliveService
import com.parkinggack.app.ui.components.CarPosition
import com.parkinggack.app.ui.components.NavTab
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import com.parkinggack.app.ui.screens.LocalNowMs
import com.parkinggack.app.ui.screens.formatDayLabel
import com.parkinggack.app.ui.screens.formatTimeOfDay
import com.parkinggack.app.ui.theme.DesignScale
import com.parkinggack.app.ui.theme.ParkingTheme
import kotlin.math.ceil

/**
 * 단일 Activity. 화면 전환은 AppController의 스택으로.
 * 주행 중(CarUxRestrictions) / 주행·기록 상태에서는 어떤 화면이든 C-04 오버레이만 보인다 (터치 입력 없음).
 *
 * 시연: adb shell am start -n com.parkinggack.app/.ui.MainActivity --es demo pangyo-department-store [--ef speed 2.0] [--ez dest false]
 */
class MainActivity : ComponentActivity() {

    private val app get() = application as ParkingApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()
        val controller = app.controller

        // 차·내비 이벤트(UX 제한·목적지·위치·경유지 도착)와 차종 인식은 ParkingApp.connectSignals — 이 화면이 내비 뒤에 있어도 받아야 한다
        handleDemoIntent(intent)

        setContent {
            // 차 화면은 다크 (시안·디자인 시스템 '제때' 차 화면 = dark). 라이트 테마는 남겨 두되 차량 주간 신호로 바꾸지 않는다.
            ParkingTheme(dark = true) {
                Box(Modifier.fillMaxSize().background(ParkingTheme.colors.surface)) {
                    // 시안(1280×676dp) 비율로 창 크기에 맞춰 키움 — Pleos 창 1682×1210px → ×1.31
                    val car by remember { carPositions() }.collectAsStateWithLifecycle(null)
                    // 시연 재생 중엔 시나리오 거리로 움직이는 차 (에뮬레이터 GPS는 서 있음, 3-7)
                    val demoCar by controller.demoCarPosition.collectAsStateWithLifecycle()
                    val ready by controller.recordsReady.collectAsStateWithLifecycle()
                    DesignScale { AppRoot(controller, demoCar?.let { CarPosition(it, 0f) } ?: car, ready) }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        // 후진 중 후방 카메라가 이 화면을 덮어도(onStop) 10초 뒤 프로세스가 얼지 않게. 백그라운드에선 시작이 막혀 화면이 보일 때 시작
        KeepAliveService.start(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDemoIntent(intent)
    }

    private fun handleDemoIntent(intent: Intent?) {
        // 예시 기록 다시 넣기 (scripts/demo.sh seed): --ez seedDemo true
        if (intent?.getBooleanExtra("seedDemo", false) == true) {
            Log.i("MainActivity", "seedDemo")
            app.controller.seedDemo()
            intent.removeExtra("seedDemo")
        }
        val id = intent?.getStringExtra("demo") ?: return
        val scenario = ScenarioGenerator.byId(if (id == "main") ScenarioGenerator.MAIN_DEMO else id) ?: return
        val speed = intent.getFloatExtra("speed", 1f).toDouble().coerceIn(0.25, 8.0)
        val withDest = intent.getBooleanExtra("dest", true)
        Log.i("MainActivity", "demo ${scenario.id} x$speed dest=$withDest")
        app.controller.startDemo(scenario.samples, speed, withDest, scenario.distanceToTargetM)
        intent.removeExtra("demo")
    }

    /** 지도용 내 차 위치 (Pleos FusedLocation). 지원 안 함·권한 없음이면 아무것도 안 보냄 → 지도는 목적지 쪽 */
    private fun carPositions(): Flow<CarPosition?> = flow {
        if (app.location.initialize() != SdkStatus.Ready) return@flow
        emitAll(app.location.locations().map { CarPosition(LatLng(it.latitude, it.longitude), it.heading.takeUnless { h -> h.isNaN() }) })
    }.catch { Log.w("MainActivity", "location: ${it.message}") }

    private fun requestRuntimePermissions() {
        // 차속(dangerous) / 융합 위치(런타임 허용 필요). 거부돼도 앱은 동작 (차속은 서행 가정 폴백)
        val wanted = arrayOf("android.car.permission.CAR_SPEED", "pleos.car.permission.FUSED_LOCATION")
            .filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (wanted.isNotEmpty()) runCatching { requestPermissions(wanted.toTypedArray(), 1) }
    }
}

@Composable
private fun AppRoot(c: AppController, car: CarPosition?, recordsReady: Boolean = true) {
    val ui by c.ui.collectAsStateWithLifecycle()
    val records by c.recordList.collectAsStateWithLifecycle()
    val settings by c.settings.collectAsStateWithLifecycle()

    // 화면이 바뀐 직후 잠깐 터치를 받지 않는다. '맞아요'를 빠르게 두 번 누르면 두 번째 터치가
    // 바뀐 홈의 같은 자리('주차 동선' 카드)에 떨어져 C-12가 열렸다 — 흔들리는 차에선 흔하다 (2-3)
    var touchGuard by remember { mutableStateOf(false) }
    LaunchedEffect(ui.screen, ui.showDrivingOverlay) {
        touchGuard = true
        delay(SCREEN_TOUCH_GUARD_MS)
        touchGuard = false
    }

    BackHandler(enabled = (ui.stack.size > 1 || ui.rating != null) && !ui.showDrivingOverlay) {
        when {
            ui.rating != null -> c.closeRating()
            ui.screen == Screen.PhoneLink -> c.closePhoneLink()
            else -> c.back()
        }
    }
    Box(Modifier.fillMaxSize()) {
        // 기록 파일을 다 읽기 전엔 홈·기록 화면을 그리지 않는다 ('첫 기록' 빈 화면이 잠깐 보이지 않게, RecordStore.ready)
        val waiting = !recordsReady && records.isEmpty() && (ui.screen == Screen.Home || ui.screen == Screen.History) && !ui.showDrivingOverlay
        // 주행 중(UX 제한·주행 화면)에는 모션 끔 — Pleos 주행 안전 가이드
        if (!waiting) CompositionLocalProvider(LocalReduceMotion provides ui.showDrivingOverlay) { AppScreens(c, ui, records, settings, car) }
        if (touchGuard) Box(Modifier.matchParentSize().pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } } })
    }
}

private const val SCREEN_TOUCH_GUARD_MS = 400L

@Composable
private fun AppScreens(c: AppController, ui: AppUiState, records: List<ParkingRecord>, settings: UserSettings, car: CarPosition?) {

    if (ui.showDrivingOverlay) {
        val rec = ui.drive as? DriveState.Recording
        DrivingOverlay(
            bannerText = ui.bannerText,
            recording = rec != null,
            reverseCount = rec?.reverseCount ?: 0,
            elapsedSec = rec?.elapsedSec ?: 0,
            car = car,
            destination = (ui.waypoint?.lot ?: ui.destinationLot)?.location,
            destinationName = ui.waypoint?.lot?.name ?: ui.destinationName,
        )
        return
    }

    // 왼쪽 아이콘 메뉴: 홈 · 내 기록 · 주차왕 (C-13 순위는 서버 — AppController.openKing)
    val onNav: (NavTab) -> Unit = { tab ->
        when (tab) {
            NavTab.Home -> c.goHome()
            NavTab.Records -> { c.goHome(); c.push(Screen.History) }
            NavTab.King -> if (ui.screen == Screen.King) c.loadKing() else c.openKing()
        }
    }

    when (val screen = ui.screen) {
        Screen.Onboarding -> OnboardingScreen(onFinish = c::finishOnboarding)

        Screen.Home -> HomeScreen(
            lastRecord = records.firstOrNull(),
            favorites = ui.favorites,
            lastSummaryLine = Copy.lastSummaryLine(records),
            onOpenLot = { c.openLot(it.id) },
            onSendToPhone = c::openLatestForPhone,
            onOpenHistory = { c.push(Screen.History) },
            onOpenSettings = { c.push(Screen.Settings) },
            records = records,
            monthlyAvgReverse = remember(records) { Copy.monthlyAvgReverse(records) },
            onOpenReplay = c::openRecordReplay,
            // 주차왕 줄: 참여 중이면 서버 순위 "주차왕 이번 주 12등" · "상위 8%", 아니면 참여 권유
            kingLine = ui.kingHome?.first ?: "주차왕에 참여해 보세요",
            kingTrailing = ui.kingHome?.second,
            onOpenRanking = c::openKing,
        )

        Screen.DestinationCard -> {
            val lot = ui.destinationLot
            if (lot == null) LaunchedEffect(Unit) { c.back() }
            else DestinationCardScreen(
                destinationName = ui.destinationName ?: lot.name,
                lot = lot,
                onShowEasier = c::showEasier,
                onDismiss = c::dismissCard,
                car = car,
            )
        }

        Screen.EasierLots -> {
            val lot = ui.destinationLot
            if (lot == null) LaunchedEffect(Unit) { c.back() }
            else EasierLotsScreen(current = lot, suggestions = ui.suggestions, onRouteVia = c::routeVia, onBack = c::back)
        }

        Screen.Parked -> {
            val p = ui.parked
            val cur = ui.current
            if (p == null || cur == null) LaunchedEffect(Unit) { c.goHome() }
            else ParkedScreen(
                estimate = p.estimate,
                floors = p.lot?.floors ?: DEFAULT_FLOORS,
                summary = p.summary,
                comparisonText = Copy.comparison(p.summary, records, cur.id),
                trajectory = p.displayTrajectory,
                autoSaveProgress = if (ui.currentSaved) 1f else 1f - ui.autoSaveMsLeft.toFloat() / ui.autoSaveTotalMs.coerceAtLeast(1),
                autoSaveSecondsLeft = if (ui.currentSaved) 0 else ceil(ui.autoSaveMsLeft / 1000.0).toInt().coerceAtLeast(1),
                onConfirm = c::confirmFloor,
                onOtherFloor = c::otherFloor,
                onPickFloor = c::pickFloor,
                onRememberZone = c::rememberZone,
                onSendToPhone = c::sendToPhone,
                onOpenReplay = c::openReplay,
                // 목적지 주차장, 없으면 P 위치로 찾은 주차장·주소 (AppController.nameByPlace)
                placeLine = p.lot?.name ?: cur.lotName.takeIf { it != ParkingRecord.UNKNOWN_PLACE },
                placeTime = formatTimeOfDay(cur.parkedAtMs),
                saved = ui.currentSaved,
                kingLine = ui.parkedKingLine, // 서버 기록 응답의 "주차왕 이번 주 12등 → 10등" (참여자만)
            )
        }

        Screen.ZonePicker -> {
            val cur = ui.current ?: records.firstOrNull()
            val lot = cur?.lotId?.let(c::lot)
            ZonePickerScreen(
                lotName = cur?.lotName ?: ParkingRecord.UNKNOWN_PLACE,
                floors = lot?.floors ?: DEFAULT_FLOORS,
                scheme = lot?.zoneScheme ?: com.parkinggack.app.model.ZoneScheme(),
                initialFloor = cur?.floor, initialZone = cur?.zone, initialNumber = cur?.number,
                onSave = c::saveZone,
                onBack = c::back,
            )
        }

        Screen.SendToPhone -> {
            val r = ui.current ?: records.firstOrNull()
            if (r == null) LaunchedEffect(Unit) { c.back() }
            else {
                val share = ui.share ?: ShareService(null, BuildConfig.WEB_BASE_URL).offline(r)
                SendToPhoneScreen(record = r, url = share.url, shortUrl = share.display, onClose = c::goHome, onBack = c::back)
            }
        }

        is Screen.LotDetail -> {
            val lot = ui.lotDetail?.takeIf { it.id == screen.lotId } ?: c.lot(screen.lotId)
            if (lot == null) LaunchedEffect(Unit) { c.back() }
            else LotDetailScreen(
                lot = lot,
                myAvgReverse = records.filter { it.lotId == lot.id }.mapNotNull { it.summary?.reverseCount }.takeIf { it.isNotEmpty() }?.average(),
                onRouteVia = { c.routeViaLot(lot) },
                onRate = { c.openRating(lot) },
                onBack = c::back,
            )
        }

        Screen.History -> {
            val monthly = remember(records) { Copy.monthlyAvgReverse(records) }
            HistoryScreen(
                records = records,
                monthlyAvgReverse = monthly,
                headline = Copy.historyHeadline(monthly),
                onNav = onNav,
                onOpenSettings = { c.push(Screen.Settings) },
                onOpenRecord = c::openRecordReplay,
            )
        }

        Screen.Settings -> SettingsScreen(
            settings = settings,
            vehicleName = ui.vehicleName,
            onChange = c::updateSettings,
            onClearAll = c::clearRecords,
            onBack = c::back,
            phoneLinkLabel = ui.phoneLinkLabel,
            onOpenPhoneLink = c::openPhoneLink,
            phonePaired = ui.phonePaired,
            onUnlinkPhone = c::unlinkPhone,
        )

        Screen.King -> KingScreen(
            state = ui.king,
            onNavigate = onNav,
            onSettings = { c.push(Screen.Settings) },
            onJoin = c::joinKing,
            onReroll = c::rerollKingNickname,
            onRetry = c::loadKing,
            onLeave = c::leaveKing,
        )

        Screen.PhoneLink -> {
            val st = c.phoneLinkState?.collectAsStateWithLifecycle()?.value ?: PhoneLinkState.Offline
            PhoneLinkScreen(state = st, onRetry = c::startPhoneLink, onClose = c::closePhoneLink)
        }

        Screen.Replay -> {
            val summary = ui.parked?.summary ?: ui.current?.summary
            val traj = ui.parked?.displayTrajectory ?: ui.current?.trajectory.orEmpty()
            if (summary == null) LaunchedEffect(Unit) { c.back() }
            else {
                // C-05에서 열면 방금 주차 = 오늘, C-09에서 지난 기록을 열면 그 날짜
                val day = if (ui.parked != null) "오늘" else ui.current?.let { formatDayLabel(it.parkedAtMs, LocalNowMs.current()) } ?: "오늘"
                ReplayScreen(summary = summary, trajectory = traj, onClose = c::back, dayLabel = day)
            }
        }
    }

    // C-08 별점 시트 (화면 위에 겹침 — AppRoot는 Box 안에서 호출됨)
    ui.rating?.let { r -> RatingSheet(lotName = r.lot.name, sentStars = r.sentStars, onRate = c::submitRating, onClose = c::closeRating) }
}

private val DEFAULT_FLOORS = listOf("1F", "B1", "B2", "B3", "B4", "B5", "B6")
