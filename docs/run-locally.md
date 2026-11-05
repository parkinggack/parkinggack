# 주차각 차량 앱 — 내 컴퓨터에서 실행하기

> 이 레포를 노트북에 받아서 **Pleos Connect 에뮬레이터**에서 차 화면을 띄우고, 시연 영상까지 찍는 순서.
> macOS(Apple Silicon·Intel) · Windows · Linux 모두. 스크립트는 [`apps/vehicle/scripts/`](../apps/vehicle/scripts/).
> 에뮬레이터 없이 화면만 보려면 → [화면 미리보기 갤러리](screenshots/index.html) (파일을 브라우저로 바로 열기)

## 0. 한눈에

| | macOS / Linux (터미널) | Windows (PowerShell) |
|---|---|---|
| 1회 설정 | `apps/vehicle/scripts/setup-emulator.sh` | `powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\setup-emulator.ps1` |
| 빌드·부팅·설치·실행 | `apps/vehicle/scripts/run-app.sh` | `...\run-app.ps1` |
| 시연 재생 | `apps/vehicle/scripts/demo.sh main --speed 1.5` | `...\demo.ps1 main -Speed 1.5` |
| 처음 상태로 (온보딩) | `apps/vehicle/scripts/demo.sh reset` | `...\demo.ps1 reset` |
| 시뮬레이션 루틴 14가지 (UI 테스트, 6-1장) | `apps/vehicle/scripts/sim.sh all` | `python apps\vehicle\scripts\sim\sim_routines.py all` |
| 스크린샷 / 녹화 | `screenshot.sh` / `record.sh` | `screenshot.ps1` / `record.ps1` |
| 로그 | `logcat.sh` | `logcat.ps1` |

모든 명령은 **레포 루트**에서 실행한다. 스크립트는 몇 번을 다시 돌려도 이미 된 단계는 건너뛴다.
옵션은 `-h`(bash) / `Get-Help .\apps\vehicle\scripts\run-app.ps1 -Detailed`(PowerShell).

---

## 1. 준비물

| 항목 | 내용 |
|---|---|
| Android Studio | **Ladybug Feature Drop(2024.2.2) 이상**, 최신 안정판 권장 (프로젝트가 AGP 8.8.2). 설치 후 한 번 열어서 기본 SDK 설치까지 끝낼 것 |
| JDK | **17 이상**. Android Studio에 들어 있는 JBR이면 충분 — 스크립트가 알아서 찾는다 (`JAVA_HOME`이 있으면 그걸 먼저) |
| 디스크 | 여유 **20 GB 이상**. Pleos 이미지 다운로드만 4.1 GB(x86_64) / 4.7 GB(arm64), 풀어 놓은 이미지 + AVD 데이터 별도. 대체 이미지(Google)는 1.4 GB |
| 메모리 | 16 GB 권장. AVD 4 GB + Android Studio + Gradle(최대 4 GB, `gradle.properties`) |
| CPU 가상화 | 아래 표 |
| Git | `git clone` 용 |

**CPU 가상화 켜기**

| OS | 할 일 |
|---|---|
| macOS (Apple Silicon / Intel) | 따로 할 것 없음 (Hypervisor.Framework). Apple Silicon은 arm64 이미지, Intel Mac은 x86_64 이미지를 쓴다 — 스크립트가 고름 |
| Windows | ① BIOS/UEFI에서 VT-x(Intel) 또는 SVM/AMD-V 켜기 ② **Windows 기능 → "Windows 하이퍼바이저 플랫폼"** 켜고 재부팅 (관리자 PowerShell: `Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform`). Hyper-V를 안 쓰는 PC면 SDK Manager › SDK Tools › *Android Emulator hypervisor driver (AEHD)* 도 된다. **HAXM은 단종**(최신 에뮬레이터에서 지원 안 함). Windows on ARM PC는 에뮬레이터가 지원하지 않음 |
| Linux | BIOS 가상화 켜기 → `sudo apt install qemu-kvm` → `sudo usermod -aG kvm $USER` → 로그아웃/로그인. `ls -l /dev/kvm` 이 보이고 내 계정이 읽고 쓸 수 있어야 함. VM 안의 리눅스면 중첩 가상화가 필요 |

확인: `setup-emulator`가 마지막에 `emulator -accel-check` 결과를 보여 준다 ("... is installed and usable").

## 2. 받기

```bash
git clone https://github.com/parkinggack/parkinggack.git
cd parkinggack
```

GitHub에서 ZIP으로 받았다면 Windows는 스크립트 차단을 풀어 줘야 한다: `Get-ChildItem apps\vehicle\scripts\*.ps1 | Unblock-File`

## 3. `local.properties`

Gradle이 Android SDK 위치를 아는 파일 (`apps/vehicle/local.properties`, gitignore 됨). **`setup-emulator`가 없으면 만들어 준다.**
Android Studio로 `apps/vehicle` 폴더를 열어도 자동으로 생긴다. 직접 쓴다면:

```properties
# macOS
sdk.dir=/Users/<나>/Library/Android/sdk
# Linux
sdk.dir=/home/<나>/Android/Sdk
# Windows (슬래시로 쓰거나 C\:\\Users\\... 처럼 이스케이프)
sdk.dir=C:/Users/<나>/AppData/Local/Android/Sdk
```

Pleos Client ID/Secret(`apps/vehicle/secrets.properties`)은 TTS·STT 서버 모드용이라 **시연에는 필요 없다**.

## 4. 1회 설정 — `setup-emulator`

```bash
apps/vehicle/scripts/setup-emulator.sh            # macOS / Linux
```
```powershell
powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\setup-emulator.ps1   # Windows
```

하는 일 (이미 돼 있으면 건너뜀):

1. Android SDK 찾기 — `ANDROID_HOME` → `ANDROID_SDK_ROOT` → `local.properties` → 기본 위치 (`~/Library/Android/sdk`, `~/Android/Sdk`, `%LOCALAPPDATA%\Android\Sdk`). 없으면 Android Studio 설치를 안내 (또는 `--sdk <폴더>`)
2. SDK Command-line Tools(`sdkmanager`, `avdmanager`)가 없으면 받아서 `cmdline-tools/latest`에 설치 (묻고 진행)
3. **Pleos SDK Update Site 등록** — `~/.android/repositories.cfg` (Android Studio › SDK Manager › SDK Update Sites 와 같은 파일). Apple Silicon이면 `crp-arm64-sys-img.xml`, 그 밖은 `crp-sys-img.xml`
4. 디스크 여유 확인
5. `platform-tools`, `emulator`, `platforms;android-35`, `build-tools;35.0.0`, **시스템 이미지** 설치
   → 이때 `sdkmanager`가 **42dot "Pleos Connect SDK License"** 전문을 보여 준다. **직접 읽고 `y`로 동의**해야 받는다 (스크립트가 대신 동의하지 않음)
