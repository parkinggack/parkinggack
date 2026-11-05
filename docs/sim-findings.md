# 시뮬레이션으로 찾은 문제점

에뮬레이터 시뮬레이션(`apps/vehicle/scripts/sim.sh`, `live-drive/live_drive_test.py`)을 돌리며 찾은 문제를 날짜별로 모은다.
고친 항목은 지우지 말고 **고침(커밋)** 을 붙여 둔다.

---

## 2026-11-05

### 오늘 돌린 것

| 무엇 | 결과 | 결과 폴더 (`captures/`, git 제외) |
|---|---|---|
| 정규 루틴 14개 `sim.sh all` (×2) | **14/14 통과**, 자동 점검 발견 0건 | `sim-20261105-101056/` |
| 탐색 루틴 X1~X12 (오늘 새로 짬 — 정규 루틴이 안 밟는 길) | 15개 중 **9개에서 문제** | `explore-20261105-103037/`, `explore-20261105-104448/` |
| 실차 주행 `live_drive_test.py` 6케이스 | **6/6 PASS**, 신호 충실도 100% (어제 b3 C-05 실패는 재현 안 됨) | `live-drive-20261105-105135/` |
| X1 상태에서 실차 주행(parallel) | 문제 재현 (아래 1-4) | `live-drive-20261105-110301/` |
| 화면 눈 검토 (스크린샷 약 40장) · logcat 전체 수집 · 코드 대조 | 아래 목록 | `sim-20261105-findings/` (스크립트·로그·logcat 발췌) |
| (2차) X13 경유지만 정해 두고 다른 곳에 실제 주차 | 문제 재현 (1-5) | `explore-20261105-111645/`, `live-drive-20261105-111804/` |
| (2차) X14 시스템 글꼴 1.3으로 11개 화면 | 거의 괜찮음 (3-10 하나) | `explore-20261105-111940/` |
| (2차) 정규 루틴 14개 **×1 (실제 속도)** | 1차는 에뮬레이터 시스템 재시작으로 중단 → 재부팅 후 **12/14** (11·12번 실패 = car service 재시작에 앱이 죽음, 2-6) | `sim-20261105-112214/`(중단), `sim-20261105-112554/` |
| (2차) 실차 주행을 **앱을 앞으로 끌어오지 않고** (`live_norefocus.py`) | **P 뒤 C-05가 안 뜸** (1-6) | `live-drive-20261105-115312/` |
| (오후, 고친 뒤) 탐색 루틴 X1·X2b·X2c·X3b | X2b 6/6 · X2c 6/6 · X3b 5/5 · X1 3/4(검사 시점 문제, 아래) — 재부팅 직후 첫 시도는 VHAL 재시작으로 중단 | `explore-20261105-143522/`(중단), `explore-20261105-144251/` |
| (오후) X5·X6·X10·X11·X12 → X5·X11 다시 | X6 11/11 · X10 3/3 · X12 6/6 · X5 3/3(판정 고친 뒤) · X11 10/10(복구 보강 뒤) | `explore-20261105-144716/`, `explore-20261105-145616/` |
| (오후) X13 → 실제 평행주차 | 시흥동 기록으로 (현대백화점 아님) | `explore-20261105-150259/`, `live-drive-20261105-150417/` |
| (오후) live-drive `--real-screen` (오버레이 허용) | 화면 8/8 · 충실도 56/56 · **PASS** (P 뒤 C-05가 스스로 앞으로) | `live-drive-20261105-145919/`, `live-drive-20261105-150635/` |
| (오후) 정규 루틴 14개 `sim.sh all` | 12/14 — 2·3이 C-05 머리줄(3-10을 두 Text로 나눈 탓)에서 ✗ → 한 줄로 읽히게 고친 뒤 2·3 다시 **8/8 · 8/8**. 11번(서버)으로 2-1 확인 | `sim-20261105-150822/`, `sim-20261105-152839/` |
| (오후) X14 글꼴 1.3 (두 번) | 13/13 · C-05 시각 보임 · C-09 라벨 잘림 발견(3-11) → 고친 뒤 다시 13/13. 중간 한 번은 VHAL 재시작으로 중단 | `explore-20261105-153100/`, `explore-20261105-153856/` |

> 정규 루틴은 전부 통과한다 — 아래 문제는 모두 **정규 루틴 밖**(뒤로 키, 빠른 조작, 기록이 많을 때, 2번째 주차 등)에서 나왔다.
> 탐색 루틴 다시 돌리기: `python3 captures/sim-20261105-findings/explore.py X2b X2c X3b` (번호 생략 시 전부 — X12는 15 MB 기록 파일을 남기고, X13 뒤엔 `live_drive_test.py --cases parallel --no-restart`를 이어서)
> 1-6 다시 보기: `python3 captures/sim-20261105-findings/live_norefocus.py parallel`

### 원인 분석·고친 것 (같은 날 오후 · 커밋 전)

아래 1~4장의 문제를 원인까지 확인하고 고쳤다. 원인이 처음 적은 것과 달랐던 것은 **굵게**.
확인 열: `단위` = JVM 단위 테스트(`./gradlew testDebugUnitTest`, 225개 통과 · 건너뜀 2 = 실서버 E2E) · `기기` = 에뮬레이터에서 다시 돌림.

