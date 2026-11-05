# 주차각 (Parkinggack)

> 주차하다 헤맨 흔적(후진·핸들·브레이크)을 차가 스스로 모아 **주차 난이도 지도**를 만들고, 내가 **몇 층 어디에 댔는지**까지 기억해 주는 Pleos Connect 주차 도우미 앱
>
> 현대자동차그룹 차량용 앱 개발 공모전 출품작 · 차량 앱(Pleos Connect) + 폰 웹 + PC 대시보드

## APK

| 항목 | 내용 |
|---|---|
| 파일 | [`apk/주차각_release.apk`](apk/주차각_release.apk) — release 빌드 (약 45 MB) |
| 패키지 · 버전 | `com.parkinggack.app` · 0.1.0 (versionCode 1) |
| 대상 | Pleos Connect (Android Automotive 14 · API 34), minSdk 28 |
| 서명 | APK Signature Scheme v3, 인증서 `CN=Parkinggack, O=Parkinggack, C=KR` |

## 실행 방법

### 1. APK 설치 (빌드 없이)

1. Android Studio SDK Manager에서 **Pleos Connect v2.1.0** 시스템 이미지를 받아 AVD를 만들고 켜요.
   스크립트로 하려면 `apps/vehicle/scripts/setup-emulator.sh` (Windows는 `.ps1`) — 자세히는 [docs/run-locally.md](docs/run-locally.md) 1~4장.
2. APK를 설치해요.
   ```bash
   adb install "apk/주차각_release.apk"
   ```
3. 앱 목록에서 **주차각**을 열어요. 위치·차속 권한을 허용하고 온보딩 3장을 넘기면 홈이 나와요.
   첫 실행 때 **예시 기록 13건**(최근 4개월)이 들어가 있어서 바로 최근 주차 위치, 기록·통계, 주차 동선을 볼 수 있어요.
   예시 기록은 서버로 보내지 않고, 설정 › 기록 모두 지우기로 지울 수 있어요.

### 2. 주차 한 번 해 보기

- **시나리오 재생** (차를 직접 몰지 않아도 돼요)
  ```bash
  adb shell am start -n com.parkinggack.app/.ui.MainActivity --es demo main --ef speed 2
  ```
  C-02 도착지 난이도 카드(★4.3) → "괜찮아요, 그냥 갈게요" → C-04 주차 기록 중(램프 2바퀴, 후진 2번) → C-05 "B2에 대셨나요?" 순서로 진행돼요.
- **직접 운전**: `adb forward tcp:8088 tcp:8088` 후 브라우저에서 Virtual Console <http://127.0.0.1:8088/> 을 열고 D → 서행 → R → P.
  앱이 반응하는 신호와 순서는 [docs/run-locally.md](docs/run-locally.md) 8장.

### 3. 폰 웹 · PC 대시보드 (설치 없음)

| 무엇 | 주소 |
|---|---|
| 폰 웹 (차 QR·공유 링크가 여는 곳) — 시연 데이터로 바로 보기 | https://parkinggack.vercel.app/?demo=1 |
| PC 대시보드 '주차각 데이터' | https://parkinggack-data.vercel.app |
| API 서버 | https://parkinggack-api.vercel.app (`/health`) |

### 4. 소스에서 빌드

```bash
cd apps/vehicle
./gradlew assembleDebug testDebugUnitTest   # 디버그 APK + 단위 테스트
./gradlew assembleRelease                   # release APK — 서명 설정 keystore.properties 필요 (keystore.properties.example 참고)
```

필요: JDK 17 이상, Android SDK 35 (`apps/vehicle/local.properties`의 `sdk.dir`). Pleos SDK는 `nexus-playground.pleos.ai`에서 자동으로 받아요 (토큰 불필요).

## 테스트 환경

| 항목 | 내용 |
|---|---|
| 에뮬레이터 | Pleos Connect v2.1.0 (Android 14 · API 34, arm64-v8a, 2560×1440), Android Emulator 37.2 |
| 확인한 것 (2026-11-05) | 새로 만든 AVD에 `apk/주차각_release.apk` 설치 → 권한 허용 → 온보딩 → 홈(예시 기록) → 시나리오 재생 C-02 → C-04 → C-05, 앱 종료 없음 |
| 개발 PC | macOS 26 (Apple Silicon) |
| 빌드 | Gradle 8.10.2 · AGP 8.8.2 · Kotlin 2.0.0 · JDK 17+ · compileSdk/targetSdk 35 · minSdk 28 |
| Pleos SDK | Vehicle 2.3.2 · NaviHelper 3.0.5 · FusedLocation 1.1.3 · STT/TTS 3.3.1 |
| 자동 테스트 | 차량 앱 JVM 단위 테스트 225개, 폰 웹 vitest 354개, 에뮬레이터 UI 시뮬레이션 루틴 14가지 ([docs/run-locally.md](docs/run-locally.md) 6-1장) |

## 저장소 구조