6. CPU 가속 확인 (`emulator -accel-check`)
7. AVD **`Pleos_Connect`** 생성 — 이미지에 들어 있는 Pleos 하드웨어 프로필(Android Studio의 *Automotive › Pleos Connect v2.1.0*)이 있으면 그걸, 없으면 `automotive_1024p_landscape`. 그리고 `config.ini`에 **RAM 4096 MB, 콜드 부트**(`fastboot.forceColdBoot=yes`), 키보드 입력, GPU auto
8. `apps/vehicle/local.properties`에 `sdk.dir` (없을 때만)

**Pleos 시스템 이미지 정보** (update-site XML에서 확인, 2026-11-03)

| | Mac (Apple Silicon) | Windows · Linux · Intel Mac |
|---|---|---|
| Update Site | `.../connect-avd/2.x/crp-arm64-sys-img.xml` | `.../connect-avd/2.x/crp-sys-img.xml` |
| 패키지 | `system-images;android-34;pleos_car_emulator;arm64-v8a` | `system-images;android-34;pleos_car_emulator;x86_64` |
| API / tag / revision | 34 / `android-automotive` (vendor `pleos`) / 2 | 같음 |
| 이름 | Pleos Connect v2.1.0 APIs arm64 System Image | Pleos Connect v2.1.0 APIs Intel x86_64 Atom System Image |
| 다운로드 | `crp_car_arm64_emulator.zip` 4,669,762,816 B (≈4.7 GB) | `crp_car_emulator.zip` 4,087,751,964 B (≈4.1 GB) |
| 필요 | emulator 24 이상 | 같음 |