| # | 원인 (확정) | 고친 곳 | 확인 |
|---|---|---|---|
| 1-6 | `ux`(UX 제한)를 Activity `repeatOnLifecycle(STARTED)` 안에서만 받아, 내비가 앞에 오면 '주행 중' 값으로 얼어붙음. **목적지·현재 위치(2초 폴링)·경유지 도착도 같은 블록이라 주행 중 내내 끊겨 있었다** (진입 감지 규칙 A·P 위치 주차장 찾기가 오래된 위치를 씀) | 넷 다 `ParkingApp.connectSignals()`로 — 프로세스 수명(appScope). MainActivity에선 뺌 | **기기** `live_drive_test.py --cases parallel --real-screen`(오버레이 허용, 앱을 끌어오지 않음) 화면 검사 8/8: 주행 중 맨 앞 = Pleos 내비 + 배너 창 → 기록 중 내비 + 배너 → **P 뒤 주차각이 스스로 앞으로 와서 C-05 "1F · 후진 1회 · 34초"** → 자동 저장 → 홈 1F (`live-drive-20261105-145919/`). 11-05 오전엔 같은 길에서 30초 넘게 내비 그대로였다 |
| 1-1 | `otherFloor()`·`openReplay()`가 자동 저장을 멈추기만 함 | 둘 다 `rememberZone()`처럼 **초안을 먼저 저장**(같은 id, 나중에 C-06에서 고르면 덮어씀). 안전망: 저장 안 된 초안이 있는데 다시 출발·새 주차·시연 시작이면 먼저 저장 (`saveDraftIfPending`) | **기기**: X2b 6/6 · X2c 6/6 · X3b 5/5 (`explore-20261105-144251/`) |
| 1-2 | 메인 스레드 전체 쓰기 + 해석 실패 = 빈 목록 → 다음 저장이 덮어씀 | `data/SafeFile.kt`: `.tmp`에 쓰고 fsync → 이전 본은 `.bak` → rename. 읽기 실패 시 본 파일은 `.corrupt-<시각>`으로 옮기고 `.bak`으로. `BackgroundWriter`: 쓰기는 IO 스레드(최신 내용만). 읽기도 IO 스레드 — 다 읽기 전 바꾼 것은 읽은 뒤 다시 적용(`RecordStore.ready` 전엔 홈을 그리지 않음). 궤적 점은 cm·0.001 rad로 줄여 파일 약 절반. 깨진 파일은 **앞부분의 온전한 기록 + `.bak`** 을 합쳐 살리고 바로 다시 써 둠(`.bak`은 한 번 전 저장이라 연달아 저장한 마지막 기록까지 지키려고 — X11 첫 재실행에서 2건만 남아 추가). `Outbox`도 SafeFile | 단위 `RecordStoreTest` 5개 · **기기** X12: 365건 파일 15.8 → **7.2 MB**, 앱 시작 6,043 → **1,215 ms**, '맞아요' 저장 때 Skipped frames 339 → **없음**, 홈까지 18 → 3.2초(화면 읽기 포함) · X11 10/10: 2건 → 앱 끄고 파일 절반 → 실행 → 2건 그대로, 새 주차 뒤 C-09 '모은 기록 3번' (logcat `restored (.bak + readable part)`) |
| 1-3 | **처음 추정(시작 때 동기 호출)은 절반만 맞음.** logcat 순서: VHAL 재시작 → car service가 우리 프로세스를 죽임(2-6) → START_STICKY로 다시 뜸 → 새 프로세스의 `Application.onCreate`가 **한 인자 `Car.createCar()` 안에서 car service를 최대 5초 기다리며** 메인 스레드를 잡음 → 그사이 sim이 다음 루틴 준비로 `am force-stop` → "Bringing down service while still waiting for start foreground" → 크래시. 실제 차에선 force-stop 대신 10초 타임아웃(ANR)으로 날 수 있음 | 2-6 고침(기다리지 않음) + 차종 읽기(`modelName`)·기록 읽기를 메인 스레드 밖으로 + `KeepAliveService.onCreate`에서 바로 `startForeground()` | **기기**: 오후에 VHAL 재시작 두 번(재부팅 직후·가동 1시간) — 우리 앱은 죽지 않아 START_STICKY 재시작 자체가 없었고 `ForegroundServiceDidNotStartInTime` 없음 |
| 1-4 | 뒤로 키는 `back()`만 부르고 `dismissCard()`를 안 부름 | `back()`·`goHome()`이 시연 카드(C-02·C-03)를 닫으면 '괜찮아요'와 같게 재생 시작. 안전망: 시연이 남아 있는데 **실제 차가 움직이면**(Live 신호, 기어 D/R·0.5 m/s 이상) 시연을 끝냄 | **기기**: X1 — 뒤로 키 뒤 1.5초 만에 재생 시작·'주차 기록 중'. (X1-03 '홈 보임'은 그사이 이미 C-04로 넘어가 ✗ — 검사 시점 문제) |
| 1-5 | `ParkingSession.finish()`가 P 위치를 보지 않음 | P 순간 내비 위치로 잰 대상 주차장까지 거리가 **500 m 넘으면 그 주차장을 버림** → `nameByPlace()`가 P 위치로 다시 찾음. 재생(시연)은 시나리오 거리만 믿음(없으면 확인 안 함) | 단위 `ParkingSessionTest` 2개 · **기기** X13(현대백화점 경유지) → 시흥동(2.7 km)에서 실제 평행주차 → 기록 `lotId=null · 수정구 시흥동 · 1F` (예전엔 `hyundai-pangyo`) |
| 2-1 | 차가 경력을 서버에 안 보냄 → 서버 `UNKNOWN` | 참여 직전·온보딩 끝·C-10에서 바꿀 때 `PATCH /v1/me/settings` (기기 토큰이 있을 때). 참여 중 경력을 바꾸면 같은 닉네임으로 다시 참여해 리그를 옮김. 참여 전 문구의 '경력 모두' → 서버와 같은 '모든 경력' | 단위 (요청 모양) · **기기** 정규 루틴 11: 온보딩 '1~3년' → 참여 → 서버 `league.id = pangyo:Y1_3` "판교 · 1~3년" (예전 '판교 모두'), logcat `settings -> server: Y1_3 share=false (Ok)` |
| 2-2 | `past.size < 2` | 지난 기록 1건이면 "지난번보다 수월했어요/지난번처럼 차분했어요". C-01 한 줄은 '오늘은'을 빼고, 기록이 그 한 건뿐이면 비교 없이 "지난 주차 후진 n회" | 단위 `CopyTest` · **기기** X6 11/11: 1번째 "첫 기록을 남겼어요"·홈 "지난 주차 후진 0회" → 2번째 "지난번처럼 차분했어요"·홈 "…그 전처럼 차분했어요" → 3번째 C-05 "오늘은 조금 더 신중하게 댔어요"·홈 "지난 주차 후진 1회, 조금 더 신중하게 댔어요" → 4번째 "평소처럼 차분했어요" |
| 2-3 | 화면이 바뀐 직후 같은 자리 두 번째 터치 | 화면(또는 주행 오버레이)이 바뀐 뒤 **0.4초** 터치를 받지 않음 (`MainActivity.AppRoot`) | **기기** X5 3/3: 0.15초 간격 두 번 → C-01 그대로 (탐색 스크립트의 판정도 'C-12·C-09·C-07이 열렸나'로 고침 — 예전 판정은 C-01에 원래 있는 글자를 '다른 화면'으로 봄) |
| 2-4 | `ShareService.shorten()`에 demo 규칙 없음 | 시연·예시 기록(`staysOnDevice`)은 서버 짧은 링크를 만들지 않고 `/p/` 위치 링크. sim 루틴 3 검사도 `/p/`로 | 단위 |
| 2-5 | 오프라인도 `attempts + 1` · 토큰 없는 `parking`에서 `break` | 오프라인은 세지 않음(서버에 닿은 5xx·429만). 토큰 없는 `parking`은 남겨 두고 뒤의 기록·별점부터 보냄 | 단위 2개 |
| 2-6 | 한 인자 `createCar` | `Car.createCar(context, handler, DO_NOT_WAIT, CarServiceLifecycleListener)` — 끊기면 기다렸다 다시 연결, 차속·기어·UX 제한 콜백을 새로 등록(`connected.flatMapLatest`) | **기기**: 재부팅 직후 VHAL이 세 번 죽는 동안 우리 앱(pid 6309)은 `car service disconnected — waiting for restart` → `connected`로 살아남음 (Pleos 앱 여럿은 `Killing the client process`). 가동 1시간 때 두 번째 재시작에서도 pid 29765 그대로 |
| 3-1 | 0건에도 '데이터 부족' 문구, 두 번 | 0건 = "아직 주차 기록이 없어요. 첫 기록을 남겨 주세요"(왼쪽만), 오른쪽 줄 = "주차하면 지난 주차를 여기서 보여 드려요" | **기기** 정규 루틴 1 `r1-04.png` |
| 3-2 | 평균만 최근 30일 | 평균도 **이번 달**(이번 달 기록이 없으면 기록 있는 가장 최근 달, 라벨에 "10월"). C-09 라벨 "이달 평균 후진" | **기기** 정규 루틴 14 `r14-02.png`: 그래프 11월 0.7 옆 "이달 평균 후진 0.7회" (예전 1.8회) |
| 3-3 | — | "지난달보다 **나아진** 만큼" — 차 앱·폰 앱(copy·king·테스트)·서버 주석·api.md·api-types·시안(C-13·M-51·canvas·mockups) | 폰 앱 vitest 354개 통과 |
| 3-4 | — | 빈 머리말을 "기록이 쌓이면⏎변화를 보여 드릴게요"로 끊어 둠 | 단위 |
| 3-5 | — | C-10 '내 차' 카드에 **연결 끊기**(폰이 연결돼 있을 때, 화면 안 확인 → `DELETE /v1/me`), C-13 참여 중 카드 아래 **주차왕 그만두기**(확인 → `DELETE /v1/me/king`) | 단위 (요청 모양) · 화면은 스냅숏 테스트 렌더만 (기기에서 누르기는 아직 — 운영 서버에 씀) |
| 3-6 | Android 12+ 규칙(터치를 넘기는 다른 앱 창은 불투명도 ≤ 0.8) | 창 alpha를 처음부터 `InputManager.maximumObscuringOpacityForTouch`(0.8)로 — 경고 없이. 터치를 막는 창으로 바꾸면 내비 버튼을 가리므로 그대로 | 기기 눈 검토 아직 (에뮬레이터 내비 지도가 비어 있음) |
| 3-7 | 에뮬레이터 GPS 고정 | 시연 재생 중엔 시나리오의 '목적지까지 거리'만큼 목적지 남쪽에 차를 두고 다가가게 (`AppController.demoCarPosition`) | 기기 눈 검토 아직 |
| 3-8 | — | 경유지 배너도 "경유지 아브뉴프랑 ★1.8 **쉬움**" | **기기** 정규 루틴 2 (배너: 경유지 아브뉴프랑 ★1.8 쉬움) |
| 3-9 | — | 온보딩 2·3장에서 뒤로 키 = '이전' | **기기** X10 3/3 |
| 3-10 | 이름·시각을 한 Text로 말줄임 | 이름만 말줄임, " · 오전 11:54"는 따로. 읽기(접근성·uiautomator)는 한 줄 "이름 · 시각" 그대로 (처음엔 두 조각으로 읽혀 정규 루틴 2·3이 실패 → 고침) | **기기** X14 글꼴 1.3: "현대백화점 판교점 지하주차장 · 오후 3:33" 다 보임 · 정규 루틴 2·3 8/8 |
| 3-11 (새로 찾음) | 글꼴 1.3에서 C-09 숫자 칸 라벨이 "요즘 평…"으로 잘림 (오전 X14 눈 검토에서 놓침 — 고친 뒤 "이달 평…"도 같아 알게 됨) | `StatRow` 라벨을 두 줄까지 (1.0에선 한 줄 그대로) | **기기** X14: "이달 평균 / 후진" 두 줄 (`explore-20261105-153856/`) |
| 4-1 | — | `live_drive_test.py --real-screen`: 앱을 끌어오지 않고 주행·기록 = 내비가 앞 + 배너 창(`dumpsys window`의 `parkinggack-navi-banner`), P 뒤 = 6초 안에 **주차각이 스스로 앞으로** + C-05 | **기기** 위 1-6 확인이 이것 |
| 4-2 | — | 'driving' 검사는 앱 글자를 하나도 못 읽으면 실패 | |
| 4-3 | — | sim 루틴이 실패하면 그 루틴 동안의 `Terminating VHAL`·`Car service has crashed`·`FATAL EXCEPTION`을 찾아 보고서 오류에 "에뮬레이터 VHAL 재시작 — adb reboot 권장"을 붙임 | **기기**: 재부팅 직후 X1·X2b 실패에 그대로 붙음 |
| 4-4 | — | 이번엔 안 함 (2-5는 MockWebServer 단위 테스트로) | — |
| 4-5 (새로 찾음) | live-drive '신호 충실도'가 기기 로그 시각(기기 시계)과 보낸 시각(PC 시계)을 0.7초 창으로 맞추는데, 에뮬레이터를 막 켜면 기기 시계가 **1.49초** 앞서 값이 바뀌는 구간이 모두 불일치 → 화면 검사 8/8인데 충실도 56~62%로 FAIL | 시작할 때 `echo $EPOCHREALTIME`로 시계 차를 재서 보정 (`Device.clock_offset`) | **기기** 같은 평행주차가 56/56 (100%) PASS (`live-drive-20261105-150635/`) |

