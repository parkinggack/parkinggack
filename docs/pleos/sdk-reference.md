# Pleos Connect API · SDK 레퍼런스

> 현대자동차그룹 차량용 앱 개발 공모전 개발용으로 정리한 문서 (팀 정리본, 2026-11-03)
> 출처: Pleos Playground 개발 문서(영문판), API 레퍼런스, 공식 샘플 앱 3종 소스 · 링크는 맨 아래
>
> **범례** ✅ 바로 사용 가능 · ⚠️ 조건부(승인·차종·미확인) · ❌ 사용 불가
> **주의** 함수명은 API 레퍼런스 목록을 그대로 옮긴 것(오타 포함).
> 정확한 시그니처(파라미터 타입·nullable 제외)는 **AAR에서 직접 뽑은 [`sdk-signatures/`](sdk-signatures/)** 를 볼 것.

## ⚡ AAR 직접 확인으로 바로잡은 사항 (2026-11-03)

| 항목 | 문서/기존 정리 | 실제 (AAR·컴파일로 확인) |
|---|---|---|
| 기어 | "Vehicle SDK에 없음 → AAOS 사용" | **`vehicle.getGear()` 있음**: `getCurrentGearSelectionState`, `registerGearSelection(GearSelectionListener)` → `onSelected(VehicleGear?)`. `VehicleGear` = `GEAR_UNKNOWN/NEUTRAL/REVERSE/PARK/DRIVE/GEAR_1..9` |
| 도메인 수 | 19개 | **20개** (Gear 포함) |
| 차속 | Vehicle SDK에 없음 | 맞음. AAOS `PERF_VEHICLE_SPEED` 사용 |
| `VehicleException` | `e.errorCode`로 분기 | 2.3.2 AAR에서 **난독화(`callback.exception.a`)** → import 불가. 공식 샘플도 `e.message`만 씀. `ErrorCode` enum은 `vehicle-data` 아티팩트에 공개 |
| 리스너 파라미터 | – | 대부분 **nullable** (`onSelected(VehicleGear?)`, `onFuelPercentUpdated(Int?)`) |
| Get 콜백 | `onComplete/onFailed` | 실제 Kotlin 시그니처는 람다 2개: `getX(onSuccess: (T?) -> Unit, onFailed: (Exception) -> Unit)` |
| NaviHelper 리스너 | – | `NaviHelperEventListener`의 모든 메서드가 **default 구현** → 필요한 것만 override |
| NaviHelper 초기화 | `initialize()` | `initialize()` 외에 `initialize(onSuccess, onFailed)` 오버로드 있음 |
| STT/TTS 좌표 | 미확인 | `ai.pleos.playground:SpeechToText:3.3.1`, `ai.pleos.playground:TextToSpeech:3.3.1` |
| 전이 의존성 | – | Vehicle은 `ai.pleos.playground.security:universal-access` 를 끌어옴 → Gradle repo content filter는 `includeGroupByRegex("ai\\.pleos\\.playground.*")` 여야 함 |
| 기타 공개 아티팩트 | – | Nexus에 `LLM`(2.1.3.2), `placesense`, `navi-data`, `vehicle-data`, `*-aidl`, `fused-location-data` 존재 (LLM·placesense 문서 없음) |
| navi-data 필드 | "브라우저에서만 렌더링" | `navi-data-3.0.4.txt`에 전부 있음. 예: `DestinationArrivedInfo(duration, distance, name, address)`, `TripInfo(distance, eta, estimatedSocAtDest, energyConsumption, summary)`, `NavigationStatus = INACTIVE/INITIALIZING/FREE_DRIVE/ROUTE_DRIVE` |

---

## 0. 전체 지도