XML에는 화면 크기·스킨 정보가 없다 → 실제 해상도는 부팅 후 확인 ([12장](#12-에뮬레이터에서-꼭-확인할-것)).

**옵션**: `--fallback`(Google 이미지, [9장](#9-대체-이미지--google-android-automotive)) · `--recreate`(AVD 다시 만들기) · `--avd 이름` · `--lcd 1280x720@160`(화면 크기 덮어쓰기) · `--site-only`(Update Site만 등록하고 나머지는 Android Studio에서) · `--dry-run`(바꾸지 않고 할 일만 출력).
PowerShell은 같은 이름의 `-Fallback`, `-Recreate`, `-Avd`, `-Lcd`, `-SiteOnly`, `-DryRun`.

**Android Studio 화면으로 하고 싶다면**: `setup-emulator.sh --site-only` 후
Settings › Languages & Frameworks › Android SDK › SDK Platforms › *Show Package Details* › Android 14.0 (API 34) › *Pleos Connect v2.1.0 APIs … System Image* 체크 › Apply (라이선스 동의) →
Device Manager › + › Automotive › **Pleos Connect v2.1.0** › RAM 4 GB, Boot option **Cold boot**.

## 5. 실행 — `run-app`

```bash
apps/vehicle/scripts/run-app.sh
```

1. `apps/vehicle`에서 `./gradlew assembleDebug` (Maven Central이 429를 주면 `--max-workers=1`로 한 번 더)
2. 에뮬레이터가 안 떠 있으면 `emulator -avd Pleos_Connect -no-snapshot-load`(**콜드 부트**)로 띄우고 부팅 완료(`sys.boot_completed`)까지 기다림 — Automotive 이미지는 2~5분 걸릴 수 있다
   - 이미 떠 있으면 그대로 씀 (같은 AVD 이름 → 없으면 떠 있는 Automotive 기기 하나). 폰은 고르지 않는다
3. `adb install -r -g` — `-g`로 런타임 권한(차속 `CAR_SPEED`, 융합 위치)을 미리 허용해서 **시연 중 권한 창이 안 뜬다** (`--no-grant`로 끄기)
4. 시간대를 **Asia/Seoul**로 (Pleos AVD 기본은 America/Los_Angeles라 주차 시각이 "오전 4:08"처럼 나옴. `--timezone TZ` / `--keep-timezone`)
5. 새로 부팅했으면 Pleos 런처·내비가 다 뜰 때까지 기다린 뒤 앱 실행 — 바로 띄우면 뒤이어 뜨는 내비("서비스 연결 중")가 앱을 덮는다.
   실행 후 앱이 맨 앞인지 확인하고 아니면 3번까지 다시 띄운다
6. `adb forward tcp:8088 tcp:8088`, 화면 해상도·밀도 출력
7. **Virtual Console**: 브라우저에서 <http://127.0.0.1:8088/> (Pleos 이미지에만 있음)

자주 쓰는 옵션: `--no-build`(빌드 건너뛰기) · `--wipe`(AVD 데이터 초기화) · `--quick-boot` · `--headless` · `--gpu swiftshader_indirect` · `--boot-timeout 900` · `--serial emulator-5556` · `--timezone Asia/Seoul` · `--keep-timezone`.

**Pleos 화면에서 앱이 보이는 자리**: 에뮬레이터는 2560×1440 @160dpi이고, 앱은 런처 **오른쪽 칸 1682×1210px**에 뜬다
(왼쪽은 차량 위젯, 위는 상태 바, 아래는 공조·앱 독). 시안은 1280×676dp 기준이라 앱이 시안 폭에 맞춰 **×1.31로 키워** 그린다
(`ui/theme/DesignScale.kt`) → 앱 입장에서는 1280×921dp. 넉넉한 세로는 동선 그림·숫자 칸·최근 기록으로 채운다.
이 크기 그대로의 스냅숏: `docs/screenshots/vehicle/pleos_*.png`. 차 화면은 시안대로 **항상 다크**.
에뮬레이터 로그: `apps/vehicle/build/emulator/emulator-<AVD>.log`.

Android Studio로 해도 된다: `apps/vehicle`를 열고 기기 목록에서 `Pleos_Connect` 선택 → Run. (APK 위치: `apps/vehicle/app/build/outputs/apk/debug/app-debug.apk`)
빌드 없이 APK만 필요하면 GitHub Actions의 **vehicle-apk** 실행 결과(Artifacts)에서 받아 `adb install -r -g app-debug.apk`.

## 6. 시연 재생 — `demo`

에뮬레이터는 차속을 마음대로 바꾸기 어렵기 때문에, 앱 안에 **녹화한(합성한) 주행 신호를 재생하는 모드**가 있다
(`ScenarioGenerator`, 10 Hz · 결정적). `demo`가 이걸 켠다:

```bash
apps/vehicle/scripts/demo.sh main --speed 1.5      # 메인 시연 (C-02 카드부터)
apps/vehicle/scripts/demo.sh parallel --no-dest    # 카드 없이 바로 주행
apps/vehicle/scripts/demo.sh list
```

| 별칭 | 시나리오 id (`ScenarioGenerator.byId`) | 내용 |
|---|---|---|
| `main` | `pangyo-department-store` | 판교 백화점 지하. 25 km/h 접근 → 나선 램프 2바퀴(1F→B2) → 지나쳐 멈춤 → 후진 2번 직각주차. ×1에 약 1분 40초 (×1.5 ≈ 67초, ×2 ≈ 50초) |
| `parallel` | `parallel-parking` | 노상 평행주차, 후진 1번 |
| `angled` | `angled-parking` | 지상 사선주차, 후진 없음 |
| `flat` | `flat-lot-simple` | 평면 주차장, 램프·후진 없음 |
| `split` | `split-level` | 반 층 주차장. 램프 1바퀴 반 → 층이 애매함(신뢰도 낮음) → C-05가 층을 물어보고, 안 고르면 8초 뒤 층 없이 저장 |

- `--speed X` 재생 배속 0.25~8 (기본 1) · `--no-dest` 목적지 카드(C-02) 없이 바로 주행
- 재생은 시나리오의 '주차장 입구까지 거리'도 진입 감지에 같이 넣는다 (`--no-dest`여도). 거리 없이는 후진이나 큰 회전이 없는
  `angled`·`flat`이 '주차 기록 중'이 되지 않아 C-05까지 가지 않았다 (2026-11-04 시뮬레이션 루틴으로 찾아 고침).
  Live(실제 주행)는 내비 현재 위치(2초마다) → 기록 대상 주차장(경유지 > 목적지, 경로가 끝난 뒤에도 유지)까지 거리를 넣는다
- 목적지 있는 시연(기본)은 **C-02 카드에서 멈춘다** → "괜찮아요"를 누르거나 "더 쉬운 곳 보기 → 경유지로 안내"(C-03)를 누르면 1.5초 뒤 주행 재생 시작
- 재생이 끝나면 앱은 다시 실제(Live) 신호로 돌아간다
- `demo.sh reset` — 앱 데이터 삭제(`pm clear`) → 다음 실행에서 **온보딩 C-11**이 다시 나온다. 기록·설정이 지워지고 홈은 빈 상태("이렇게 기록돼요")부터. 권한은 다시 허용해 둔다.
  Pleos/AAOS는 운전자 화면이 **user 10**이라 스크립트가 `--user $(adb shell am get-current-user)`로 보낸다 (`--user` 없이 `pm clear/grant`를 치면 user 0에만 적용돼 앱이 그대로다)
- C-05에서 층을 확실히 모를 때(신뢰도 낮음)는 층 버튼부터 보여 주고, 고르지 않으면 8초 뒤 **층 없이** 저장한다 (기록을 잃지 않게)
- 가짜(목) 기록은 없다 — 홈·기록·'자주 가는 곳'은 실제로 주차한 기록만 보여 준다 (자주 가는 곳 = 기록이 많은 주차장 3곳).
  시연 재생(`demo.sh main`)이 끝나면 시연용 목적지(현대백화점)는 지워져 다음 실제 주차에 붙지 않는다
- `demo.sh stop` — 앱 강제 종료 (재생 중단)

실제로 보내는 명령 (손으로 할 때 참고):

```bash
adb shell am start --activity-single-top --activity-clear-top \
  -n com.parkinggack.app/.ui.MainActivity --es demo main --ef speed 1.5 [--ez dest false]
```

> 참고: 예전에는 앱이 꺼진 상태에서 이 인텐트로 켜면 C-02 카드가 바로 닫히는 버그가 있었으나 수정됨
> (내비 목적지의 초기값 null을 무시). `demo` 스크립트는 그래도 안전하게 앱을 먼저 띄운 뒤 보낸다.

## 6-1. 시뮬레이션 루틴 — 에뮬레이터에서 눈으로 보는 UI 테스트 (`sim`)

위 시연 재생으로 차를 '운전'시키고, 스크립트가 화면 글자를 읽어(`uiautomator`) **버튼을 직접 누르면서** 단계마다 기대한 화면이 떴는지 검사한다.
에뮬레이터 화면을 보고 있으면 앱이 혼자 온보딩부터 주차 완료·QR까지 넘어가는 게 보인다. 차(Virtual Console)는 건드리지 않는다.

```bash
apps/vehicle/scripts/sim.sh list          # 목록
apps/vehicle/scripts/sim.sh 1             # 하나
apps/vehicle/scripts/sim.sh all --open    # 열네 개 전부 (×2 배속, 약 23분) → 끝나면 결과 페이지 열기
apps/vehicle/scripts/sim.sh 11 12 13      # 운영 서버에 쓰는 것만 (약 4분)
apps/vehicle/scripts/sim.sh 1 2 3 4 5     # 기본 다섯 개만 (약 7분)
```

| # | 루틴 | 화면 흐름 | 시나리오 |
|---|---|---|---|
| 1 | 첫 실행 → 백화점 지하 B2 | C-11 온보딩 3장('익명 기록 보내기') → C-01 빈 홈 → C-02 ★4.3 → "괜찮아요" → C-04 배너·주차 기록 중·후진 2 → C-05 "B2에 대셨나요?" 후진 2회 → 맞아요 → C-01에 B2 → logcat으로 시연 기록이 서버로 안 나갔는지 | `main` (목적지 있음) |
| 2 | 더 쉬운 곳으로 경유 | C-02 → "더 쉬운 곳 보기" → C-03(후보는 서버) → "경유지로 안내" → C-04 "경유지 …" → C-05 1F·후진 1회, 주차장 이름 = 경유지 → C-01 | `parallel` (목적지 있음) |
| 3 | 구역 저장 → 폰으로 | C-05 1F · 머리줄에 장소 이름(목적지 없이도 P 위치의 주차장·주소) → "구역도 기억하기" → C-06 B1·C·07 → 저장 → C-07 QR·짧은 링크(`parkinggack.vercel.app/…`) → 닫기 → C-01에 "B1 · C-07" | `flat` |
| 4 | 내 동선 다시 보기 | C-05 → "동선 크게 보기" → C-12 사선주차·후진 0회 → 다시 보기 → 닫기 → C-05 → 맞아요 → C-01 | `angled` |
| 5 | 층을 모를 때 | C-05 "몇 층에 대셨나요?" → 손대지 않음 → "…초 뒤 층 없이 저장돼요" → 저장 → C-01 "위치 미기록" → C-09 모은 기록 1번 → C-13 화면 (참여 카드 / 순위 / 서버 연결 안내 중 하나) | `split` |
| 6 | 카드 끄기 설정 · 기록 지우기 | C-10에서 도착지 카드 '끄기' · 주차 완료 카드 끔 → 목적지 있는 주행인데 C-02 없이 '주차 기록 중' → P에서 C-05 없이 바로 저장 → C-01에 B2 → C-10 기록 모두 지우기 → 한 번 더 묻기 → 지우기 → 빈 홈 | `main` (목적지 있음) |
| 7 | 기록·주차장 상세 | C-09 기록 줄 → C-12 다시 보기 → C-01 '자주 가는 곳' → C-08 상세(난이도 근거·별점·경유지) → 별점 시트 열고 닫기(보내지 않음) → 뒤로 | `parallel` (목적지 있음) |
| 8 | 주행 중 앱 내렸다 다시 열기 | C-04 '주차 기록 중' → 홈 키 → 4초 뒤 다시 열기 → 기록이 끊기지 않고 C-05 후진 2회 → C-01 | `main` |
| 9 | 연속 두 번 주차 · 층 고치기 | C-05 맞아요 → 두 번째 C-05 "다른 층이에요" → C-06 B3 → C-01 B3 → C-09 모은 기록 2번(고쳐도 3건이 아님) · 장소 칸에 '주차 위치' 없음 | `flat` → `angled` |
| 10 | 지하에서 신호 끊김 (오프라인) | 시스템 프록시를 닿지 않는 주소로 → C-02가 기기 안 데이터로 뜸 → C-05 B2 → 폰으로 보내기 → C-07 서버 없이 만든 링크(`…/p/…`, 위치를 링크에 담음) → C-13 "인터넷에 연결되면 순위를 보여 드릴게요" → 프록시 지움 → 다시 시도 | `main` (목적지 있음) |
| 11 | 주차왕 참여 **(운영 서버에 씀)** | C-13 닉네임 다시 뽑기 → 참여할게요 → 이번 주 등수·점수 막대 → 서버 `GET /v1/me/king` joined=true → C-01 한 줄이 바뀜 → **끝나면 `DELETE /v1/me/king`으로 참여 취소** (순위판에 시험 참가자를 남기지 않음) | — |
| 12 | 별점 보내기 **(운영 서버에 씀)** | C-01 자주 가는 곳 → C-08 → 별점 ★4 (현대백화점 ★4.3 — 점수를 거의 흔들지 않게) → '고마워요' → 시트 닫힌 C-08이 점수·근거를 그대로 | `parallel` (목적지 있음) |
| 13 | 폰 연결 **(운영 서버에 씀)** | C-10 폰 연결 → 6자리 코드 → 스크립트가 폰 역할로 `POST /v1/pairings/<코드>/claim` → 차 '폰과 연결됐어요 · 시뮬레이션 폰' → C-10 연결됨 → 시연 주차 → 폰 토큰으로 `GET /v1/me/parkings` 0건 (시연 기록은 폰·주차왕으로 안 감) | `flat` |
| 14 | 예시 기록으로 첫 실행 | 앱 데이터만 지우고 예시 허용 → 온보딩 → C-01 아브뉴프랑 B2 · D-07 · 자주 가는 곳 → C-09 13건 · "…줄었어요" · '예시 기록 포함' → C-12 그 날짜 제목·후진 횟수 (6-2) | — |

- 루틴마다 **앱 데이터를 지우고**(`pm clear`) 온보딩을 넘긴 빈 홈에서 시작한다 → 몇 번을 돌려도 같은 결과. `--keep-data`면 기록을 그대로 둔다 (1번은 온보딩을 보려고 항상 지움)
- 시연 재생으로 생긴 기록은 id가 `demo-`로 시작해 **익명 기록을 켜도 서버로 보내지 않는다** (난이도 집계·주차왕·폰 동기화 모두. `ParkingRecord.staysOnDevice`).
  1번 루틴은 실제 사용자 기본값인 '익명 기록 보내기'를 골라 logcat `AppController: upload: demo-… stays on device`로 이걸 확인한다.
  2~13번은 혹시 몰라 '나만 볼게요'를 고른다. 주차왕 참여·별점·폰 연결은 **11~13번만** 운영 서버에 쓴다 (2026-11-04 허락받음).
  11~13번은 스크립트가 운영 API(`PG_API_BASE`, 기본 `https://parkinggack-api.vercel.app`)를 직접 불러 확인·정리하고, 차 기기 토큰은 `run-as`로 읽는다 (디버그 APK).
  주차장 찾기·더 쉬운 곳·주차왕 닉네임은 서버에서 **읽어** 오므로 인터넷이 필요하다
- C-13 주차왕은 서버 API(`/v1/me/king` 등, `docs/api.md` v1.2 — 서버 1.2.0부터)에서 읽는다. 서버에 닿지 않으면 "인터넷에 연결되면 순위를 보여 드릴게요"가 뜨고,
  5번 루틴은 이 경우도 화면이 열린 것으로 통과시키되 터미널에 `⚠` 줄을 남긴다
- 옵션: `--speed X` 주행 배속(기본 2) · `--pause S` 검사마다 멈춰 보는 시간(기본 1초) · `--step` 단계마다 Enter · `--record` 루틴별 mp4 · `--serial ID`
- 결과: `captures/sim-<시각>/report.html` — 루틴·단계별 통과/실패와 그 순간 스크린샷 (실패면 그때 화면에 있던 글자도). 종료 코드 0 = 전부 통과
- 터미널에는 `✓ 1-05 C-02 도착지 난이도 카드 ★4.3 (33s)`처럼 한 줄씩. 실패하면 기대한 글자와 실제 화면 글자를 같이 찍고 그 루틴만 멈춘 뒤 다음 루틴으로
- **앱 코드를 바꿨으면 `run-app.sh`로 다시 설치**하고 돌릴 것 (`split` 시나리오는 2026-11-04 이후 APK에만 있다 — 옛 APK면 "앱이 이 시나리오를 모름"으로 실패)
- 목적지 없이 댄 주차는 P 순간 내비 위치로 아는 주차장(250 m 안)을 찾아 이름을 붙이고, 없으면 내비 주소(에뮬레이터는 "수정구 시흥동")를 쓴다.
  Pleos 내비에 목적지가 걸려 있으면 그 주차장 이름이 붙는다 (예: H스퀘어). 검사는 특정 이름에 기대지 않는다
- 10번은 시스템 HTTP 프록시를 `127.0.0.1:9`로 걸었다가 끝나면(실패해도) 지운다. `Ctrl+C`로 멈췄는데 앱이 계속 오프라인이면 `adb shell settings put global http_proxy :0`.
  **비행기 모드는 쓰지 말 것** — Pleos 에뮬레이터는 `cmd connectivity airplane-mode disable` 뒤에도 eth0이 다시 안 올라와(셸 권한으로 못 올림) 재부팅해야 했다 (2026-11-04)
- **자동 점검**: 화면을 읽을 때마다 CLAUDE.md 규칙을 검사해 보고서 위쪽 '자동 점검 발견 사항'에 모은다 (루틴 통과/실패와 별개, `findings.json`도).
  카피 금지어('실패'·'못…'·'서툴'·'위험 운전') · 누르는 곳 64dp 미만 · 주행 화면(C-04)에서 누를 수 있는 것 · 이름 없는 버튼 · 14sp 미만으로 보이는 글자.
  크기 점검은 화면 전환 애니메이션 중의 순간을 거르려고 연속 두 번 읽혀야 남기고, 글자 크기는 칸 높이와 글자 폭 둘 다로 추정한다 (그래도 추정이니 스크린샷으로 확인)
- 도는 동안 에뮬레이터의 앱을 스크립트가 조작한다 — 손대지 말 것. 멈추려면 `Ctrl+C` (그때까지의 보고서는 남음)
- 본체는 `apps/vehicle/scripts/sim/sim_routines.py` (Python 3.8+, 표준 라이브러리만). Windows는 `python ...\sim_routines.py all`
- 신호 경로(Pleos SDK·차속 권한·조향 부호)까지 보려면 Virtual Console로 차를 실제로 굴리는 `apps/vehicle/scripts/live-drive/live_drive_test.py` (약 9분)

## 6-2. 예시 데이터 — 심사·시연용 (차 · 폰 · PC 대시보드)

세 화면 모두 **처음 열자마자 채워진 모습**으로 보이게 해 두었다. 셋 다 예시라는 표시가 있다.

| 어디 | 어떻게 채워지나 | 표시 · 지우기 |
|---|---|---|
| **차 앱** | 첫 실행 때 예시 기록 13건(`session/DemoSeed.kt`)을 넣는다. 최근 4개월, 달마다 후진이 줄어드는 흐름 → C-01 최근 주차 **아브뉴프랑 B2 · D-07 (약 2시간 전)** · 자주 가는 곳 3곳 · C-09 "지난달보다 후진이 …회 줄었어요" · 월별 그래프 · 기록마다 C-12 동선. 후진 횟수·동선은 시나리오 신호를 실제 분석 엔진에 흘려 얻은 값이라 서로 맞는다. 날짜는 실행 시각 기준이라 언제 열어도 같은 그림 | C-09 오른쪽 위 "예시 기록 포함 · 설정에서 지울 수 있어요". C-10 › 기록 모두 지우기 (지운 뒤엔 다시 안 넣음). id `seed-…` → 서버(난이도 집계·주차왕·폰)로 **안 보냄** |
| **폰 웹** | **https://parkinggack.vercel.app/?demo=1** 로 열면 온보딩 없이 바로 시연 데이터 (M-10 '시연 데이터로 둘러보기'와 같음): 지금 주차 아브뉴프랑 B2 D-07(차 앱과 같은 주차) · 기록 6건 · 6개월 통계 · 판교 주차장 10곳 · 주차왕 12등/148명 순위판. 서버에 아무것도 쓰지 않는다 | 설정의 차 상태 "시연 중" · 주차왕 "순위는 시연용 예시예요". 설정 › 시연 끝낼게요 |
| **PC 대시보드** | https://parkinggack-data.vercel.app — 운영 서버의 시연 시드(판교 9곳 · 30일 기록 6,388건, 날짜는 서버가 굴려 늘 최근 30일)를 읽는다. **서버가 응답하지 않으면 오류 화면 대신 브라우저 안의 같은 시연 데이터로 바로** 넘어간다 | 머리글 "시연용 예시 데이터" 배지 · 서버가 안 될 때는 "지금은 서버 없이 … 시연 데이터로 보고 있어요" + '서버 데이터로 다시 보기' |

```bash
apps/vehicle/scripts/demo.sh seed      # 차 앱 예시 기록을 지금 시각 기준으로 다시 (실제 기록은 그대로)
apps/vehicle/scripts/demo.sh reset     # 앱 데이터 지움 → 다음 실행에 온보딩 + 예시 기록
./gradlew assembleDebug -PdemoSeed=false   # 예시 기록 없는 빌드
```
- 시뮬레이션 루틴(6-1)은 1~13번이 앱 데이터를 지운 직후 `run-as`로 `shared_prefs/demo.xml`(seeded=true)를 써서 **빈 상태**로 시작하고,
  14번만 예시 기록이 들어간 첫 실행을 확인한다
- 시연 영상에서 '방금 주차'를 보여 주려면 예시 기록 위에 `demo.sh main`을 돌리면 된다 (새 기록이 맨 위)

## 7. 시연 영상 대본 (1~2분)

기획서 [12장](product/plan.md#12-시연-영상--pt-화면-순서) 순서. 녹화는 `record.sh start` → 촬영 → `record.sh stop` (`captures/`에 MP4, 최대 180초).
녹화 전에 `demo.sh reset`으로 깨끗한 상태를 만들고, 온보딩은 "시작하기"로 넘겨 둔다 (온보딩 장면도 찍으려면 그대로 시작).

| # | 장면 | 화면 | 하는 일 |
|---|---|---|---|
| 0 | (준비) | C-01 홈 | `record.sh start` |
| 1 | 목적지 설정 → 난이도 카드 | **C-02** ★4.3 어려움 | `demo.sh main --speed 1.5` — 앱이 목적지 "현대백화점 판교점"을 넣은 것처럼 시작 |
| 2 | 더 쉬운 주차장 → 경유지 | **C-03** | 카드의 "더 쉬운 곳 보기" → 후보에서 "경유지로 안내". Pleos 내비가 경유지를 받고 **잠깐 앞으로 떴다가(약 1초) 주차각이 다시 앞으로** 온다 — 그러려면 '다른 앱 위에 그리기'가 허용돼 있어야 하고 `run-app`·`demo reset`이 appops로 켜 둔다 |
| 3 | 주행 | **C-04** 배너 | 자동 (재생 시작, 25 km/h 접근) |
| 4 | 주차장 진입 → 실시간 기록 | **C-04** "주차 기록 중" | 자동 — 램프 2바퀴, 후진 2번이 재생된다. *실시간 조작 장면을 따로 찍으려면* 8장의 Virtual Console 순서대로 |
| 5 | P → 층 확인 → 구역 | **C-05** "B2 맞나요?" → **C-06** | "맞아요" 또는 "구역도 기억하기" → 층·구역·기둥 선택 → 저장 → **C-07**로 이어짐 (시안 흐름) |
| 6 | 내 주차 동선 | **C-12** | C-05의 동선 썸네일을 누르면 위에서 본 그림이 그려진다 (후진 점선, 전환점 번호) |
| 7 | 폰으로 보내기 | **C-07** QR → 폰 **M-01** | "폰으로 보내기". QR은 `parkinggack.vercel.app/p/…` (배포돼 있어 폰으로 찍으면 바로 M-01, 서버가 짧은 링크로 바꿔 줌). 로컬 폰 웹으로 보이려면 `apps/mobile`의 `npm run dev` → `http://<노트북 IP>:5173/dev/` ([apps/mobile/README.md](../apps/mobile/README.md)) |
| 8 | 마무리 (비전) | W-01 | 시안 [`docs/design/W-01.dc.html`](design/W-01.dc.html) (실제 구현 아님) |
| | | | `record.sh stop` |

팁: ×1.5면 주행 부분이 약 67초라 전체가 2분 안에 들어온다. 화면 한 장은 `screenshot.sh c05.png`.
`screenrecord`가 검은 화면만 찍히면 에뮬레이터 창의 *Extended controls(…) › Record and Playback*으로 녹화하거나 `run-app.sh --gpu swiftshader_indirect`로 다시 띄운다.

## 8. Virtual Console 쓰는 법 — 앱이 반응하는 신호

`run-app`이 `adb forward tcp:8088 tcp:8088`을 해 두므로 <http://127.0.0.1:8088/> 를 연다 (Pleos 이미지 전용).
**Motion** 탭의 기어·브레이크·조향각을 쓴다.

| 신호 | 출처 | 앱에서 하는 일 |
|---|---|---|
| 기어 P/R/N/D | Pleos Vehicle SDK `GearSelection` | D·R = 움직이는 중(C-04 오버레이). 기록 중 **P = 주차 완료 → C-05** |
| 조향각 | Pleos Vehicle SDK `SteeringWheelAngle` | 궤적의 휘는 정도. 앱 규약은 **왼쪽 +** (`LiveSignalSource.STEERING_SIGN`) |
| 브레이크 | Pleos Vehicle SDK `BrakePedal` | 밟으면 서행 가정 속도 0 |
| 차속 | AAOS `PERF_VEHICLE_SPEED` (권한 `CAR_SPEED`) | 궤적 길이. **3초 넘게 차속 신호가 없으면 D/R + 브레이크 뗌 = 1.4 m/s 서행**으로 가정 (`session/SignalSource.kt`) |

**실시간 기록 장면 만들기** (목적지 없음 기준, `LowSpeedEntryDetector` 규칙 B):

1. 기어 **D**, 브레이크 뗌 → C-04 오버레이
2. 그대로 **10초 이상** (15 km/h 미만 · P 아님이 10초 이어져야 함)
3. 기어 **R**로 1초 이상(서행 1.4 m/s면 1 m 이상 후진) — 또는 핸들을 크게 돌린 채 계속 (누적 회전 200° 이상) → **"주차 기록 중"**
4. 조향을 바꿔 가며 R ↔ D 몇 번 → 후진 횟수가 올라간다
5. **P** → C-05 → 동선 썸네일 → C-12

차속 신호가 계속 0으로 들어오는 에뮬레이터라면(권한을 허용해 둔 상태) 서행 가정이 켜지지 않아 차가 움직이지 않는다 →
`demo.sh live-speed off`(차속 권한을 거두고 "다시 묻지 않음"으로 → 서행 가정 사용), 되돌리기는 `demo.sh live-speed on`.
차속을 직접 넣어 보는 실험: `demo.sh vhal speed 1.4` / `demo.sh vhal gear D` (car_service 주입, Pleos 이미지에서 동작 미확인).

기타: 주행 중 UX 제한(`CarUxRestrictions`)이 걸리면 어떤 화면이든 C-04 오버레이만 보인다. 테마는 차량 `NIGHT_MODE`를 따른다(신호 없으면 다크).
GPS가 필요하면 `adb emu geo fix 127.1121 37.3926` (경도, 위도 순 — 현대백화점 판교점 근처).

## 9. 대체 이미지 — Google Android Automotive

Pleos 이미지를 못 받거나 부팅이 안 될 때:

```bash
apps/vehicle/scripts/setup-emulator.sh --fallback   # system-images;android-34-ext9;android-automotive;<x86_64|arm64-v8a>, AVD "AAOS_Google_34"
apps/vehicle/scripts/run-app.sh --fallback
```

- 일반 SDK 저장소의 **Android Automotive with Google APIs, API 34 (ext9) rev 5** (≈1.4 GB, emulator 35 이상). 화면은 디자인 기준인 **1280×720 @160dpi**로 맞춰 만든다 (`--lcd`로 변경)
- 설치 문제 없음: 병합된 매니페스트에 `<uses-library>`가 없고, `uses-feature android.hardware.type.automotive required=true`는 AAOS 이미지에서 충족, APK에 x86_64·arm64-v8a 네이티브 라이브러리 포함
- **되는 것**: 모든 화면, 시연 재생(`demo`), 기록·설정 저장, QR, 리셋
- **안 되는 것**: Pleos SDK(기어·조향·브레이크·내비)가 없어 logcat에 `VehicleGateway`/`NaviGateway` 경고가 찍히고(정상), Virtual Console 실시간 기록, C-03 "경유지로 안내"의 실제 내비 반영(`addWaypoint ... -> false` 로그, 화면은 계속 진행). 에뮬레이터 *Extended controls › Car data*로 차속은 바꿀 수 있지만 기어는 Pleos SDK로 읽으므로 기록은 시작되지 않는다

## 10. 에뮬레이터 없이 보기

- **[docs/screenshots/index.html](screenshots/index.html)** — 차 화면 30장을 흐름(① 출발 전 → ⑥ 설정·첫 실행)별로. 파일을 브라우저로 바로 연다. `docs/screenshots/mobile/`에 폰 화면이 생기면 같이 보인다
- 다시 그리기: `cd apps/vehicle && ./gradlew --max-workers=1 exportScreenshots` (Paparazzi, [README](screenshots/README.md))
- APK만: GitHub Actions **vehicle-apk** (main 푸시마다 빌드 + 단위 테스트, Artifacts에 `app-debug.apk`)

## 11. 문제 해결

| 증상 | 해결 |
|---|---|
| `adb: command not found` | 스크립트는 SDK 안의 adb를 직접 쓰므로 상관없다. 손으로 쓰려면 PATH에 추가 — macOS/Linux: `export PATH="$ANDROID_HOME/platform-tools:$PATH"`, Windows: `setx PATH "%PATH%;%LOCALAPPDATA%\Android\Sdk\platform-tools"` (새 창부터) |
| `JAVA_HOME`/`Unsupported class file major version`/sdkmanager가 Java 17 요구 | Android Studio JBR을 쓰게: macOS `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`, Windows `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"` |
| Windows: "스크립트를 실행할 수 없습니다" (ExecutionPolicy) | `powershell -ExecutionPolicy Bypass -File ...` 로 실행하거나 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. ZIP으로 받았으면 `Unblock-File` (2장) |
| sdkmanager가 Pleos 이미지를 못 찾음 (`Failed to find package`) | ① `~/.android/repositories.cfg`(Windows `%USERPROFILE%\.android\`)에 `src00=https\://nexus-playground.pleos.ai/.../crp-sys-img.xml`, `enabled00=true`, `count=1` 같은 줄이 있는지 (키는 `src00` — 점 없음) ② 회사망·프록시에서 `nexus-playground.pleos.ai` 접속 가능한지 ③ 한 번만 쓰는 방법: `SDKMANAGER_OPTS="-Dandroid.sdk.custom.url=<XML 주소>" sdkmanager --list` ④ Android Studio GUI (4장 끝) |
| 라이선스 질문 없이 설치가 멈춤 | 파이프·CI가 아닌 **대화형 터미널**에서 다시 실행 (라이선스는 직접 `y`) |
| 에뮬레이터가 안 뜸 / 바로 꺼짐 | 로그 `apps/vehicle/build/emulator/emulator-<AVD>.log`. 가속: `"$ANDROID_HOME/emulator/emulator" -accel-check` → macOS는 보통 문제없음 · Windows는 1장 WHPX/AEHD (HAXM 단종, AEHD는 Hyper-V와 같이 못 씀) · Linux는 `/dev/kvm` 권한. 그래픽 문제면 `--gpu swiftshader_indirect`. 데이터 꼬임이면 `--wipe` 또는 `setup-emulator --recreate`. 메모리 부족이면 다른 앱 종료 |
| 부팅 대기 시간 초과 | 첫 콜드 부트는 오래 걸린다: `run-app.sh --boot-timeout 900` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 다른 키로 서명된 앱이 이미 있음: `adb uninstall com.parkinggack.app` 후 다시 |
| `INSTALL_FAILED_MISSING_SHARED_LIBRARY` | 지금 APK는 `<uses-library>`를 요구하지 않는다. Pleos SDK를 올린 뒤 생겼다면 `aapt2 dump badging app-debug.apk \| grep library`로 어떤 라이브러리인지 보고, AAOS 이미지(Pleos 또는 `--fallback`)인지 확인 |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | APK에는 x86_64·arm64-v8a가 다 있다. 폰용 이미지(armeabi 등)가 아닌지 확인 |
| feature 불일치 (`android.hardware.type.automotive`) | `adb install`은 uses-feature를 검사하지 않는다. 일반 폰 에뮬레이터에 깔면 설치는 되지만 Car API가 없어 의미가 없다 → Automotive AVD를 쓸 것 |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | `run-app.sh --wipe` 또는 `setup-emulator --recreate` |
| Gradle 다운로드 429 | `./gradlew --max-workers=1 assembleDebug` (run-app은 자동으로 한 번 더 시도) |
| C-02 카드가 떴다 바로 사라짐 / 재생이 안 시작됨 | 6장 ⚠️ — 앱을 먼저 켠 뒤 시연 인텐트. `demo` 스크립트를 쓰면 된다 |
| 앱이 종료됨 / Pleos SDK 오류 | 아래 logcat |

**logcat** (`logcat.sh`, 또는 직접):

```bash
adb logcat -v time -s MainActivity:V AppController:V CarSignals:V VehicleGateway:V NaviGateway:V AndroidRuntime:E
apps/vehicle/scripts/logcat.sh --all     # 앱 프로세스 전체 (Pleos SDK 내부 로그 포함)
```

자주 보이는 줄: `CarSignals: Car.createCar failed (AAOS 아님?)` → 일반 폰 이미지 · `VehicleGateway: gear: ...` / `steering: ...` → Pleos Vehicle SDK 호출 오류(메시지에 `ErrorCode` 이름이 들어오는지 확인) · `NaviGateway: navi error: ...` → 내비 없음/초기화 전 · `MainActivity: demo pangyo-department-store x1.5 dest=true` → 시연 인텐트 받음 · `AppController: addWaypoint ... -> true|false`.

## 12. 에뮬레이터에서 꼭 확인할 것

처음 Pleos 이미지로 띄웠을 때 확인해서 [기획서 15장 열린 질문](product/plan.md#15-열린-질문)과 디자이너에게 알려 줄 것.

확인 결과(2026-11-03, Pleos Connect v2.1.0 arm64, Apple Silicon)는 각 줄 끝의 **→**.

- [x] **화면 해상도·밀도** — `run-app`이 출력하는 값, 또는 `adb shell wm size` / `adb shell wm density`. UI는 **1280×720 @160dpi**(1dp=1px), 맨 위 **44px OS 띠**를 빼고 1280×676을 쓴다고 가정했다. 다르면 스크린샷(`screenshot.sh`)을 `docs/screenshots/vehicle/`과 겹쳐 비교
  **→ 2560×1440 @160dpi. 앱 창은 런처 오른쪽 칸 1682×1210px** → `DesignScale`로 ×1.31 (5장)
- [x] **조향 부호** — Virtual Console에서 핸들을 **왼쪽**으로 돌린 채 D로 서행 → P → C-12 동선이 **왼쪽으로** 휘어야 한다. 반대면 `apps/vehicle/app/src/main/java/com/parkinggack/app/session/SignalSource.kt`의 `LiveSignalSource.STEERING_SIGN`을 `-1f`로
  **→ 지금 값(1f)이 맞다**: Virtual Console 왼쪽(−400)이 앱에 +400으로 들어오고, 왼쪽으로 크게 돌린 전진이 C-05에 왼쪽(반시계) 호로 그려짐
- [x] **Virtual Console로 차속을 바꿀 수 있는지** (문서에는 없음). 안 되면 `demo.sh vhal speed 3` 시도 후 값 읽기: `adb shell cmd car_service get-property-value 0x11600207`
  **→ ACCEL을 누르고 있는 동안만** `PERF_VEHICLE_SPEED`(0x11600207)가 오른다. 4초면 69 km/h까지 올라 저속 진입 조건(15 km/h 미만)을 넘기니 **짧게 톡톡** 누르거나 `demo.sh live-speed off`(서행 1.4 m/s 가정)로.
  ACCEL을 안 누르면 D여도 0 → 권한이 있는 상태에선 차가 멈춘 것으로 계산된다. Virtual Console 탭이 열려 있으면 그 화면의 물리 계산이 API로 넣은 차속을 덮어쓴다
- [ ] **AAOS 차속 권한** — `adb shell dumpsys package com.parkinggack.app | grep CAR_SPEED` 가 `granted=true`인지 (`run-app`은 `-g`로 허용). 허용 상태에서 차속 0이 계속 들어와 차가 안 움직이면 `demo.sh live-speed off`
- [ ] **NaviHelper 목적지 이벤트** — Pleos 내비에서 목적지를 "현대백화점 판교점"(앱이 아는 이름: 현대백화점·아브뉴프랑·알파돔·판교공영·H스퀘어·테크원, 또는 시드 주차장 250 m 이내 좌표)으로 정하면 C-02가 뜨는지. 앱 시작 직후 내비가 보내는 "목적지 없음/빈 목적지" 값이 시연 카드를 닫지 않는지
- [x] **C-03 경유지 추가** — "경유지로 안내" 후 logcat `addWaypoint ... -> true`, 내비 화면에 경유지가 생기는지
  **→ `AppController: addWaypoint 아브뉴프랑 판교 주차장 -> true`** (시연 재생 중)
- [ ] **주행 중 제한** — D로 움직일 때 `CarUxRestrictions`가 걸려 C-04만 보이는지, P에서 풀리는지
- [ ] **후진 시 후방 카메라** — R에서 OS 카메라 화면이 앱을 덮어도 기록이 이어지는지 (P 후 C-05의 후진 횟수)
  **→ R이면 Pleos 후방 카메라 앱이 오른쪽 칸을 덮는다.** 앱이 백그라운드로 10초 넘게 있으면 Android가 프로세스를 얼려
  (`ActivityManager: freezing <pid> com.parkinggack.app`) 신호가 끊긴다 — 포그라운드 서비스 등으로 막아야 함 (내비가 앞에 있는 평소 주행도 같음)
- [ ] **Pleos SDK 오류 메시지 형식** — `VehicleException` 메시지에 `ERROR_...` 이름이 들어오는지 (logcat `VehicleGateway`)
- [ ] (있으면) `WHEEL_TICK` 공개 여부, 조향각 신호 주기, 기압·가속도 센서 — 기획서 15장

## 13. 주행 중 지도 (C-04 · C-02 바탕)

Pleos NaviHelper에는 **내비 지도를 앱 안에 넣는 API가 없다** (`requestNavigationScreen(Foreground)`로 내비를 앞으로 띄우는 것만 있음).
그래서 앱 안에 지도를 직접 그린다 — `ui/components/LiveMap.kt` (osmdroid + **Esri Dark Gray Canvas** 타일, 키 없음).
- 내 차 위치: Pleos FusedLocation. 없거나 목적지에서 30 km 넘게 떨어져 있으면(에뮬레이터 기본 GPS 등) 목적지·경유지 주차장 주변을 보여 준다. 위치를 옮기려면 `adb emu geo fix 127.1121 37.3926`
- 터치 입력 없음(주행 중 규칙). 경로선은 없다 (NaviHelper가 경로 좌표를 주지 않음)
- **인터넷이 필요**하다. 안 되면 타일 자리가 먹색으로 남는다. 출처 표시 "Esri · © OpenStreetMap"은 지우지 말 것
- CARTO dark_all은 2026-11 현재 키가 없으면 워터마크 타일이라 쓰지 않는다. 제품 배포 전에는 지도 제공사 약관(Esri 계정 등)을 다시 확인할 것
- 스냅숏(Paparazzi)에서는 네트워크가 없어 예전처럼 판교 경로 그림을 그린다

---

참고: Pleos SDK·에뮬레이터 원문 정리는 [docs/pleos/sdk-reference.md](pleos/sdk-reference.md) 10장, 스크립트 소스는 [apps/vehicle/scripts/](../apps/vehicle/scripts/).