### 요약 (우선순위 순)

줄 순서 = 우선순위, 번호 = 찾은 순서. 원인·고친 곳·기기 확인은 바로 위 표.

| # | 문제 | 영향 | 확인 | 상태 |
|---|---|---|---|---|
| 1-6 | **실제 사용 경로(주행 중 내비가 앞)에서 P를 넣어도 C-05가 안 뜸** — 내비 화면 그대로, C-05는 뒤에서 혼자 자동 저장 | 핵심 흐름 깨짐 | 실차 재현 | **고침** (커밋 전) |
| 1-1 | C-05에서 '동선 크게 보기'·'다른 층이에요'를 누르면 자동 저장이 멈추고 다시 안 돎 → 뒤로/출발하면 **주차 기록이 사라짐** | 데이터 손실 | 기기 재현 | **고침** (커밋 전) |
| 1-2 | `records.json`을 통째로, 원자적이지 않게, 메인 스레드에서 다시 씀 → 파일이 깨지면 **기록 전부 사라짐** · 1년 치면 **ANR** | 데이터 손실 · 멈춤 | 기기 재현 | **고침** (커밋 전) |
| 1-3 | 앱 강제 종료 `ForegroundServiceDidNotStartInTimeException` (KeepAliveService) | 크래시 | logcat 1회 (원인은 추정) | **고침** (커밋 전) |
| 1-4 | 시연 중 C-02를 **뒤로 키**로 닫으면 주행이 안 시작되고, 그 뒤 **실제 주차가 'demo-'로 저장·현대백화점으로 기록**됨 | 시연 중단 · 잘못된 기록 | 기기 + 실차 재현 | **고침** (커밋 전) |
| 1-5 | 목적지·경유지를 한 번 정하면 **2.7 km 떨어진 곳에 대도 그 주차장으로 기록** (P 위치 확인 없음) | 남의 주차장 난이도 데이터 오염 | 실차 재현 | **고침** (커밋 전) |
| 2-1 | C-13 '내 리그 판교 · 1~3년'이라 해 놓고 참여하면 **'판교 모두'** 리그 | 약속과 다름 | 기기 재현 | **고침** (커밋 전) |
| 2-2 | 두 번째 주차인데 C-05·C-01이 **"첫 기록을 남겼어요"** | 잘못된 문구 | 기기 재현 | **고침** (커밋 전) |
| 2-3 | '맞아요'를 빠르게 두 번 누르면 두 번째 터치가 홈의 동선 카드를 눌러 C-12가 열림 | 오작동 | 기기 재현 | **고침** (커밋 전) |
| 2-4 | 시연(demo-) 기록도 C-07 짧은 링크를 운영 서버에 만듦 | 운영 데이터 오염 | 서버 확인 | **고침** (커밋 전) |
| 2-5 | 대기열(Outbox)이 **오프라인 실패도 시도 횟수로 세어** 약 50분 오프라인이면 익명 기록·별점을 조용히 버림 | 데이터 손실 | 코드 | **고침** (커밋 전) |
| 2-6 | `Car.createCar(context)` 한 인자 버전 — car service가 재시작하면 **AOSP가 앱 프로세스를 죽임** → 기록 중이면 잃음 | 기록 손실 | 기기 logcat (우리 앱이 죽음) | **고침** (커밋 전) |
| 3-x | 카피·표시 다듬기 10건 | 완성도 | 화면 검토 | **고침** (커밋 전) |
| 4-x | 테스트 도구 쪽 — live-drive가 **실제 주행 화면(내비+배너)을 검사하지 못함** 등 | 놓치는 버그 | 아래 4장 | **고침** 4-1·4-2·4-3 (+4-5) · 4-4 남음 |

