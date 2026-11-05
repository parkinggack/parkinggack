package com.parkinggack.app.session

import android.util.Log
import com.parkinggack.app.car.UxRestriction
import com.parkinggack.app.data.DeviceTokens
import com.parkinggack.app.model.KingBoard
import com.parkinggack.app.model.KingCopy
import com.parkinggack.app.model.KingRow
import com.parkinggack.app.model.KingScoreParts
import com.parkinggack.app.model.KingStanding
import com.parkinggack.app.model.KingUi
import com.parkinggack.app.net.ApiClient
import com.parkinggack.app.net.ApiResult
import com.parkinggack.app.net.KingBoardDto
import com.parkinggack.app.net.KingMeDto
import com.parkinggack.app.data.Outbox
import com.parkinggack.app.data.ParkingLotRepository
import com.parkinggack.app.data.RecordStore
import com.parkinggack.app.data.RecordUpload
import com.parkinggack.app.data.SettingsStore
import com.parkinggack.app.data.VehicleClass
import com.parkinggack.app.domain.distanceMeters
import com.parkinggack.app.domain.PlaceName
import com.parkinggack.app.model.CardTiming
import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.LotSuggestion
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.UserSettings
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec
import com.parkinggack.app.net.RatingRequest
import com.parkinggack.app.share.ShareService
import com.parkinggack.app.share.ShareTarget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/** 화면 스택 항목 (기획서 화면 ID) */
sealed interface Screen {
    data object Onboarding : Screen          // C-11
    data object Home : Screen                // C-01
    data object DestinationCard : Screen     // C-02
    data object EasierLots : Screen          // C-03
    data object Parked : Screen              // C-05
    data object ZonePicker : Screen          // C-06
    data object SendToPhone : Screen         // C-07
    data class LotDetail(val lotId: String) : Screen // C-08
    data object History : Screen             // C-09
    data object Settings : Screen            // C-10
    data object Replay : Screen              // C-12 (current 기록)
    data object PhoneLink : Screen           // 폰 연결 (설정에서, 시안 없음)
    data object King : Screen                // C-13 주차왕
}

/** C-08 별점 시트 상태 */
data class RatingState(val lot: ParkingLot, val sentStars: Int? = null)

data class AppUiState(
    val stack: List<Screen> = listOf(Screen.Home),
    val ux: UxRestriction = UxRestriction.UNKNOWN,
    val drive: DriveState = DriveState.Idle,
    val destinationName: String? = null,
    val destinationLot: ParkingLot? = null,
    /** C-03 후보 (목적지 정해지면 서버에서 받아 둠) */
    val suggestions: List<LotSuggestion> = emptyList(),
    val suggestionsLoading: Boolean = false,
    val waypoint: LotSuggestion? = null,
    /** C-08 에 보여 줄 주차장 (캐시 → 서버 상세로 갱신) */
    val lotDetail: ParkingLot? = null,
    val rating: RatingState? = null,
    /** C-01 자주 가는 곳 */
    val favorites: List<ParkingLot> = emptyList(),
    /** C-05가 떠 있을 때의 결과 */
    val parked: ParkingResult? = null,
    /** C-05~C-07, C-12가 다루는 기록 (저장 전이면 draft) */
    val current: ParkingRecord? = null,
    val currentSaved: Boolean = false,
    val autoSaveMsLeft: Long = 0,
    /** 지금 도는 자동 저장의 전체 시간 (진행 막대 비율용) */
    val autoSaveTotalMs: Long = 3_000,
    /** C-07 링크 (오프라인 링크 → 서버 짧은 링크로 교체) */
    val share: ShareTarget? = null,
    val vehicleName: String = VehicleSpec().name,
    /** C-10 "폰 연결 · 연결됨" 문구 */
    val phoneLinkLabel: String = "아직 연결 안 됨",
    /** 폰과 연결돼 있음 (C-10 '연결 끊기'를 보여 줄지) */
    val phonePaired: Boolean = false,
    /** C-13 주차왕 */
    val king: KingUi = KingUi.Loading,
    /** C-01 "주차왕 이번 주 12등" to "상위 8%" (참여 중일 때만) */
    val kingHome: Pair<String, String?>? = null,
    /** C-05 "주차왕 이번 주 12등 → 10등" */
    val parkedKingLine: String? = null,
    val demoRunning: Boolean = false,
) {
    val screen get() = stack.last()
    /** 주행 중(또는 기록 중)엔 C-04 오버레이만 */
    val showDrivingOverlay get() = ux.isDriving || drive is DriveState.Driving || drive is DriveState.Recording
    val bannerText: String?
        // 목적지·경유지 모두 "★4.3 어려움"처럼 별점 + 난이도 단어 (색이 아니라 단어로)
        get() = waypoint?.let { w -> listOfNotNull("경유지 ${w.lot.name.substringBefore(' ')}", w.lot.difficulty?.let { "${it.starText} ${it.label}" }).joinToString(" ") }
            ?: destinationLot?.difficulty?.let { "도착지 주차 ${it.starText} ${it.label}" }
    /** 주차를 기록할 주차장 (경유지 > 목적지) */
    val targetLot: ParkingLot? get() = waypoint?.lot ?: destinationLot
}