| 구분 | 이름 | 버전 | 한 줄 설명 | 공모전 사용성 |
|---|---|---|---|---|
| Pleos SDK | **Vehicle SDK – 상태(State)** | 2.3.2 | 20개 도메인 차량 상태 읽기·구독 | ✅ Playground 상태 "Ready to Use" |
| Pleos SDK | **Vehicle SDK – 제어(Control)** | 2.3.2 | 공조·시트·조명·창문 등 제어 | ⚠️ "Not Available Yet", 에뮬레이터에서 값 미반영 사례 |
| Pleos SDK | **NaviHelper SDK** | 3.0.5 | 내비 목적지·경유지·경로·안내정보·이벤트 | ✅ "Ready to Use" (내비 탑재 차량) |
| Pleos SDK | **FusedLocation SDK** | 1.1.3 | 차량 융합 위치 + 지오펜스 | ⚠️ "Not Available Yet", `isSupported()` 필수 |
| Pleos SDK | **SpeechToText SDK** | 3.3.1 | 음성 → 텍스트 | ⚠️ "Not Available Yet" |
| Pleos SDK | **TextToSpeech SDK** | 3.3.1 | 텍스트 → 차량 스피커 음성 | ⚠️ "Not Available Yet" |
| Pleos 연동 | **Gleo Interface** | – | Gleo AI 음성비서가 우리 앱 기능을 호출 | ⚠️ 스키마 심사·승인 필요, 공모전 SDK 목록 외 |
| AAOS 표준 | **CarPropertyManager** | Android 14 | 차속·기어·주차브레이크 등 표준 차량 속성 | ✅ 표준 데이터는 이 경로 (차종별 지원 확인) |
| AAOS 표준 | **CarUxRestrictionsManager** | Android 14 | 주행 중 UX 제한 상태 감지 | ✅ 사실상 필수 |
| AAOS 표준 | CarDrivingStateManager | – | 주차/정차/주행 상태 | ❌ `@SystemApi` (서드파티 불가) |
| 서버 API | Vehicle Data API | v1 | 커넥티드카 텔레매틱스 REST | ❌ 2026.08 기준 **유럽 한정** |
| 서버 API | Fleet API | – | 차량·단말 관리 REST + Webhook | ⚠️ 법인 차량 관리용, 이용 자격 미기재 |

"Ready to Use / Not Available Yet"은 Playground 문서의 SDK 상태 안내 기준. 콘솔(My Project → SDK)에서 실제 상태를 직접 확인할 것.

---

## 1. 공통 셋업

- minSdk **28 이상**(필수, 서명 키 로테이션 요건), Gradle 8.0+
- 공식 샘플 기준선: JDK 17, Gradle 8.10.2, AGP 8.8.2, Kotlin 2.0.0, compileSdk/targetSdk 35
- 일반 안드로이드 폰·에뮬레이터에서는 동작 안 함 → **Pleos Connect AVD** 필요 (10장)
- Maven: `https://nexus-playground.pleos.ai/repository/maven-releases/` (토큰 불필요) — 이 레포의 `apps/vehicle/settings.gradle.kts` 참고