---

### 1-6. 주행 중 내비가 앞에 있으면 P를 넣어도 C-05가 안 뜬다 (핵심 흐름)

- **재현** (`live_norefocus.py` = live-drive와 같은 평행주차, 단 화면을 읽을 때 앱을 앞으로 끌어오지 않음)
  1. 출발 → DrivePresenter가 Pleos 내비를 앞으로, 주차각은 그 위 배너 (설계대로)
  2. 후진(후방카메라) → **P** → 30초 넘게 맨 앞은 계속 `ai.umos.maps.android.navigation.app/.MainActivity`. C-05는 안 뜸
  3. 기록은 뒤에서 만들어지고 자동 저장까지 됨 (`AppController: place: 314cf6c9 -> address`, records.json `수정구 시흥동 1F 11:54:26`)
  4. 85초 뒤 손으로 앱을 앞으로 가져오자 그제야 `DrivePresenter: phase DRIVING -> PARKED`, 화면엔 C-05 "1F로 저장했어요"
- **영향**: 기획의 핵심 순간("P 넣고 3초 안에 몇 층인지") — 층 확인·구역 기억하기·폰으로 보내기 — 을 실제 사용자는 보지 못한다.
  오버레이 권한('다른 앱 위에 그리기')이 있을 때, 즉 의도한 배포 상태에서 항상 그렇다.