/**
 * 앱 오케스트레이터. 플로우 전체를 잇는다:
 *  내비 목적지 → 서버 매칭 → C-02 → C-03(서버 추천) → 내비 경유지
 *  → 신호 → ParkingSession(진입 감지에 목적지까지 거리 사용) → C-04 → P → C-05 → 저장
 *  → 익명 기록 업로드(동의 시, 오프라인이면 대기열) → 서버 점수 갱신
 *  → C-07 짧은 링크(서버) / 오프라인 링크 → 폰 M-01·M-02
 *  C-08 상세(서버 통계)·별점, C-09 기록 → C-12 리플레이
 * Activity보다 오래 사는 Application 범위.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppController(
    private val scope: CoroutineScope,
    private val session: ParkingSession,
    private val lots: ParkingLotRepository,
    private val records: RecordStore,
    private val settingsStore: SettingsStore,
    liveSource: SignalSource,
    private val addWaypoint: (LotSuggestion) -> Boolean,
    private val outbox: Outbox? = null,
    private val shareService: ShareService? = null,
    /** 내비가 아는 현재 위치 (진입 감지용 목적지까지 거리) */
    private val currentLocation: StateFlow<LatLng?> = MutableStateFlow(null),
    /** 내비가 아는 현재 위치의 주소 (목적지 없이 댄 주차에 이름 붙이기) */
    private val currentAddress: StateFlow<String?> = MutableStateFlow(null),
    /** 차 ↔ 폰 페어링 (서버 없으면 null) */
    private val phoneLink: PhoneLink? = null,
    /** 폰과 연결됐는지 (연결돼 있으면 저장할 때마다 내 주차를 서버로 동기화) */
    private val devicePaired: () -> Boolean = { false },
    private val pairedPhoneName: () -> String? = { null },
    /** 주차왕 (서버 없으면 null) */
    private val kingApi: ApiClient? = null,
    private val device: DeviceTokens? = null,
    /** 첫 실행 때 예시 기록을 넣을지 (BuildConfig.DEMO_SEED) + 넣었는지 기억하는 곳. null 이면 안 넣음 */
    private val demoFlags: com.parkinggack.app.data.DemoFlags? = null,
    private val autoSaveMs: Long = 3_000,
    private val flushIntervalMs: Long = 60_000,
) {
    private val _ui = MutableStateFlow(AppUiState(stack = listOf(if (settingsStore.settings.value.onboarded) Screen.Home else Screen.Onboarding)))
    val ui: StateFlow<AppUiState> = _ui.asStateFlow()
    val recordList get() = records.records
    /** 기록 파일을 다 읽었는지 (RecordStore는 메인 스레드 밖에서 읽는다) */
    val recordsReady: StateFlow<Boolean> get() = records.ready
    val settings get() = settingsStore.settings
    fun lot(id: String) = lots.cached(id)

    private val live = liveSource
    private val source = MutableStateFlow(live)
    private var autoSaveJob: Job? = null
    private var demoAfterCard: List<VehicleSample>? = null
    private var demoSpeed = 1.0
    private var vehicleClass = VehicleClass.UNKNOWN
    private var phoneLinkJob: Job? = null
    val phoneLinkState: StateFlow<PhoneLinkState>? get() = phoneLink?.state

    init {
        updatePhoneLinkLabel()
        scope.launch { delay(1_500); refreshKingHome() }
        // 심사·시연용 예시 기록 — 첫 실행 한 번만 (id "seed-…", 서버로 안 감). 기록 모두 지우기 뒤엔 다시 안 넣음
        demoFlags?.let { f -> if (!f.seeded) { f.seeded = true; seedDemo() } }
        scope.launch {
            // 거리: 재생은 시나리오 값, Live는 현재 위치 → 기록 대상 주차장
            source.flatMapLatest { src -> src.withDistance.map { (s, d) -> Triple(s, d, src === live) } }.collect { (s, d, isLive) ->
                if (isLive) endStaleDemo(s)
                val toTarget = d ?: distanceToTarget()
                // P 순간 기록 대상 주차장이 맞는지(멀면 버림, 1-5): Live는 내비 현재 위치로, 재생은 시나리오 거리만 믿는다(없으면 모름)
                session.onSample(s, toTarget, targetDistanceM = if (isLive) toTarget else d)
                if (!isLive) moveDemoCar(d)
            }
        }
        scope.launch { session.state.collect(::onDriveState) }
        scope.launch { records.records.collect { refreshFavorites(it) } }
        // 대기열: 시작할 때 + 주기적으로 (기록·별점은 enqueue 때 바로 한 번 더)
        scope.launch { while (true) { flushOutbox(); delay(flushIntervalMs) } }
    }

    // ---------- 외부 입력 ----------

    fun onUxRestrictions(ux: UxRestriction) = _ui.update { it.copy(ux = ux) }

    /** AAOS INFO_MODEL로 찾은 차종 → 궤적 보정 + 설정 화면 표시 + 서버 난이도 보정 등급 */
    fun onVehicleSpec(spec: VehicleSpec?, autoDetected: Boolean) {
        val s = spec ?: VehicleSpec()
        session.vehicleSpec = s
        vehicleClass = RecordUpload.classify(s)
        _ui.update { it.copy(vehicleName = if (autoDetected && spec != null) "${s.name} · 자동 인식" else s.name) }
    }

    /** 내비 목적지가 바뀜 (NaviHelper.onDestinationInfo). 서버에서 주차장을 찾고, 찾으면 C-02 */
    fun onDestination(name: String?, location: LatLng?) {
        // 시연 중에는 내비의 실제 목적지(대개 '없음')로 시연 목적지·경유지를 덮지 않는다.
        // (경유지를 넣으면 Pleos 내비가 앞으로 뜨면서 DestinationInfo(0.0, 0.0, name="")를 보낸다 — 2026-11-03 확인)
        if (_ui.value.demoRunning) return
        applyDestination(name, location)
    }

    private fun applyDestination(name: String?, location: LatLng?) {
        val none = name.isNullOrBlank() && (location == null || (location.lat == 0.0 && location.lng == 0.0))
        if (none) {
            // 배너만 내린다. 기록에 붙일 주차장(session.targetLot)은 그대로 — 도착해 경로가 끝난 뒤 주차하는 경우가 많다
            _ui.update { it.copy(destinationName = null, destinationLot = null, waypoint = null, suggestions = emptyList()) }
            return
        }
        val prev = _ui.value
        _ui.update { it.copy(destinationName = name) }
        scope.launch {
            val lot = lots.match(name, location)
            if (_ui.value.destinationName != name) return@launch // 그 사이 목적지가 또 바뀜
            // 같은 목적지가 다시 오면(경유지를 넣은 뒤 등) 고른 경유지를 유지하고 카드도 다시 띄우지 않는다
            val same = lot != null && lot.id == prev.destinationLot?.id
            val waypoint = if (same) prev.waypoint else null
            session.targetLot = waypoint?.lot ?: lot
            _ui.update {
                it.copy(
                    destinationName = name?.takeIf { n -> n.isNotBlank() } ?: lot?.name,
                    destinationLot = lot, waypoint = waypoint,
                    suggestions = if (same) it.suggestions else emptyList(),
                )
            }
            if (lot == null) { maybeStartDemoDrive(); return@launch }
            if (same) return@launch
            loadSuggestions(lot)
            if (shouldShowCard(lot) && !_ui.value.showDrivingOverlay) push(Screen.DestinationCard)
            else maybeStartDemoDrive() // 카드를 안 띄우면 시연은 바로 출발
        }
    }

    /** 경유지(쉬운 주차장) 도착 → 그 주차장을 기록 대상으로 */
    fun onWaypointArrived() { _ui.value.waypoint?.lot?.let { session.targetLot = it } }

    private fun shouldShowCard(lot: ParkingLot): Boolean {
        val s = settingsStore.settings.value
        val novice = s.experience == DrivingExperience.UNDER_1Y
        return when (s.cardTiming) {
            CardTiming.NEVER -> false
            CardTiming.ALWAYS -> true
            // 데이터 부족도 안내. 초보는 '보통'부터 미리 알려 줌 (온보딩: "초보라면 조금 덜 까다로운 곳부터")
            CardTiming.HARD_ONLY -> lot.difficulty?.let { it.isHard || (novice && it.score >= 2.5) } ?: true
        }
    }

    private fun loadSuggestions(lot: ParkingLot) {
        _ui.update { it.copy(suggestionsLoading = true) }
        scope.launch {
            val list = lots.easier(lot)
            if (_ui.value.destinationLot?.id == lot.id) _ui.update { it.copy(suggestions = list, suggestionsLoading = false) }
        }
    }

    private fun distanceToTarget(): Double? {
        val here = currentLocation.value ?: return null
        // 세션의 기록 대상이 먼저 — 내비 경로가 끝나 배너가 내려간 뒤(도착 후 주차)에도 남아 있다
        val target = session.targetLot ?: _ui.value.targetLot ?: return null
        return distanceMeters(here, target.location)
    }

    // ---------- 세션 결과 ----------

    private fun onDriveState(d: DriveState) {
        _ui.update { it.copy(drive = d) }
        // 저장 안 된 C-05 초안이 남은 채로 다시 출발·새 주차·시연 시작 → 먼저 저장 (기록을 잃지 않게, 1-1의 안전망)
        if (d !is DriveState.Parked || _ui.value.parked?.endedAtMs != d.result.endedAtMs) {
            saveDraftIfPending(acknowledge = d !is DriveState.Parked, reason = d::class.simpleName ?: "state")
        }
        if (d is DriveState.Parked) {
            val r = d.result
            val draft = ParkingRecord(
                // 시연 재생 중 주차는 "demo-" — 서버·주차왕으로 보내지 않음 (staysOnDevice). 재생은 P 뒤 1초 더 이어져 아직 true
                id = (if (_ui.value.demoRunning) ParkingRecord.DEMO_ID_PREFIX else "") + UUID.randomUUID(),
                lotId = r.lot?.id, lotName = r.lot?.name ?: ParkingRecord.UNKNOWN_PLACE,
                floor = r.estimate.floor, zone = null, number = null,
                parkedAtMs = System.currentTimeMillis(), summary = r.summary, trajectory = r.trajectory,
            )
            autoSaveWithoutFloor = false
            _ui.update { it.copy(parked = r, current = draft, currentSaved = false, share = null, parkedKingLine = null) }
            r.droppedFarTarget?.let { Log.i(TAG, "target ${it.id} is far from where we parked → find the lot by place") }
            if (r.lot == null) nameByPlace(draft.id)
            if (settingsStore.settings.value.showParkedCard) {
                replaceTop(Screen.Parked)
                // 층을 모를 때(LOW)도 기록을 잃지 않게: 층 버튼을 먼저 보여 주고, 고르지 않으면 조금 더 기다렸다 층 없이 저장
                if (r.estimate.confidence != Confidence.LOW) startAutoSave()
                else startAutoSave(LOW_CONFIDENCE_SAVE_MS, withoutFloor = true)
            } else save(draft)
        }
    }

    private fun startAutoSave(totalMs: Long = autoSaveMs, withoutFloor: Boolean = false) {
        autoSaveJob?.cancel()
        autoSaveWithoutFloor = withoutFloor
        autoSaveJob = scope.launch {
            var left = totalMs
            while (left > 0) { _ui.update { it.copy(autoSaveMsLeft = left, autoSaveTotalMs = totalMs) }; delay(100); left -= 100 }
            _ui.update { it.copy(autoSaveMsLeft = 0) }
            _ui.value.current?.let { save(if (withoutFloor) it.copy(floor = null) else it) }
        }
    }

    /**
     * 목적지 없이 댄 주차: P 순간 위치로 아는 주차장(서버 기준 250 m 안)을 찾아 붙이고, 없으면 내비 주소 끝부분을 이름으로.
     * 안 하면 C-09에 '주차 위치'만 줄줄이 남고, 주차장이 없는 기록은 난이도 집계(RecordUpload)·주차왕 '가 본 주차장'에서 빠진다.
     * 그 사이 운전자가 층·구역을 골랐어도 지우지 않게 주차장 칸만 바꾼다.
     */
    private fun nameByPlace(recordId: String) {
        val here = currentLocation.value
        val address = currentAddress.value
        scope.launch {
            val lot = here?.let { runCatching { lots.match(null, it) }.getOrNull() }
            val name = lot?.name ?: PlaceName.fromAddress(address) ?: return@launch
            fun ParkingRecord.named() =
                if (id == recordId && lotId == null && lotName == ParkingRecord.UNKNOWN_PLACE) copy(lotId = lot?.id, lotName = name) else this
            _ui.update { s -> s.copy(current = s.current?.named()) }
            Log.i(TAG, "place: ${recordId.take(13)} -> ${lot?.id ?: "address"}")
            // 이미 저장됐으면(자동 저장·맞아요) 저장본도 고치고 다시 보냄 — 같은 id라 서버는 덮어씀
            val stored = records.records.value.firstOrNull { it.id == recordId } ?: return@launch
            val named = stored.named()
            if (named === stored) return@launch
            records.upsert(named)
            enqueueUpload(named)
            enqueueSync(named)
        }
    }

    /**
     * 예시 기록(DemoSeed)을 지금 시각 기준으로 다시 넣는다 — 예전 예시는 지우고 실제 기록은 그대로.
     * 첫 실행 때 자동, 또는 adb 인텐트 `--ez seedDemo true` (scripts/demo.sh seed)
     */
    fun seedDemo() {
        scope.launch {
            val list = withContext(Dispatchers.Default) { DemoSeed.records() }
            records.removeWhere { it.id.startsWith(ParkingRecord.SEED_ID_PREFIX) }
            records.upsertAll(list)
            Log.i(TAG, "demo seed: ${list.size} records")
        }
    }

    private fun stopAutoSave() { autoSaveJob?.cancel(); autoSaveJob = null; _ui.update { it.copy(autoSaveMsLeft = 0) } }

    /** 자동 저장이 층 없이 저장할 것이었는지 (층을 모를 때 C-05) */
    private var autoSaveWithoutFloor = false

    /**
     * C-05 초안이 아직 저장 전이면 지금 저장한다 (자동 저장이 저장할 내용 그대로).
     * C-12(동선 크게 보기)·C-06(다른 층이에요)로 가면서 자동 저장을 멈추기만 하고 저장하지 않아,
     * 돌아온 C-05는 "1초 뒤"에서 멈추고 뒤로/출발하면 기록이 사라졌다 (docs/sim-findings.md 1-1)
     */
    private fun saveDraftIfPending(acknowledge: Boolean = true, reason: String = "user") {
        val ui = _ui.value
        val draft = ui.current ?: return
        if (ui.currentSaved || ui.parked == null) return
        stopAutoSave()
        Log.i(TAG, "draft ${draft.id.take(13)} saved now ($reason)")
        save(if (autoSaveWithoutFloor) draft.copy(floor = null) else draft, acknowledge)
    }

    private fun save(r: ParkingRecord, acknowledge: Boolean = true) {
        val firstSave = !_ui.value.currentSaved || _ui.value.current?.id != r.id
        records.upsert(r)
        _ui.update { it.copy(current = r, currentSaved = true) }
        if (_ui.value.parked != null) {
            if (acknowledge) session.acknowledgeParked()
            // 도착해서 주차까지 마쳤으니 이번 목적지·경유지는 끝 (다음 주행 배너에 남지 않게)
            if (firstSave) { _ui.update { it.copy(destinationName = null, destinationLot = null, waypoint = null, suggestions = emptyList()) }; session.targetLot = null }
        }
        enqueueUpload(r)
        enqueueSync(r)
    }

    /** 연결된 폰으로 내 주차 동기화 (PUT /v1/me/parkings/:id). 시연·예시 기록(staysOnDevice)은 보내지 않음 */
    private fun enqueueSync(r: ParkingRecord) {
        // 폰과 연결됐거나 주차왕에 참여 중이면 (점수를 매기려면 주차가 서버에 있어야 함)
        if (outbox == null || !(devicePaired() || device?.kingJoined == true) || r.staysOnDevice) return
        outbox.enqueueParking(r.id, com.parkinggack.app.data.MyParkingSync.input(r))
        scope.launch { flushOutbox() }
    }

    private fun updatePhoneLinkLabel() = _ui.update {
        val paired = devicePaired()
        it.copy(phoneLinkLabel = if (paired) "연결됨" + (pairedPhoneName()?.let { n -> " · $n" } ?: "") else "아직 연결 안 됨", phonePaired = paired)
    }

    // C-10 › 폰 연결 (C-13)
    fun openPhoneLink() {
        push(Screen.PhoneLink)
        startPhoneLink()
    }

    fun startPhoneLink() {
        val link = phoneLink ?: return
        phoneLinkJob?.cancel()
        phoneLinkJob = scope.launch {
            if (link.run()) {
                updatePhoneLinkLabel()
                // 연결 직후 최근 기록을 폰으로 (홈 "지금 주차 중"·기록 화면이 바로 차도록)
                records.records.value.filterNot { it.staysOnDevice }.take(20).reversed().forEach(::enqueueSync)
            }
        }
    }

    fun closePhoneLink() { phoneLinkJob?.cancel(); phoneLinkJob = null; back() }

    /** 익명 기록 업로드 (설정에서 동의한 경우만). 층·구역을 고쳐 다시 저장해도 같은 id라 서버가 중복 처리 */
    private fun enqueueUpload(r: ParkingRecord) {
        val s = settingsStore.settings.value
        if (r.staysOnDevice) { Log.i(TAG, "upload: ${r.id.take(13)} stays on device (demo)"); return }
        if (!s.shareAnonymous || outbox == null) return
        val dto = RecordUpload.from(r, vehicleClass, s.experience) ?: return
        Log.i(TAG, "upload: ${r.id.take(13)} queued")
        outbox.enqueueRecord(dto)
        scope.launch { flushOutbox() }
    }

    private suspend fun flushOutbox() {
        val box = outbox ?: return
        if (box.size == 0) return
        var kingChanged = false
        val sent = box.flush(
            onScore = { score -> lots.applyScore(score.id, score.difficulty, score.sampleCount, score.ratingCount) },
            onParkingSynced = { id, before, after ->
                if (after != null) kingChanged = true
                if (_ui.value.current?.id == id) KingCopy.parkedLine(before, after)?.let { line -> _ui.update { it.copy(parkedKingLine = line) } }
            },
        )
        if (kingChanged) scope.launch { refreshKingHome() }
        if (sent > 0) {
            Log.i(TAG, "outbox sent $sent, left ${box.size}")
            refreshFavorites(records.records.value)
            _ui.value.lotDetail?.let { d -> lots.cached(d.id)?.let { c -> _ui.update { it.copy(lotDetail = c.copy(stats = c.stats ?: d.stats)) } } }
        }
    }

    // ---------- 화면 액션 ----------

    fun back() {
        val before = _ui.value
        _ui.update { if (it.stack.size > 1) it.copy(stack = it.stack.dropLast(1), rating = null) else it }
        afterLeavingCard(before)
    }
    fun push(s: Screen) = _ui.update { if (it.screen == s) it else it.copy(stack = it.stack + s) }
    private fun replaceTop(s: Screen) = _ui.update {
        it.copy(stack = (if (it.screen is Screen.DestinationCard || it.screen is Screen.EasierLots) it.stack.dropLast(1) else it.stack) + s)
    }
    fun goHome() {
        val before = _ui.value
        _ui.update { it.copy(stack = listOf(Screen.Home), rating = null) }
        afterLeavingCard(before)
    }

    /**
     * 시연 C-02·C-03을 어떤 길로 닫든(뒤로 키·아이콘 메뉴 포함) '괜찮아요'와 같게 주행 재생을 시작한다.
     * 예전엔 뒤로 키로 닫으면 재생이 시작되지 않아 시연 상태(현대백화점 목적지·demo- 기록)가 프로세스가 죽을 때까지 남았다 (1-4)
     */
    private fun afterLeavingCard(before: AppUiState) {
        fun AppUiState.hasCard() = stack.any { it == Screen.DestinationCard || it == Screen.EasierLots }
        if (before.hasCard() && !_ui.value.hasCard()) maybeStartDemoDrive()
    }

    fun finishOnboarding(s: UserSettings) { settingsStore.update(s.copy(onboarded = true)); goHome(); syncSettings(rejoinKing = false) }
    fun updateSettings(s: UserSettings) {
        val prev = settingsStore.settings.value
        settingsStore.update(s)
        if (prev.experience != s.experience || prev.shareAnonymous != s.shareAnonymous) syncSettings(rejoinKing = prev.experience != s.experience)
    }
    fun clearRecords() = records.clear()

    // C-01
    private fun refreshFavorites(history: List<ParkingRecord>) {
        // 내 기록에서 자주 간 주차장 Top3 → 서버 최신 점수. 기록이 없으면 비워 둔다 (가짜 '자주 가는 곳' 없음 → C-01 빈 상태 문구)
        val ids = history.mapNotNull { it.lotId }.groupingBy { it }.eachCount()
            .entries.sortedByDescending { it.value }.take(3).map { it.key }
        val immediate = ids.mapNotNull { lots.cached(it) }
        _ui.update { it.copy(favorites = immediate) }
        scope.launch {
            val fresh = immediate.map { lots.detail(it.id) ?: it }
            _ui.update { it.copy(favorites = fresh) }
        }
    }

    // C-02
    fun showEasier() {
        if (_ui.value.showDrivingOverlay) return
        _ui.value.destinationLot?.let { if (_ui.value.suggestions.isEmpty()) loadSuggestions(it) }
        push(Screen.EasierLots)
    }
    fun dismissCard() { goHome(); maybeStartDemoDrive() }

    // C-03 / C-08
    fun routeVia(s: LotSuggestion) {
        val ok = addWaypoint(s)
        Log.i(TAG, "addWaypoint ${s.lot.name} -> $ok")
        session.targetLot = s.lot
        _ui.update { it.copy(waypoint = s) }
        goHome(); maybeStartDemoDrive()
    }

    fun routeViaLot(lot: ParkingLot) {
        val s = _ui.value.suggestions.firstOrNull { it.lot.id == lot.id } ?: LotSuggestion(lot, 0, "")
        routeVia(s)
    }

    // C-08
    fun openLot(id: String) {
        _ui.update { it.copy(lotDetail = lots.cached(id)) }
        push(Screen.LotDetail(id))
        scope.launch {
            val d = lots.detail(id) ?: return@launch
            if ((_ui.value.screen as? Screen.LotDetail)?.lotId == id) _ui.update { it.copy(lotDetail = d) }
        }
    }

    fun openRating(lot: ParkingLot) = _ui.update { it.copy(rating = RatingState(lot)) }
    fun closeRating() = _ui.update { it.copy(rating = null) }
    fun submitRating(stars: Int) {
        val r = _ui.value.rating ?: return
        outbox?.enqueueRating(r.lot.id, RatingRequest(UUID.randomUUID().toString(), stars.coerceIn(1, 5)))
        _ui.update { it.copy(rating = r.copy(sentStars = stars)) }
        scope.launch {
            flushOutbox()
            delay(1_500)
            if (_ui.value.rating?.sentStars == stars) closeRating()
        }
    }

    // C-05
    fun confirmFloor() { stopAutoSave(); _ui.value.current?.let(::save); goHome() }
    fun otherFloor() { saveDraftIfPending(); push(Screen.ZonePicker) } // C-06에서 고르면 같은 id로 덮어씀
    fun pickFloor(f: String) { stopAutoSave(); _ui.value.current?.copy(floor = f)?.let(::save); push(Screen.ZonePicker) }
    fun rememberZone() { stopAutoSave(); _ui.value.current?.let(::save); push(Screen.ZonePicker) }
    fun sendToPhone() { stopAutoSave(); (_ui.value.current ?: records.latest)?.let { save(it); openShare(it) } }
    fun openReplay() { saveDraftIfPending(); push(Screen.Replay) }

    // C-06 저장 → C-07 폰으로 보내기 (시안 흐름). C-07의 '닫기'가 홈으로
    fun saveZone(floor: String, zone: String?, number: String?) {
        val r = (_ui.value.current ?: records.latest)?.copy(floor = floor, zone = zone, number = number)
        r?.let(::save)
        _ui.update { it.copy(stack = it.stack.dropLastWhile { s -> s == Screen.ZonePicker }) }
        if (r != null) openShare(r) else goHome()
    }

    // C-07 (C-01·C-05에서)
    fun openLatestForPhone() { records.latest?.let { r -> _ui.update { it.copy(current = r, currentSaved = true, parked = null) }; openShare(r) } }

    private fun openShare(r: ParkingRecord) {
        val svc = shareService
        _ui.update { it.copy(share = svc?.offline(r)) }
        push(Screen.SendToPhone)
        if (svc != null) scope.launch {
            val short = svc.shorten(r) ?: return@launch
            if (_ui.value.current?.id == r.id) _ui.update { it.copy(share = short) }
        }
    }

    // C-09 → C-12
    fun openRecordReplay(r: ParkingRecord) {
        if (r.summary == null) return
        _ui.update { it.copy(current = r, currentSaved = true, parked = null) }
        push(Screen.Replay)
    }

    // ---------- C-13 주차왕 ----------

    fun openKing() {
        if (_ui.value.screen != Screen.King) push(Screen.King)
        loadKing()
    }

    fun loadKing() {
        val api = kingApi ?: run { _ui.update { it.copy(king = KingUi.Offline) }; return }
        if (_ui.value.king !is KingUi.Joined) _ui.update { it.copy(king = KingUi.Loading) }
        scope.launch {
            val token = phoneLink?.ensureToken() ?: run { _ui.update { it.copy(king = KingUi.Offline) }; return@launch }
            when (val me = api.kingMe(token)) {
                is ApiResult.Ok -> if (me.value.joined) {
                    device?.kingJoined = true
                    val standing = me.value.toStanding()
                    _ui.update { it.copy(king = KingUi.Joined(standing, (it.king as? KingUi.Joined)?.board), kingHome = KingCopy.homeLine(standing)) }
                    val board = (api.kingBoard(token) as? ApiResult.Ok)?.value?.toBoard()
                    _ui.update { it.copy(king = KingUi.Joined(standing, board)) }
                } else {
                    device?.kingJoined = false
                    val nick = (api.kingNickname(null) as? ApiResult.Ok)?.value?.nickname ?: "판교 느긋한 수달"
                    _ui.update { it.copy(king = KingUi.NotJoined(nick, leagueLabel()), kingHome = null) }
                }
                else -> _ui.update { it.copy(king = KingUi.Offline) }
            }
        }
    }

    fun rerollKingNickname() {
        val cur = _ui.value.king as? KingUi.NotJoined ?: return
        val api = kingApi ?: return
        scope.launch {
            val nick = (api.kingNickname(null) as? ApiResult.Ok)?.value?.nickname ?: return@launch
            _ui.update { it.copy(king = cur.copy(nickname = nick)) }
        }
    }

    fun joinKing() {
        val cur = _ui.value.king as? KingUi.NotJoined ?: return
        val api = kingApi ?: return
        _ui.update { it.copy(king = cur.copy(joining = true)) }
        scope.launch {
            val token = phoneLink?.ensureToken() ?: run { _ui.update { it.copy(king = KingUi.Offline) }; return@launch }
            // 리그(동네 × 경력)는 참여할 때 서버 설정의 경력으로 정해진다 → C-13 카드에 보여 준 이 차의 경력을 먼저 보낸다 (2-1)
            pushSettings(api, token)
            when (api.kingJoin(token, cur.nickname)) {
                is ApiResult.Ok -> {
                    device?.kingJoined = true
                    // 이번 주 점수가 바로 생기도록 최근 주차를 서버로 (시드 예시 기록은 제외)
                    records.records.value.filterNot { it.staysOnDevice }.take(20).reversed().forEach(::enqueueSync)
                    flushOutbox()
                    loadKing()
                }
                else -> _ui.update { it.copy(king = cur.copy(joining = false)) }
            }
        }
    }

    /** C-13 주차왕 그만두기 — 순위판에서 바로 빠짐 (기록·지난 결과는 서버에 그대로). 폰 없이 차만 쓰는 사람도 되돌릴 수 있게 (3-5) */
    fun leaveKing() {
        val api = kingApi ?: return
        val token = device?.token ?: return
        scope.launch {
            if (api.leaveKing(token) is ApiResult.Ok) {
                device.kingJoined = false
                _ui.update { it.copy(kingHome = null) }
                loadKing()
            }
        }
    }

    /** C-10 폰 연결 끊기 — 이 차에 연결된 폰 모두 (차 토큰은 그대로). 성공하면 true를 [done]으로 */
    fun unlinkPhone(done: (Boolean) -> Unit = {}) {
        val api = kingApi
        val token = device?.token
        if (api == null || token == null) { done(false); return }
        scope.launch {
            val ok = api.unlinkPhones(token) is ApiResult.Ok
            if (ok) { device.paired = false; device.phoneName = null; updatePhoneLinkLabel() }
            done(ok)
        }
    }

    /**
     * 이 차의 경력·익명 기록 설정을 서버 '같이 쓰는 설정'(PATCH /v1/me/settings)으로.
     * 차 앱은 이걸 보내지 않아 서버엔 늘 UNKNOWN → 주차왕이 '판교 모두' 리그로 들어갔다 (2-1).
     * 아직 서버에 이 차가 없으면(폰 연결·주차왕 전) 보낼 곳이 없다 — 참여할 때 보낸다.
     * 경력이 바뀌었고 참여 중이면 같은 닉네임으로 다시 참여해 리그를 옮긴다 (서버는 참여할 때 리그를 고정)
     */
    private fun syncSettings(rejoinKing: Boolean) {
        val api = kingApi ?: return
        val token = device?.token ?: return
        scope.launch {
            if (!pushSettings(api, token) || !rejoinKing || device.kingJoined != true) return@launch
            val nick = (api.kingMe(token) as? ApiResult.Ok)?.value?.takeIf { it.joined }?.nickname ?: return@launch
            if (api.kingJoin(token, nick) is ApiResult.Ok) refreshKingHome()
        }
    }

    private suspend fun pushSettings(api: ApiClient, token: String): Boolean {
        val s = settingsStore.settings.value
        val r = api.patchSettings(token, com.parkinggack.app.net.SettingsPatchDto(shareAnonymous = s.shareAnonymous, experience = s.experience.name))
        Log.i(TAG, "settings -> server: ${s.experience} share=${s.shareAnonymous} (${r::class.simpleName})")
        return r is ApiResult.Ok
    }

    private suspend fun refreshKingHome() {
        val api = kingApi ?: return
        val token = device?.token ?: return
        val me = (api.kingMe(token) as? ApiResult.Ok)?.value ?: return
        device.kingJoined = me.joined
        _ui.update { it.copy(kingHome = if (me.joined) KingCopy.homeLine(me.toStanding()) else null) }
    }

    /** "판교 · 1년 미만" — 서버 리그와 같은 규칙(동네는 아직 판교만) */
    private fun leagueLabel(): String {
        val e = settingsStore.settings.value.experience
        return "판교 · " + if (e == DrivingExperience.UNKNOWN) "모든 경력" else e.label // 서버 leagueOf().longLabel 과 같은 말
    }

    // ---------- 시연 모드 ----------

    /**
     * 시연: 목적지 설정(현대백화점) → C-02 → (C-03 선택) → 출발 → 녹화 신호 재생 → C-04 → C-05.
     * 에뮬레이터에서 차속을 바꿀 수 없어도 같은 흐름을 보여 주기 위함. 재생이 끝나면 Live 신호로 돌아감.
     * 실행: adb shell am start -n com.parkinggack.app/.ui.MainActivity --es demo main
     */
    fun startDemo(
        samples: List<VehicleSample>,
        speedFactor: Double = 1.0,
        withDestination: Boolean = true,
        /** 샘플별 주차장 입구까지 거리 (Scenario.distanceToTargetM) — 진입 감지 규칙 A용. 목적지 카드를 건너뛰어도 같이 씀 */
        distances: List<Double?> = emptyList(),
    ) {
        saveDraftIfPending(acknowledge = false, reason = "demo start")
        session.reset(); stopAutoSave()
        demoDistances = distances
        _ui.update { it.copy(stack = listOf(Screen.Home), parked = null, current = null, share = null, demoRunning = true) }
        if (withDestination) {
            demoAfterCard = samples
            demoSpeed = speedFactor
            applyDestination("현대백화점 판교점", null) // 매칭되면 C-02, 아니면 바로 출발 (시연 중 가드를 거치지 않게)
        } else play(samples, speedFactor)
    }

    private var demoDistances: List<Double?> = emptyList()

    private fun maybeStartDemoDrive() {
        val s = demoAfterCard ?: return
        demoAfterCard = null
        scope.launch { delay(1_500); play(s, demoSpeed) }
    }

    private fun play(samples: List<VehicleSample>, speedFactor: Double) {
        val replay = object : SignalSource {
            override val withDistance: Flow<Pair<VehicleSample, Double?>> =
                ReplaySignalSource(samples, speedFactor, demoDistances).withDistance
                    .onCompletion { scope.launch { delay(500); source.value = live; endDemo() } }
            override val samples: Flow<VehicleSample> = withDistance.map { it.first }
        }
        source.value = replay
    }

    /**
     * 시연이 끝나면 시연용 목적지(현대백화점)·경유지를 지운다. 남겨 두면 다음 실제 주차가 그 주차장으로 기록되고
     * C-04 배너가 내비 목적지 없이 계속 '도착지 ★4.3'을 보여 준다. (C-05 결과는 P 순간에 이미 계산됨)
     */
    private fun endDemo() {
        session.targetLot = null
        _demoCar.value = null
        _ui.update { it.copy(demoRunning = false, destinationName = null, destinationLot = null, waypoint = null, suggestions = emptyList()) }
    }

    fun stopDemo() { demoAfterCard = null; source.value = live; endDemo() }

    /**
     * 시연이 (재생 전 카드에서) 남아 있는데 실제 차가 움직이면 시연을 끝낸다.
     * 안 그러면 다음 실제 주차가 'demo-'로·시연 주차장(현대백화점)으로 기록된다 (1-4 안전망). 재생 중엔 Live 신호를 안 쓰므로 해당 없음
     */
    private fun endStaleDemo(s: VehicleSample) {
        if (!_ui.value.demoRunning || !s.gear.isMoving || s.speedMps < 0.5f) return
        Log.i(TAG, "demo: real driving while demo pending → stop demo")
        stopDemo()
    }

    private val _demoCar = MutableStateFlow<LatLng?>(null)
    /**
     * 시연 재생 중 지도의 내 차 (C-04·C-02). 에뮬레이터 GPS는 고정이라 시연 중 지도의 차가 서 있었다(3-7).
     * 시나리오의 '목적지까지 거리'만큼 목적지 남쪽에 두고 거리가 줄면 북쪽으로 다가간다. 거리가 없으면 그대로
     */
    val demoCarPosition: StateFlow<LatLng?> = _demoCar.asStateFlow()

    private fun moveDemoCar(distanceM: Double?) {
        if (distanceM == null) return
        val dest = (session.targetLot ?: _ui.value.targetLot)?.location ?: return
        val p = LatLng(dest.lat - distanceM.coerceAtLeast(0.0) / METERS_PER_DEG_LAT, dest.lng)
        val prev = _demoCar.value
        if (prev == null || distanceMeters(prev, p) >= 2.0) _demoCar.value = p
    }

    private companion object { const val TAG = "AppController" }
}

private fun KingMeDto.toStanding() = KingStanding(
    nickname = nickname.orEmpty(),
    leagueLabel = league?.label ?: "판교",
    rank = rank,
    total = total,
    percentile = percentile,
    score = score?.let { KingScoreParts(it.total, it.maneuver, it.lotsVisited, it.improvement) },
    prevWeekRank = prevWeekRank,
    nextHint = nextHint,
)

private fun KingBoardDto.toBoard() = KingBoard(
    top = top.map { KingRow(it.rank, it.nickname, it.score, it.isMe) },
    around = around.map { KingRow(it.rank, it.nickname, it.score, it.isMe) },
    demo = demo,
)

/** 층을 모를 때(C-05 신뢰도 낮음) 고르지 않으면 층 없이 저장하기까지 */
private const val LOW_CONFIDENCE_SAVE_MS = 8_000L

private const val METERS_PER_DEG_LAT = 111_320.0