| 경로 | 내용 | 스택 |
|---|---|---|
| [`apps/vehicle`](apps/vehicle) | **차량용 앱** (Pleos Connect / Android Automotive) | Kotlin · Jetpack Compose · Pleos SDK |
| [`apps/mobile`](apps/mobile) | 폰 짝꿍 앱(PWA) — 차와 연결(QR·코드), 지금 주차 중·돌아가는 길(M-01·M-02), 주차장 난이도, 기록·동선(M-33), 설정. C-07 링크는 연결 없이도 열림. 서버 없이 시연 데이터 모드(`npm run dev:mock`) | Vite · Preact · TypeScript |
| [`apps/admin`](apps/admin) | 웹 — 공개 PC 대시보드 '주차각 데이터'(로그인 없음) + 운영자 화면(`#/admin`: 주차장 메타데이터·익명 기록·W-01 PT 비전). 서버 없이 시연 데이터 모드(`npm run dev:mock`) | Vite · React · TypeScript · Leaflet |
| [`apps/server`](apps/server) | API 서버 — 난이도 집계, 목적지 → 주차장, 짧은 링크 `/s/{code}`, 차 ↔ 폰 페어링·내 주차 동기화·웹 푸시, 대시보드 통계 `/v1/insights/*`, 어드민 API. 계약 [`packages/api-types`](packages/api-types) · [docs/api.md](docs/api.md) | Node · Hono · libSQL(SQLite·Turso) |
| [`apk`](apk) | 제출용 release APK | |
| [`docs`](docs) | 기획·디자인·SDK 자료 | Markdown |

각 앱은 자기 디렉터리 안에서 독립적으로 빌드한다 (공통 빌드 시스템 없음).

## 문서

- 기획서: [docs/product/plan.md](docs/product/plan.md)
- 디자인 시안: [docs/design/](docs/design/) — 토큰 [tokens-jettae.json](docs/design/tokens-jettae.json) · 화면 미리보기 [docs/screenshots/index.html](docs/screenshots/index.html) (브라우저로 바로 열기)
- Pleos SDK 레퍼런스: [docs/pleos/sdk-reference.md](docs/pleos/sdk-reference.md) · AAR 시그니처 [docs/pleos/sdk-signatures/](docs/pleos/sdk-signatures/)
- **내 컴퓨터에서 실행 (Pleos 에뮬레이터·시연 영상)**: [docs/run-locally.md](docs/run-locally.md)
- 에뮬레이터 시뮬레이션에서 찾은 문제와 고친 기록: [docs/sim-findings.md](docs/sim-findings.md)

## 개발자용

### 에뮬레이터 스크립트

macOS·Linux는 아래 `.sh`, Windows는 같은 이름의 `.ps1`
(`powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\setup-emulator.ps1`).

```bash
apps/vehicle/scripts/setup-emulator.sh          # 1회: SDK·JDK 확인, Pleos 이미지 설치(라이선스는 직접 동의), AVD "Pleos_Connect"
apps/vehicle/scripts/run-app.sh                 # 빌드 → 콜드 부트 → 설치 → 실행, Virtual Console http://127.0.0.1:8088/
apps/vehicle/scripts/demo.sh main --speed 1.5   # 시연 재생: C-02 카드 → 주행 C-04 → 주차 완료 C-05
apps/vehicle/scripts/demo.sh reset              # 앱 데이터 삭제 → 온보딩(C-11)부터
apps/vehicle/scripts/record.sh                  # 시연 영상 녹화 (captures/*.mp4)
```

- 단계별 안내·시연 영상 대본·Virtual Console·문제 해결: **[docs/run-locally.md](docs/run-locally.md)**
- Pleos 이미지를 못 쓰면 `--fallback` (Google Android Automotive API 34 이미지 — 화면과 시연 재생은 동작)
- 차량 앱은 디버그·릴리스 모두 배포 API를 기본으로 쓴다 (로컬 서버: `-PapiBaseUrl=http://10.0.2.2:8787`)

### 폰 앱

```bash
cd apps/mobile
npm ci
npm run dev:mock   # http://localhost:5173 — 서버 없이 시연 데이터 (npm run dev 는 VITE_API_BASE 서버에 붙음)
npm test && npm run build   # dist/ 정적 파일 → Vercel (Root Directory apps/mobile, 무료)
```

화면·페어링·알림·배포·WebView로 감싸는 법은 [apps/mobile/README.md](apps/mobile/README.md).

### API 서버

```bash
cd apps/server
npm ci
npm run dev     # http://localhost:8787 — 첫 실행 때 시연 데이터(판교 7곳 + 수도권 41곳). 에뮬레이터에서는 http://10.0.2.2:8787
npm test        # 엔드포인트·점수·시드 목표·CORS·레이트 리밋
```

환경변수·Docker·curl 예시는 [apps/server/README.md](apps/server/README.md), 흐름·점수 규칙은 [docs/api.md](docs/api.md).

**무료 배포 (Vercel — 폰 · API · 대시보드, DB 는 Turso)**: [docs/deploy.md](docs/deploy.md) · 한 번에 `scripts/deploy-vercel.sh --skip-seed` (Netlify 대안: `scripts/deploy-netlify.sh`)
