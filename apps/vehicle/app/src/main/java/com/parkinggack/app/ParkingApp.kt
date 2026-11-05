package com.parkinggack.app

import android.app.Application
import com.parkinggack.app.car.CarSignals
import com.parkinggack.app.data.RecordStore
import com.parkinggack.app.data.DeviceStore
import com.parkinggack.app.data.Outbox
import com.parkinggack.app.data.VehicleSpecs
import com.parkinggack.app.session.PhoneLink
import com.parkinggack.app.data.RemoteParkingLotRepository
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.net.ApiClient
import com.parkinggack.app.share.ShareService
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import com.parkinggack.app.data.SettingsStore
import com.parkinggack.app.domain.Domain
import com.parkinggack.app.pleos.LocationGateway
import com.parkinggack.app.pleos.NaviGateway
import com.parkinggack.app.pleos.VehicleGateway
import com.parkinggack.app.session.AppController
import com.parkinggack.app.session.LiveSignalSource
import com.parkinggack.app.session.ParkingSession
import com.parkinggack.app.ui.overlay.DrivePresenter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

/** 앱 전역 단일 인스턴스. 규모가 커지면 DI(Hilt 등)로 교체. */
class ParkingApp : Application() {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val carSignals by lazy { CarSignals(this) }
    val vehicle by lazy { VehicleGateway(this) }
    val navi by lazy { NaviGateway(this) }
    val location by lazy { LocationGateway(this) }

    override fun onCreate() {
        super.onCreate()
        // 후진 시 시스템 후방 카메라가 화면을 덮어도(Activity onStop) 기록은 계속돼야 하므로
        // SDK 연결은 Activity가 아니라 프로세스 수명에 묶는다.
        vehicle.initialize()
        navi.initialize()
        // 주행 중엔 Pleos 내비 + 그 위 배너, P에서 C-05를 앞으로 (ui/overlay/DrivePresenter.kt)
        DrivePresenter(this, controller, navi, appScope).start()
        connectSignals()
    }

    /** 차 모델 (INFO_MODEL) — 찾으면 폰 연결 때 기기 이름으로도 쓴다 */
    @Volatile private var modelName: String? = null

    /**
     * 차·내비 이벤트도 Activity가 아니라 프로세스 수명에 묶는다.
     * 주행 중엔 내비가 앞에 있어 MainActivity가 멈춰(onStop) 있다 — 예전처럼 repeatOnLifecycle(STARTED) 안에서 받으면
     * UX 제한이 '주행 중'으로 얼어붙어 P를 넣어도 C-05가 앞으로 오지 않았고(docs/sim-findings.md 1-6),
     * 목적지·현재 위치·경유지 도착도 그동안 끊겼다.
     */
    private fun connectSignals() {
        val c = controller
        appScope.launch { carSignals.uxRestrictions().collect(c::onUxRestrictions) }
        appScope.launch { navi.waypointArrivals.collect { c.onWaypointArrived() } }
        appScope.launch {
            // 내비 현재 위치를 주기적으로 받아 목적지까지 거리(주차장 진입 감지)·P 위치(주차장 찾기·이름)에 쓴다
            while (true) { navi.requestLocation(); delay(2_000) }
        }
        appScope.launch {
            // 초기값 null(아직 목적지 이벤트 없음)은 무시 — 그대로 넘기면 시연 모드로 막 띄운 C-02가 바로 닫힘
            navi.destination.filterNotNull().collect { d -> c.onDestination(d.name, LatLng(d.latitude, d.longitude)) }
        }
        appScope.launch {
            // 차종 자동 인식 (AAOS INFO_MODEL → 제원 표) — 궤적 보정·난이도 보정·설정 화면 "그랜저 · 자동 인식".
            // Car 동기 호출이라 메인 스레드 밖에서 (VHAL 재시작 중이면 수 초)
            val model = carSignals.modelName()
            modelName = model
            c.onVehicleSpec(VehicleSpecs.find(model), autoDetected = model != null)
        }
    }

    /** 서버 (apps/server). 주소는 빌드 설정 apiBaseUrl — 기본 에뮬레이터→호스트 http://10.0.2.2:8787 */
    val api by lazy { ApiClient(BuildConfig.API_BASE_URL) }

    /** 이 차의 기기 토큰·폰 연결 상태 */
    val device by lazy { DeviceStore(this) }

    /** 내비 현재 위치 → LatLng */
    private val naviLocation by lazy {
        navi.location.map { it?.let { l -> LatLng(l.latitude, l.longitude) } }
            .stateIn(appScope, SharingStarted.Eagerly, null)
    }

    val controller by lazy {
        AppController(
            scope = appScope,
            session = ParkingSession(
                integrator = Domain.integrator,
                analyzer = Domain.analyzer,
                floorEstimator = Domain.floorEstimator,
                simplifier = Domain.simplifier,
                entryDetector = Domain.newEntryDetector(),
            ),
            lots = RemoteParkingLotRepository(api),
            records = RecordStore(this, appScope),
            settingsStore = SettingsStore(this),
            liveSource = LiveSignalSource(carSignals, vehicle),
            // 경유지를 받으면 Pleos 내비가 앞으로 뜬다 — 주행 중엔 내비가 앞에 있는 게 맞으므로 그대로 둔다
            addWaypoint = { s -> navi.addWaypoint(s.lot.location.lat, s.lot.location.lng, s.lot.name) },
            outbox = Outbox(java.io.File(filesDir, "outbox.json"), api, deviceToken = { device.token }, scope = appScope),
            shareService = ShareService(api, BuildConfig.WEB_BASE_URL),
            currentLocation = naviLocation,
            currentAddress = navi.location.map { it?.address?.takeIf { a -> a.isNotBlank() } }.stateIn(appScope, SharingStarted.Eagerly, null),
            phoneLink = PhoneLink(api, device, vehicleName = { VehicleSpecs.find(modelName)?.name }),
            devicePaired = { device.paired },
            pairedPhoneName = { device.phoneName },
            kingApi = api,
            device = device,
            demoFlags = if (BuildConfig.DEMO_SEED) com.parkinggack.app.data.DemoFlags(this) else null,
        )
    }
}
