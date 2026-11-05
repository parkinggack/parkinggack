# CLAUDE.md — 주차각 모노레포 작업 규칙

## 먼저 읽을 것 (프로젝트 메모리)
- 기획: `docs/product/plan.md` — 기능 ID(F1~F9), 화면 ID(C-01~C-12, M-01~02, W-01), 카피 톤, 차량 UI 규칙(8장)
- 디자인: `docs/design/*.dc.html` (1280×720 차 화면, 390×844 폰), 토큰 `docs/design/tokens-jettae.json`, 메모는 `docs/design/canvas.json`의 `notes`
- Pleos SDK: `docs/pleos/sdk-reference.md` (상단 "바로잡은 사항" 표 필독) · 정확한 시그니처는 `docs/pleos/sdk-signatures/*.txt` (AAR javap)
- 에뮬레이터·심사: `docs/pleos/emulator-and-dev-guide.md` · 공모전 규정: `docs/competition/README.md`

## 구조
- `apps/vehicle` 차량 앱(Kotlin/Compose, AAOS). `apps/mobile` 폰, `apps/admin` 어드민 웹. 앱별 독립 빌드.
- 차량 앱 패키지 `com.parkinggack.app`:
  - `model/` 공용 데이터 모델 (UI·도메인·데이터가 공유하는 계약)
  - `domain/` 순수 Kotlin 로직(궤적·분석·층 추정·진입 감지·시뮬레이션). **android.* import 금지**, JVM 단위 테스트 필수
  - `data/` 저장소(주차장·기록·설정), `car/` AAOS Car API, `pleos/` Pleos SDK 래퍼
  - `session/` 주차 세션 상태 머신(오케스트레이터), `ui/` Compose (theme, components, screens)

## 규칙
- 주행 중(CarUxRestrictions.isRequiresDistractionOptimization) 화면은 배너·아이콘만, 터치 입력 없음. 키보드 금지.
- 카피: "실패/못함/서툴러요/위험 운전" 금지. 운전자를 평가하지 않는다.
- 상태는 색이 아니라 채움·굵기·단어로. 빨강·초록 상태색, 그라데이션, 그림자 없음.
- 차 화면 글자 14sp 이상, 버튼 64dp 이상(주요 76dp).
- Pleos SDK 리스너 파라미터는 nullable. `VehicleException`은 난독화돼 import 불가 → `e.message` 사용.
- 빌드: `cd apps/vehicle && ./gradlew assembleDebug testDebugUnitTest`. Maven Central이 429를 주면 `--max-workers=1`로 재시도.
- 비밀값(Client Secret 등)은 `apps/vehicle/secrets.properties` (gitignore). 커밋 금지.