Playground 프로젝트 ([developers.pleos.ai](https://developers.pleos.ai) → Workspace > My Project > New Project)
- **Project ID (Key)**: 앱 심사 요청 시 사용
- **Client ID / Client Secret**: TTS·STT 서버 모드(HYBRID/SERVER)에 필요 → `apps/vehicle/secrets.properties` (gitignore)
- CRN: 에뮬레이터 2.1.0부터 불필요
- SDK 상태: `Ready to Use` / `Request Required` / `Under Review` / `Rejected` / `Not Available Yet` / `Affiliation Required`

---

## 2. Vehicle SDK (2.3.2)

### 2-1. 사용 패턴

```kotlin
val vehicle = Vehicle(context)
vehicle.initialize()                 // Vehicle Service에 IPC 연결
val gear = vehicle.getGear()         // 도메인 객체 getXxx()

val listener = object : GearSelectionListener {
    override fun onSelected(gear: VehicleGear?) { /* null 가능 */ }
    override fun onFailed(e: Exception) { /* e.message 로그 */ }
}
gear.registerGearSelection(listener)
gear.unregisterGearSelection(listener) // 같은 인스턴스로 해제
vehicle.release()
```

| API 타입 | 접두사 | 결과 전달 |
|---|---|---|
| Capability | `checkXxxCapabilities` | 지원 여부·허용 범위·Area |
| Get | `getXxx`, `getCurrentXxx`, `hasXxx` | `(value) -> Unit`, `(Exception) -> Unit` |
| Set | `setXxx`, `moveXxx`, `selectXxx` | 완료 콜백은 *요청값*이지 실제 상태가 아님 |
| Callback | `registerXxx` / `unregisterXxx` | `on…Updated` / `onFailed` |

- 모든 호출은 **비동기(IPC)**. 차종마다 지원 범위가 다름 → **항상 Capability 먼저**, 차종명으로 분기 금지
- **Area**: 좌석·문·창문 등은 위치 지정 (예: `ROW_1_LEFT`). 상수: `AreaValue`, `DoorValue`, `MirrorValue`, `SeatValue`, `TurnSignalValue`, `WheelValue`, `WindowValue`

### 2-2. 에러 코드 (`ai.pleos.playground.vehicle.constant.ErrorCode`)

| 코드 | 의미 | 대응 |
|---|---|---|
| `ERROR_NOT_SUPPORTED_PROPERTY` | 기능 미지원 | UI 비활성화·대체 흐름 |
| `ERROR_NOT_SUPPORTED_AREA` | 위치 미지원 | 다른 Area |
| `ERROR_NOT_SUPPORTED_VALUE_TYPE` | 값 타입 미지원 | 파라미터 확인 |
| `ERROR_SECURITY_PERMISSION` | 권한 없음 | Manifest 확인 |
| `ERROR_SERVICE_CONNECTION_FAILURE` | 서비스 연결 실패 | `initialize()`·에뮬레이터 확인 |
| `ERROR_INTERNAL_SERVICE` | 내부 오류 | 재시도 |
| `ERROR_DRIVING_RESTRICTED` | **주행 중 제한** | 사용자 안내 |
| `ERROR_EMPTY_RESULT` | 결과 없음 | 빈 상태 UI |
| `ERROR_UNDEFINED` | 기타 | 로그·재시도 |

### 2-3. 권한 (`pleos.car.permission.*`, normal — 런타임 팝업 없음)

| 읽기 권한 | 도메인 |
|---|---|
| `CAR_DOORS` | Door |
| `CAR_WINDOWS` | Window, Wiper |
| `CAR_CLIMATE` | HVAC |
| `CAR_DRIVE` | DrivingMode, Brake, Odometer |
| `CAR_ENERGY` | EvBattery, Fuel |
| `CAR_INFO` | CarInfo, Display |
| `CAR_LIGHTS` | Light, TurnSignal |
| `CAR_MIRRORS` | SideMirror |
| `CAR_SAFETY` | Safety, Tire |
| `CAR_SEATS` | Seat |
| `CAR_TOLL` | Toll |

- 제어: `CONTROL_CAR_{CLIMATE,DOORS,DRIVE,ENERGY,INFO,LIGHTS,MIRRORS,SAFETY,SEATS,TOLL,WINDOWS}`, `CONTROL_WINDSHIELD_WIPERS`
- 기타(샘플 Manifest): `CAR_CONNECT_VENDOR_CONTROL`, `CAR_MILEAGE`, `CAR_POWERTRAIN`(Gear 추정), `CAR_SPEED`, `CAR_TIRES`, `READ_CAR_DISPLAY_UNITS`, `READ_CAR_STEERING`(조향각), `READ_ADAS_STATES`, `READ_WINDSHIELD_WIPERS`
- `PRIVATE_*` 권한은 서드파티 불가. 전체 목록: `PleosPermission` 클래스

### 2-4. 도메인별 함수 (요약 — 전체는 `sdk-signatures/Vehicle-2.3.2.txt`)

**🚗 주행**
- **Gear** — `getCurrentGearSelectionState`, `registerGearSelection` (`onSelected(VehicleGear?)`)
- **Brake** (`CAR_DRIVE`) — 브레이크 페달: `checkBrakePedalStatusCapabilities` / `getCurrentBrakePedalStatus` / `registerBrakePedalStatus`
- **TurnSignal** (`CAR_LIGHTS`) — `checkTurnSignalStateCapabilities` / `getCurrentTurnSignalState` / `registerTurnSignalState`
- **SteeringWheel** — 조향각: `checkSteeringWheelAngleCapabilities` / `getCurrentSteeringWheelAngle` / `registerSteeringWheelAngle`; 핸들 열선: `…HvacSteeringWheelHeat…` + `setHvacSteeringWheelHeat`
- **DrivingMode** (`CAR_DRIVE`) — 주행 모드 `…DrivingModeState`, 크루즈 `…CruiseControlState`, 크루즈 설정속도 `…CruiseControlTargetSpeed`
- **Odometer** (`CAR_DRIVE`) — 총 주행거리 `…CurrentDistanceDriven`/`registerDistanceDriven`, 트립 누적/이번/순간/주유후 거리·시간 (`…TripCumulativeDrivingDistance` 등), `setRangeRemainingDistance`

**⚡ 에너지**
- **Fuel** (`CAR_ENERGY`, 읽기) — `getFuelPercent`/`registerFuelPercent`(`onFuelPercentUpdated(Int?)`), 누적/현재/순간/주유후 연비
- **EvBattery** — SOC `…EvBatteryStateOfCharge`, 누적/현재/순간/충전후 전비, 충전 on/off·전류제한·한도·충전구 (Set)

**🧍 실내**
- **Seat** — 탑승 `getCurrentSeatOccupancy(SeatArea, ...)`/`registerSeatOccupancy(SeatArea, SeatOccupancyListener)`, 벨트 `…SeatBeltBuckledState`, 열선/통풍/메모리, 시트 위치 11개 항목(`ForeAft/Height/Depth/Tilt/BackrestAngle/HeadrestAngle/HeadrestForeAft/HeadrestHeight/LumbarForeAft/LumbarSideSupport/BeltHeight`) — `checkSeat{X}Capabilities`, `getCurrentSeat{X}Position`, `registerSeat{X}Position`, `moveSeat{X}` (헤드레스트 높이 Get/Callback은 `…HeadrestHeightAftPosition`)
- **HVAC** — 전원/설정온도/**현재 실내온도**(`getHvacTemperatureCurrent`)/AC/MaxAC/오토/듀얼/풍량/풍향/내기순환/자동내기/성에제거/Max성에/공기청정
- **Light** — 앰비언트(스위치·상태·밝기·색·주행모드연동), 그 외 `Cabin/Reading/LowBeam/HighBeam/FrontFog/RearFog/TailLamp` × `check{X}LightState/SwitchCapabilities`, `getCurrent{X}LightState`, `get{X}LightSwitch`, `register{X}LightState`, `set{X}LightSwitch`
- **Door** — 열림 `…DoorPosition`, 잠금 `…DoorLock…`, 글러브박스 `…GloveBoxLock…`
- **Window** — 위치(0..10)·잠금·블라인드·스마트글라스
- **SideMirror** — 미러 열선 / **Wiper** — 동작 상태, 스위치

**🛡️ 안전**
- **Safety** (`CAR_SAFETY`, 읽기) — 엔진오일/브레이크액/변속기오일 레벨, 워셔액 부족(`registerLowWasherFluidWaringState` sic), 전원차단 경고, 벨트 미착용 경고, 에어백 활성/전개. ❌ 계기판 경고등(`…Telltales…`)은 공식 샘플이 차단
- **Tire** — ⚠️ 저압 경고 `getLowTirePressure`, 휠 위치 `checkWheelAreaCapabilities` (공기압 수치 API는 샘플이 차단)

**ℹ️ 기타**
- **Toll** — 하이패스 음성안내 볼륨 / **Display** — 온도 표시 단위 / **CarInfo** — VIN `getVINInfo`, CRN `getCRNInfo`

---

## 3. NaviHelper SDK (3.0.5) ✅

기본 내비 앱(Pleos Connect Navigation)에 요청을 전달하고 결과·상태는 이벤트로 받음. **이벤트 순서 보장 안 됨.**

흐름: `NaviHelper(context)` → `initialize()` → `addListener(listener)` → 요청/조회 → 콜백 → `removeListener()` → `release()`

| 권한 | 대상 API |
|---|---|
| `pleos.car.permission.NAVI_ROUTE` | `get*Info()`, `requestTrip()` |
| `pleos.car.permission.NAVI_ROUTE_SEARCH` | `requestRoute`, `requestRouteWithWaypoints`, `cancelRoute`, `requestReRoute`, `addWaypoint`, `removeWaypoint`, `changeRouteOption` |
| `pleos.car.permission.NAVI_CUSTOM_MAP` | `requestNavigationScreen` |
| (샘플에 추가) `NAVI_CUSTOM_ROUTE`, `NAVI_CUSTOM_ETC` | 문서 설명 없음 |

| 구분 | 메서드 |
|---|---|
| 경로 | `requestRoute(RouteInfo)`, `requestRouteWithWaypoints(RouteWithWaypointsRequest)`, `cancelRoute()`, `requestReRoute()`, `changeRouteOption(RouteOption)` |
| 경유지 | `addWaypoint(RequestWaypointInfo)` — **주차각 "경유지로 안내"**, `removeWaypoint(WaypointIndex)` |
| 조회 | `getCurrentLocationInfo()`, `getRouteStateInfo()`, `getDestinationInfo()`, `getWaypointInfo()`, `getTBTInfo()`, `getBookmarkInfo()`, `getRecentDestinationInfo()`, `getChargerOperatorInfo()` |
| 화면/트립 | `requestNavigationScreen(NavigationScreenRequest)`, `requestTrip(TripRequest)` |

```kotlin
RouteInfo(latitude, longitude, poiId, poiName, poiSubId, address)
RequestWaypointInfo(latitude, longitude, waypointIndex = WaypointIndex.FIRST, poiId, poiName, poiSubId, address)
RouteWithWaypointsRequest(destination = routeInfo, waypoints = listOf(waypointInfo))
```

이벤트(`NaviHelperEventListener`, 전부 default): `onRouteStarted`, `onRoutingCompleted`, `onRouteCancelled`, `onReRouteEnded`, `onRouteOptionChanged`, `onRouteEnded`, `onDestinationChanged`, **`onDestinationArrived(DestinationArrivedInfo)`**, `onWaypointChanged`, `onWayPointArrived`, 조회 응답들, `onDrivingInfo`, `onNavigationStatus`, **`onCurrentRoadSpeedLimit(Int)`**, `onCameraAlert`, `onCautionPointInfo`, `onError(NaviErrorCode)`

에러: `CAUSE_LOW_BATTERY`, `CAUSE_SEARCH_ROUTE_OVER_DISTANCE`, `CAUSE_SEARCH_ROUTE_TOO_SHORT_DISTANCE`, `CAUSE_SEARCH_ROUTE`

---

## 4. FusedLocation SDK (1.1.3) ⚠️

| 구분 | API |
|---|---|
| 생성·지원 확인 | `FusedLocation(context)`, **`isSupported()`** (false면 기능 숨김) |
| 생명주기 | `initialize()`, `release()` |
| 조회 | `getLastKnownLocation(listener)`, `registerFusedLocationCallback` / `unregisterFusedLocationCallback` |
| 지오펜스 | `addProximityAlert(ProximityAlertRequest(lat, lng, radiusM, setOf(ENTER, EXIT)), listener)` / `removeProximityAlert(alertId)` |
| 차단 안내 | `showLocationAccessBlockedPopup()` |

- `LocationData(latitude, longitude, altitude, heading, confidence, timestampMillis)` — 속도 필드 없음
- 권한 `pleos.car.permission.FUSED_LOCATION` (**런타임 허용 필요**). Android `ACCESS_*_LOCATION` 동작 보장 안 됨

---

## 5. SpeechToText SDK (3.3.1) ⚠️ / 6. TextToSpeech SDK (3.3.1) ⚠️

- `SpeechToText(context, Mode)` / `TextToSpeech(context, Mode)`; Mode = `HYBRID`(기본, 서버 우선·온디바이스 폴백) / `SERVER` / `ON_DEVICE`(앱 등록 불필요)
- STT: `addListener(ResultListener)` → `request()` / `stop()`; 콜백 `onReady`, `onStartedRecognition`, `onUpdated(stt, completed)`, `onUpdatedEpdData`, `onUpdatedRms`, `onEndedRecognition`, `onError(ErrorType)`
- TTS: `addEventListener(EventListener)`, 서버 모드는 `onConnected()` 이후 `speak(text[, isFinal])`, `stop()`
- 권한: `pleos.car.permission.STT_SERVICE` / `TTS_SERVICE`
- 공통 `ErrorType`: `AUDIO_ERROR`, `INVALID_REQUEST_ERROR`, `MIC_ERROR`, `NETWORK_ERROR`, `NOT_SUPPORTED_API`, `ON_DEVICE_ENGINE_ERROR`, `PERMISSION_DENIED`, `SERVER_INTERNAL_ERROR`, `TIMEOUT`, `UNAUTHENTICATED`, `UNAVAILABLE_LANGUAGE`, `UNKNOWN`

---

## 7. Gleo Interface ⚠️

Gleo AI 음성비서가 LLM function calling처럼 우리 앱 기능을 호출.
- `assets/schema.json`: `packageName`, `appDescription`(영어), `version`, `invokeWord`, `actionCalls[]`(**최대 3개**, `component: activity|service`, `name: UPPER_SNAKE`, `parameters`: string/number/boolean/array, enum은 문자열만)
- 수신: Manifest에 함수명과 같은 action intent-filter, 파라미터는 extra `"ACTION_PARAM"` JSON
- 응답(7초 안): broadcast `ai.pleos.playground.intent.action.APP_ACTION_RESPONSE` + `packageName`, `response`(JSON: `functionName`, `status: success|asking|fail`, `message`, `mode: voice|beep|silent`, `data`)
- Pleos 심사·승인 필요. 문의 partnership@pleos.ai

---

## 8. AAOS 표준 Car API ✅

| 속성 | 내용 | 권한 |
|---|---|---|
| **`PERF_VEHICLE_SPEED`** | 차속 (m/s) | `android.car.permission.CAR_SPEED` (dangerous → 런타임 요청) |
| `GEAR_SELECTION` / `CURRENT_GEAR` | 기어 | `CAR_POWERTRAIN` |
| `PARKING_BRAKE_ON` | 주차 브레이크 | `CAR_POWERTRAIN` |
| `IGNITION_STATE` | 시동 | `CAR_POWERTRAIN` |
| `NIGHT_MODE` | 야간 | `CAR_EXTERIOR_ENVIRONMENT` |
| `ENV_OUTSIDE_TEMPERATURE` | 외기온 | `CAR_EXTERIOR_ENVIRONMENT` |
| `FUEL_LEVEL`, `RANGE_REMAINING`, `EV_BATTERY_LEVEL` … | 에너지 | `CAR_ENERGY` |
| `INFO_MAKE` / `INFO_MODEL` | 제조사/모델 (설정 "내 차 자동 인식") | `CAR_INFO` |

**CarUxRestrictionsManager** — `Car.createCar(ctx).getCarManager(Car.CAR_UX_RESTRICTION_SERVICE)`; `isRequiresDistractionOptimization()`; 비트: NO_DIALPAD 1, NO_FILTERING 2, LIMIT_STRING_LENGTH 4, NO_KEYBOARD 8, NO_VIDEO 16, LIMIT_CONTENT 32, NO_SETUP 64.
Distraction Optimization 선언 안 한 Activity는 주행 중 차단. `CarDrivingStateManager`는 `@SystemApi` → 사용 불가.

---

## 9. 서버 API (참고)
- Vehicle Data API (`https://api.pleos.ai/v1/vehicles/{vin}/…`, OAuth2) — ❌ 유럽 한정
- Fleet API — ⚠️ B2B

---

## 10. 개발 · 테스트 도구

**Pleos Connect Emulator v2.1.0** — SDK Manager > SDK Update Sites
- Mac: `https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-arm64-sys-img.xml`
- Win/Linux: `https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml`
- Device Manager > Automotive > **Pleos Connect v2.1.0** (API 34), RAM 4GB, **Cold boot**

**Virtual Console**: `adb forward tcp:8088 tcp:8088` → `http://127.0.0.1:8088/`
- Motion: 기어, 브레이크, 조향각, 주행거리, 핸들 열선 / ADAS: 크루즈 / Convenience: 문·창문·트렁크·시트·조명·와이퍼·하이패스·글러브박스 / Safety: 경고등 / Energy / Climate
- 차속·GPS·시나리오 녹화 문서 없음 → **주차각은 자체 리플레이 모드로 시연**

```bash
adb emu geo fix 127.0276 37.4979   # 경도, 위도 순서
adb shell appops set --user current <패키지명> android:mock_location allow
adb shell dumpsys activity service com.android.car inject-vhal-event 0x11600207 3   # 차속 m/s (동작 미확인)
adb shell dumpsys activity service com.android.car inject-vhal-event 0x11400400 4   # 기어 P (8=D, 2=R)
```

공식 샘플: [vehicle](https://github.com/Pleos-Playground/pleos-sample-vehicle-app) · [navi](https://github.com/Pleos-Playground/pleos-sample-navi-app) · [fusedlocation](https://github.com/Pleos-Playground/pleos-sample-fusedlocation-app)
- Door Position `SET=1` 후 다시 읽으면 0 → 제어 미반영 가능 / Door Lock `ROW_1_LEFT` area not supported / Window Position 0..10

---

## 11. 플랫폼 제약 요약

| 항목 | 내용 |
|---|---|
| 하드웨어 | 센서·물리 장치 직접 접근 금지 → SDK·플랫폼 API만 |
| 폰 API | 전화·SMS·연락처·캘린더·일부 센서 제한 가능 |
| 주행 중 허용 | 음악/오디오, 지도/내비, 모빌리티 서비스(차량 관리·위치 기반 정보·**주차장 찾기**) |
| 주행 중 금지 | 영상, 게임·웹서핑, 키보드 입력, 차량 설정 변경 |
| 입력 원칙 | 프리셋·최근 항목·음성 우선, 큰 터치 영역, 첫 화면에 핵심 기능 |
| 네트워크 | 끊김 전제 → 캐싱, 재시도·타임아웃, 오프라인 UI |

---

## 12. 출처
- [Getting started](https://document.pleos.ai/en/docs/pleos-only/getting-started) · [프로젝트 생성](https://document.pleos.ai/en/docs/pleos-only/create-my-project)
- 기획 가이드: [SDK API 정책](https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/pleos-connect-sdk-api) · [API 호환성](https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/api-compatibility-availability) · [하드웨어 접근](https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/platform-api-architecture) · [주행 안전](https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/driver-distraction-guideline) · [지역별 주행 제한](https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/driving-restiction-policy) · [앱 카테고리](https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/app-category)
- Vehicle SDK: [설정](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/Vehicle/project-setup) · [권한](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/Vehicle/vehicle-permission) · [에러](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/Vehicle/vehicle-error-code) · [API 레퍼런스](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/Vehicle/vehicle/ai.pleos.playground.vehicle.api/entry)
- NaviHelper: [소개](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/NaviHelper/intro) · [이벤트](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/NaviHelper/event-listeners) · [레퍼런스](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/NaviHelper/entry)
- FusedLocation: [소개](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/FusedLocation/intro)
- STT: [소개](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/SpeechToText/intro) / TTS: [소개](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/TextToSpeech/intro)
- Gleo: [개념](https://document.pleos.ai/en/docs/pleos-only/app-integration-guide/guide/core-concepts) · [App Schema](https://document.pleos.ai/en/docs/pleos-only/app-integration-guide/guide/app-capability)
- 에뮬레이터: [설정](https://document.pleos.ai/en/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator) · [Virtual Console](https://document.pleos.ai/en/docs/connect/guide/getting-started/application-development/use-vehicle-emulator)
- AAOS: [VehiclePropertyIds](https://developer.android.com/reference/android/car/VehiclePropertyIds) · [UX 제한](https://source.android.com/docs/automotive/driver_distraction/consume)