- **원인**: `ux`(CarUxRestrictions)를 [MainActivity.kt:87-88](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/MainActivity.kt#L87-L88)의 `repeatOnLifecycle(STARTED)` 안에서만 받는다.
  내비가 앞으로 오면 Activity가 멈춰 `ux`가 '주행 중(DO 필요)' 값으로 **얼어붙고**, `showDrivingOverlay = ux.isDriving || …`가 계속 true →
  [DrivePresenter](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/overlay/DrivePresenter.kt) `phaseOf()`가 DRIVING에서 안 바뀌어 `bringToFront()`가 불리지 않는다.
- **왜 정규 테스트가 못 잡았나**: sim(`Device.nodes`)과 live-drive(`Device.screen`) 둘 다 **화면에 앱이 없으면 `am start`로 앱을 앞으로 가져온 뒤** 읽는다 → Activity가 STARTED가 되며 `ux`가 갱신돼 C-05가 뜬다. 테스트가 버그를 덮어 왔다 (4-1).
- **고칠 방향**: UX 제한 구독을 Activity가 아니라 앱 수명(`ParkingApp`/`AppController`, `appScope`)으로 옮기기. 또는 `phaseOf()`가 `drive is Parked`를 `ux`보다 먼저 보기.

### 1-1. C-05 자동 저장이 멈춘 채로 남아 기록이 사라진다 (데이터 손실)

- **재현** (X2b · X2c · X3b, 세 번 모두 재현)
  1. 주차(P) → C-05가 뜨고 **3초 자동 저장이 끝나기 전에** '동선 크게 보기'(C-12)나 '다른 층이에요'(C-06)를 누른다
     (층을 모를 때 C-05는 8초라 훨씬 쉽게 걸린다)
  2. C-12 '닫기' / C-06 뒤로 → C-05로 돌아온다 → 카운트다운이 **"그대로 두면 1초 뒤 1F로 저장돼요"에서 멈춤**, 막대는 꽉 참
  3. 뒤로 키로 나간다 → C-01이 **빈 홈** ("이렇게 기록돼요"). 방금 주차는 어디에도 없다
- **근거**: `captures/explore-20261105-104448/rX2b-04-FAIL.png` (멈춘 카운트다운), `rX2b-06-FAIL.png` (빈 홈), `rX2c-*`, `rX3b-*`
- **원인**: [AppController.kt:489](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/AppController.kt#L489) `otherFloor()`, [:493](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/AppController.kt#L493) `openReplay()`가 `stopAutoSave()`만 하고 저장도, 돌아왔을 때 다시 시작도 안 한다.
  `autoSaveMsLeft = 0`이라 [MainActivity.kt:252](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/MainActivity.kt#L252)가 `coerceAtLeast(1)`로 "1초 뒤"를 계속 보여 준다.
  같은 상태에서 그냥 **D로 출발**해도 `session`은 Parked → Driving으로 넘어가고 초안은 저장되지 않은 채 다음 주차에 덮인다 (코드로 본 것, 기기 미확인).
- **정규 루틴이 못 잡은 이유**: 루틴 4는 C-12를 보고 와서 '맞아요'를 누른다. 화면 읽기가 1~2초 걸려 대개 자동 저장이 끝난 뒤에 누른다(X2·X3는 그래서 통과).
- **고칠 방향**: `rememberZone()`처럼 C-12·C-06으로 가기 전에 초안을 **먼저 저장**(같은 id라 나중에 층을 고쳐도 upsert). 또는 Parked로 돌아올 때 남은 시간으로 다시 시작.

### 1-2. `records.json` 저장이 원자적이지 않고 메인 스레드에서 전체를 다시 쓴다

- **재현 A — 파일이 깨지면 전부 사라짐** (X11): 기록 2건 → 앱 종료 → `records.json`을 절반만 남김(쓰는 중 전원이 끊긴 상태 흉내) → 실행
  → C-01 **빈 홈**. 그 상태에서 한 번 더 주차하면 파일이 새 1건으로 덮여 **예전 기록은 영영 없음** (C-09 '모은 기록 1번')
  - 차는 시동을 끄면 전원이 그냥 끊기므로 '쓰는 중 전원 끊김'이 폰보다 흔하다
  - 근거: `captures/explore-20261105-103037/rX11-06-FAIL.png`
- **재현 B — 기록이 쌓이면 멈춤** (X12): 기록 1건 = **약 25~40 KB** (궤적 600점 포함). 365건(하루 한 번 1년) = **15.8 MB**
  - 앱 시작 `TotalTime 6043 ms`
  - '맞아요' 한 번에 `Skipped 339 frames`(5.8초 멈춤) + 1.8초 멈춤 여러 번, 홈 화면이 읽힐 때까지 약 18초(화면 읽기 시간 포함)
  - **ANR**: `Input dispatching timed out ... Waited 5005ms for MotionEvent` (logcat, `sim-20261105-findings/logcat-excerpt.txt`)
- **원인**: [RecordStore.kt:48-50](../apps/vehicle/app/src/main/java/com/parkinggack/app/data/RecordStore.kt#L48-L50) `file.writeText(전체)` — 임시 파일·이름 바꾸기 없음, 실패는 `runCatching`으로 조용히 삼킴.
  [load()](../apps/vehicle/app/src/main/java/com/parkinggack/app/data/RecordStore.kt#L52-L56)는 파싱 실패 시 `emptyList()` → 다음 `save()`가 빈 목록 위에 덮어씀.
  `appScope`가 `Dispatchers.Main.immediate`([ParkingApp.kt:32](../apps/vehicle/app/src/main/java/com/parkinggack/app/ParkingApp.kt#L32))라 `upsert`가 UI 스레드에서 돈다 (목적지 없는 주차는 `nameByPlace`가 이름을 붙이며 한 번 더 저장).
  `Outbox.kt:100`도 같은 방식.
- **고칠 방향**: `AtomicFile`(또는 임시 파일 + `renameTo`) + 읽기 실패 시 파일을 지우지 말고 `.bak`으로 옮겨 두기 · 쓰기는 `Dispatchers.IO` · 궤적은 기록별 파일로 나누거나 오래된 기록은 줄인 궤적만 보관.

### 1-3. 앱 강제 종료 — `ForegroundServiceDidNotStartInTimeException`

- **관찰**: 정규 루틴 10→11 사이(10:26:19) 한 번. 루틴은 스크립트가 앱을 다시 띄워 통과했다.
  ```
  ActivityManager: Bringing down service while still waiting for start foreground: ...KeepAliveService
  AndroidRuntime: FATAL EXCEPTION: main  Process: com.parkinggack.app
  RemoteServiceException$ForegroundServiceDidNotStartInTimeException: Context.startForegroundService() did not then call Service.startForeground()
  ```
- **앞뒤 상황**: 10:26:09 `carwatchdogd: VHAL failed to update heart beat ... Terminating VHAL` → 10:26:15 SystemUI 크래시(Pleos 쪽) → 10:26:19 우리 앱 크래시.
  `startForegroundService()` 뒤 10초 안에 `startForeground()`를 못 불렀다 = **그 10초 동안 메인 스레드가 막혀 있었다**는 뜻.
- **원인 (추정)**: 시작할 때 메인 스레드에서 도는 동기 호출 — `MainActivity.onCreate`의 `carSignals.modelName()`(Car `getProperty` 동기, [MainActivity.kt:103](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/MainActivity.kt#L103)), `RecordStore` 생성 시 `records.json` 읽기 — 가 VHAL 재시작 중에 오래 걸렸을 가능성.
  1-2처럼 기록이 커져 시작이 6초 이상 걸려도 같은 크래시가 날 수 있다.
- **고칠 방향**: Car 속성 읽기·파일 읽기를 메인 스레드 밖으로. `KeepAliveService.onCreate`에서 바로 `startForeground()`.

### 1-4. 시연 중 C-02를 뒤로 키로 닫으면 시연이 멈추고, 그 뒤 실제 주차가 잘못 기록된다

- **재현** (X1 + 실차 주행)
  1. `demo.sh main`(목적지 있음) → C-02 카드 → **뒤로 키**
  2. C-01로 돌아가지만 **주행 재생이 시작되지 않음** (X·'괜찮아요'로 닫으면 시작됨). 70초 넘게 기다려도 그대로
  3. 이 상태에서 Virtual Console로 **실제 평행주차**를 하면:
     - C-04 배너에 내비 목적지가 없는데도 **"도착지 주차 ★4.3 어려움"**
     - 저장된 기록 = `demo-5b087fca… · 현대백화점 판교점 지하주차장 · 1F` — 실제 위치는 수정구 시흥동인데 **현대백화점으로**, id가 **demo-라 서버·주차왕·폰으로 영영 안 나감**
- **근거**: `captures/explore-20261105-103037/rX1-04-FAIL.png`, `captures/live-drive-20261105-110301/report.md`, logcat `AppController: upload: demo-5b087fca stays on device (demo)`
- **원인**: 뒤로 키는 [MainActivity.kt:166-172](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/MainActivity.kt#L166-L172) `c.back()`만 부르고 `dismissCard()`(→ `maybeStartDemoDrive()`)를 안 부른다.
  재생이 시작되지 않으니 `endDemo()`도 불리지 않아 `demoRunning = true`, `session.targetLot = 현대백화점`, `demoAfterCard`가 프로세스가 죽을 때까지 남는다.
  `demoRunning` 동안은 [onDestination()](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/AppController.kt#L200-L205)이 **실제 내비 목적지도 무시**한다.
- **영향**: 심사·시연 중에 발표자가 뒤로 키를 누르면 시연이 멈추고, 이후 실제 주차는 앱을 다시 켤 때까지 잘못 기록된다.
- **고칠 방향**: C-02에서 뒤로 = `dismissCard()`와 같게. 시연 상태에 시간 제한(예: 재생이 N초 안에 시작 안 되면 `stopDemo()`).

### 1-5. 목적지·경유지를 정해 두면 엉뚱한 곳에 대도 그 주차장으로 기록된다

- **재현** (X13 + 실차 주행): 홈 '자주 가는 곳' → C-08 현대백화점 → **'경유지로 안내'** → 홈으로 돌아옴 (C-04 배너는 곧 사라짐)
  → Virtual Console로 **실제 평행주차** (내비 위치 = 수정구 시흥동, 현대백화점에서 약 2.7 km)
  → 저장된 기록 `989007ab… · hyundai-pangyo · 현대백화점 판교점 지하주차장 · 1F` — **demo- 아님** = 익명 기록을 켜 두면 서버로 올라가 현대백화점 난이도에 섞인다
- **근거**: `captures/live-drive-20261105-111804/report.md`, `captures/explore-20261105-111645/`
- **원인**: 기록에 붙는 주차장은 `session.targetLot`(경유지 > 목적지)이고, [ParkingSession.finish()](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/ParkingSession.kt#L140-L158)는 **P 위치와의 거리를 보지 않는다**.
  `targetLot`은 내비 경로가 끝나도 일부러 남겨 두고([AppController.kt:208-213](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/AppController.kt#L208-L213)), 저장해야만 지워진다. 진입 감지는 후진만으로도 켜지므로(거리 조건이 없어도) 그대로 기록된다.
  1-4와 같은 뿌리 — 다른 점은 시연이 아니라 **실사용 경로**라는 것.
- **고칠 방향**: P 순간 내비 위치와 `targetLot` 거리가 일정 이상(예: 300 m)이면 대상 주차장을 버리고 `nameByPlace()`(P 위치로 주차장 찾기)로. `targetLot`에 유효 시간 두기.

### 2-1. 주차왕 리그가 C-13에서 말한 것과 다르다

- **재현** (정규 루틴 11 스크린샷): 온보딩에서 '1~3년' → C-13 참여 전 카드 **"내 리그 판교 · 1~3년"** (`sim-20261105-101056/r5-08.png`)
  → '참여할게요' → **"판교 모두 66명 중"**, 순위판 "판교 모두 · 이번 주 점수 순" (`r11-04.png`)
- **원인**: 참여 전 문구는 앱이 로컬 설정으로 만든다([AppController.kt:589-592](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/AppController.kt#L589-L592)).
  서버는 참여할 때 `/v1/me/settings.experience`로 리그를 고정하는데(docs/api.md 270행) **차 앱은 경력을 서버에 보내는 API가 없다**(`ApiClient`에 settings 호출 없음) → 서버엔 `UNKNOWN` → '모두' 리그.
  같은 이유로 차의 '익명 기록 보내기' 설정도 서버 `settings.shareAnonymous`와 따로 논다.
- **고칠 방향**: 온보딩·C-10에서 경력을 바꾸면 `PUT /v1/me/settings`, 참여 전 리그 문구는 서버 `GET /v1/me/king`(참여 전에도 '들어갈 리그'를 줌)의 값을 쓰기.

### 2-2. 두 번째 주차에 "첫 기록을 남겼어요"

- **재현** (X6, 정규 루틴 9의 `r9-04.png`): 첫 주차 → 두 번째 주차 C-05 '오늘 주차' 카드 **"첫 기록을 남겼어요"**, C-01 "지난 주차 후진 0회, **첫 기록을 남겼어요**". 세 번째부터는 비교 문구가 나온다
- **원인**: [Copy.kt:18](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/Copy.kt#L18) `if (past.size < 2) return "첫 기록을 남겼어요"` — 지난 기록이 1건이어도 '첫 기록'
- **고칠 방향**: `past.isEmpty()` → "첫 기록을 남겼어요", `past.size == 1` → 지난번 한 건과 비교하거나 "두 번째 기록이에요" 같은 중립 문구
- 같은 함수: C-01 한 줄이 "지난 주차 후진 1회, **오늘은** 조금 더 신중하게 댔어요" — 다음 날 봐도 '오늘은'이라고 한다 ([Copy.kt:28-33](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/Copy.kt#L28-L33)이 C-05 문장을 그대로 씀)

### 2-3. '맞아요' 두 번 누르면 C-12가 열린다 (유령 터치)

- **재현** (X5): C-05 '맞아요'를 0.15초 간격으로 두 번 → 홈으로 넘어간 뒤 두 번째 터치가 같은 자리의 C-01 '주차 동선' 카드에 떨어져 **C-12가 열림** (`explore-20261105-103037/rX5-03-FAIL.png`)
- 흔들리는 차 안에서 두 번 눌리는 일은 흔하다. C-05 → C-01 전환 직후 잠깐(300ms 정도) 입력을 막거나, 홈의 그 자리에 누를 수 있는 것을 두지 않기

### 2-4. 시연(demo-) 기록도 C-07 짧은 링크를 운영 서버에 만든다

- 정규 루틴 3이 만든 링크 `parkinggack.vercel.app/s/6vkzns` → `GET /v1/shares/6vkzns`에 시연 주차(수정구 시흥동 B1·C·07, 돌아가는 길 안내 포함)가 저장돼 있음 (만료 11-07)
- 'demo- 기록은 서버로 안 보낸다'는 규칙이 난이도 집계·주차왕·폰 동기화에만 걸려 있고 [ShareService.shorten()](../apps/vehicle/app/src/main/java/com/parkinggack/app/share/ShareService.kt)에는 없다
- sim을 돌릴 때마다 운영 DB에 링크가 쌓이고 대시보드 overview `shares`(만료 전 링크 수)가 부풀려진다. 시연 기록은 오프라인 링크(`/p/…`)만 쓰거나 `demo` 표시를 붙이기

### 2-5. 대기열이 오프라인 실패도 시도 횟수로 센다 (코드로 확인)

- [Outbox.kt](../apps/vehicle/app/src/main/java/com/parkinggack/app/data/Outbox.kt) `flush()`: `drop = Ok || 영구 실패 || attempts >= 50` — 오프라인(네트워크 오류)도 `attempts + 1`이고, 그 값이 파일에 저장돼 앱을 껐다 켜도 이어진다.
  flush는 60초마다(+ 저장·별점 때) → 오프라인 **약 50분**이면 맨 앞 항목을 버리고, 다음 항목이 또 50번… 차에 데이터 통신이 없거나 지하에 오래 있으면 익명 기록·별점이 조용히 사라진다.
- 같은 함수: 맨 앞이 `parking`(폰 동기화) 항목인데 기기 토큰이 없으면 `break` → 뒤의 기록·별점까지 전부 멈춤 (토큰이 401로 지워진 뒤 등).
- 기기 확인은 못 함 — 실제 업로드는 운영 서버에 쓰게 되므로 (정규 루틴의 기록은 전부 demo-·'나만 볼게요'라 이 경로를 안 탄다).
- **고칠 방향**: 오프라인(`ApiResult.Offline`)은 시도 횟수에 넣지 않기 · 토큰 없는 `parking`은 건너뛰고 다음 항목 보내기.

### 2-6. car service가 재시작하면 앱 프로세스가 죽는다 (기기 logcat으로 확인)

- [CarSignals.kt:22](../apps/vehicle/app/src/main/java/com/parkinggack/app/car/CarSignals.kt#L22) `Car.createCar(context.applicationContext)` — 수명 주기 리스너 없는 한 인자 버전.
  AOSP `Car`는 이런 클라이언트를 car service가 죽었을 때 **`Process.killProcess`로 같이 죽인다**.
- 오늘 에뮬레이터의 VHAL·car service가 세 번 죽었다(10:26 · 11:22 · 11:51, `carwatchdogd: VHAL failed to update heart beat ... Terminating VHAL`).
  11:51에 **우리 앱(pid 23453)이** `**Car service has crashed. Client(null) is not handling it ... Killing the client process**`로 죽었고,
  호출 위치가 `CarSignals.<init>(CarSignals.kt:22)` ← `ParkingApp.getCarSignals` ← `getController`로 찍혔다 (`sim-20261105-findings/logcat-excerpt.txt`).
  ×1 정규 루틴 11·12번이 온보딩에서 멈춘 것이 이것 (앱이 그 순간 죽음).
- 기록 중이면 세션(메모리)이 통째로 사라지고, KeepAliveService(START_STICKY)가 프로세스를 다시 띄워도 이어지지 않는다. 1-3 크래시도 같은 VHAL 재시작 때 났다.
- **고칠 방향**: `Car.createCar(context, handler, CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { car, ready -> … }`로 바꾸고 다시 연결되면 속성 콜백을 다시 등록.

### 3. 카피·표시 다듬기 (낮음)

| # | 화면 | 내용 | 근거 |
|---|---|---|---|
| 3-1 | C-01 빈 홈 | 같은 화면에 "아직 기록이 적어요. 첫 기록을 남겨 주세요"가 **두 번**(왼쪽 카드·오른쪽 '내 주차' 줄). 기록이 0건인데 '적어요' — 기획서 11장의 '데이터 부족'(주차장 기록) 문구를 내 기록 0건에도 씀 | `sim-20261105-101056/r1-04.png`, [HomeScreen.kt:54-55](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/screens/HomeScreen.kt#L54-L55) · [:262](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/screens/HomeScreen.kt#L262) |
| 3-2 | C-09 (예시 기록 — 심사 첫 화면) | 그래프 11월 **0.7회** · 머리말 "1.7회 줄었어요" 옆에 '요즘 평균 후진' **1.8회**. '요즘'=최근 30일이라 10월 기록이 섞임. C-01도 '이번 달 주차 3번' 옆 '평균 후진 1.8회'(30일) | `r14-02.png`, `r14-01.png`, [RecordStats.kt:21-22](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/screens/RecordStats.kt#L21-L22) |
| 3-3 | C-13 | "지난달보다 **는** 만큼" — '늘다'의 관형형이지만 조사 '는'으로 읽혀 오타처럼 보임. 후진은 줄어야 좋은 값이라 '늘었다'와도 헷갈림 → "지난달보다 나아진 만큼" 등. 시안(C-13·M-51)·api.md·api-types도 같은 문구 | `r5-08.png`, [KingScreen.kt:126](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/screens/KingScreen.kt#L126), [:271](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/screens/KingScreen.kt#L271) |
| 3-4 | C-09 | 빈 머리말 "기록이 쌓이면 변화를 보여 / 드릴게요" — '보여 드릴게요' 사이에서 줄이 바뀜 | `r5-07.png` |
| 3-5 | C-13 · C-10 | 차에서 **주차왕 그만두기**·**폰 연결 끊기**를 할 곳이 없음 (서버 `DELETE /v1/me/king`·`DELETE /v1/me`는 있고 폰 앱에는 있음). 폰 없이 차만 쓰는 사람은 참여를 되돌릴 수 없음 | 코드 |
| 3-6 | C-04 내비 위 배너 | 시스템이 배너 창을 **80% 불투명도로 강제** (`WindowManager: ...FLAG_NOT_TOUCHABLE and LayoutParams.alpha = 1.00 > 0.80, setting alpha to 0.80`) — 터치를 안 받는 오버레이는 Android 12+에서 0.8 이하만 허용. 지도 위에서 배너가 비침. 알파 0.8을 전제로 디자인하거나 배경 대비 확인 | logcat, [NaviOverlay.kt:97-112](../apps/vehicle/app/src/main/java/com/parkinggack/app/ui/overlay/NaviOverlay.kt#L97-L112) |
| 3-7 | C-04 (시연) | 주행 재생 중 지도의 내 차 표시가 움직이지 않음 (위치는 에뮬레이터 GPS 고정). 시연 영상에서 '달리는데 지도는 그대로' | `r1-07.png` |
| 3-8 | C-04 배너 | 목적지 배너는 "도착지 주차 ★4.3 **어려움**", 경유지 배너는 "경유지 아브뉴프랑 ★1.8"로 난이도 단어가 없음 | `r2-04.png`, [AppController.kt:114-115](../apps/vehicle/app/src/main/java/com/parkinggack/app/session/AppController.kt#L114-L115) |
| 3-9 | C-11 | 온보딩 2/3에서 뒤로 키가 아무 일도 안 함 (1/3로 안 감 — 화면의 '이전'만 됨) | X10 |
| 3-10 | C-05 | 시스템 글꼴 1.3이면 머리줄이 "현대백화점 판교점 지하주차장 · 오전 11…"로 **주차 시각이 잘림**. 다른 화면은 1.3에서도 넘치지 않음 | X14 `explore-20261105-111940/rX14-11.png` |

### 4. 테스트 도구·환경 쪽

| # | 내용 | 할 일 |
|---|---|---|
| 4-1 | sim `Device.nodes()`·live-drive `Device.screen()`이 화면에 앱이 없으면 **`am start`로 앱을 앞으로** 가져와 읽는다 → 실제 화면(내비+배너)과 'P에서 앱이 스스로 앞으로 오는지'를 검사하지 못하고, 1-6을 덮었다 | 주행 중·P 직후 검사는 앞으로 가져오지 말고 `topResumedActivity`로 맨 앞이 무엇인지부터 검사. `captures/sim-20261105-findings/live_norefocus.py`가 그 방식 |
| 4-2 | live-drive `evaluate()`의 'driving' 검사는 앱 글자가 하나도 없어도 통과 (`REC_MARK not in ""` 가 참) | 앱 화면을 못 읽었으면 실패나 '알 수 없음'으로 |
| 4-3 | Pleos 에뮬레이터 VHAL이 부하 속에서 30~60분마다 죽음 (오늘 3번, 가동 1시간대에도). 그때마다 SystemUI 재시작·우리 앱 강제 종료 → sim이 '앱 화면을 못 읽음'으로 실패 | 실패가 나면 먼저 logcat에 `Terminating VHAL`이 있는지 볼 것. sim 보고서에 이 줄을 같이 남기면 좋음. 재부팅(`adb reboot`)하면 한동안 괜찮음 |
| 4-4 | sim의 기록은 전부 demo-·'나만 볼게요'라 **실제 업로드 경로**(RecordUpload → Outbox → `POST /v1/records`)를 한 번도 안 탄다 (2-5를 기기로 못 본 이유) | 로컬 서버(`docker-compose`, `apiBaseUrl=10.0.2.2:8787`) 빌드로 업로드 루틴 하나 |

### 확인해 보니 괜찮았던 것

- 기록 중 홈 키 → `am kill`: 포그라운드 서비스 덕에 프로세스가 살아 있고 C-05까지 이어짐 (X7)
- ×8 재생에서도 B2·후진 2회 (X8) · C-03에서 뒤로 → C-02 → '괜찮아요' 정상 (X9)
- C-05 카운트다운 중 뒤로 키 → 보통·층 모름 둘 다 시간이 되면 저장됨 (X4)
- 실차 주행 6케이스 신호 충실도 100% (b3 차속 지연 최대 0.2초), 후진 중 후방카메라가 덮어도 기록 이어짐
- 정규 루틴의 운영 서버 쓰기(11~13)는 끝나고 정리됨 (주차왕 참여 취소 204, 폰 0건)
- ×1(실제 속도) 정규 루틴: VHAL 재시작에 걸린 11·12번 말고는 통과 — 속도에 따른 차이는 없음
- 시스템 글꼴 1.3: C-11·C-01·C-09·C-13·C-10·C-02·C-03·C-04·C-05·C-06·C-07 모두 넘치지 않음 (C-05 시각 잘림 하나)

### 다음에 할 것

- ~~1-6부터~~ → 오후에 1~3장 전부 고침 (위 '원인 분석·고친 것'). 커밋은 아직
- X1·X2b·X2c·X3b·X5·X6·X11·X13을 정규 루틴(`sim/sim_routines.py`)으로 옮기기 — 지금은 `captures/sim-20261105-findings/explore.py`(git 제외)에만 있음.
  실제 화면 검사는 `live_drive_test.py --real-screen`으로 옮겼다(`live_norefocus.py`는 이제 필요 없음)
- 1-3 크래시: 원인 경로(car service 재시작 → 프로세스 재시작 → 메인 스레드 대기)를 막았다. 다음에 VHAL이 죽을 때 `ForegroundServiceDidNotStartInTime`이 다시 안 나는지 logcat으로
- 4-4: 로컬 서버로 실제 업로드 경로 (2-5를 기기로)
- 3-6: 배너가 0.8 불투명도로 지도 위에서 읽히는지 실차 화면 눈 검토 (에뮬레이터 내비 지도는 비어 있어 판단 어려움)
