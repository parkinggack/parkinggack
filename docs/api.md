# 주차각 API v1

> 타입 기준: [`packages/api-types/index.ts`](../packages/api-types/index.ts) — 이 문서와 다르면 타입 파일이 맞다.
> 서버 구현: `apps/server` · 기본 포트 **8787** · 에뮬레이터에서 호스트 PC는 `http://10.0.2.2:8787`

## 전체 흐름

```
[차량 앱]
  내비 목적지 ──GET /v1/lots/match──▶ C-02 난이도 카드
  더 쉬운 곳 ──GET /v1/lots/:id/easier──▶ C-03 → 내비 경유지 추가 (NaviHelper)
  주차장 상세 ──GET /v1/lots/:id──▶ C-08 (별점: POST /v1/lots/:id/ratings)
  P → 저장 ──POST /v1/records (익명, 동의한 경우만)──▶ 서버가 그 주차장 점수 다시 계산
  폰으로 보내기 ──POST /v1/shares──▶ 짧은 링크 https://<web>/s/<code> → C-07 QR
       └ 오프라인이면 기존 fragment 링크(/p/<id>#...)로 대체

[폰 웹]  /s/<code> ──GET /v1/shares/:code──▶ M-01 · M-02   (/p/...#fragment 도 계속 지원)
[어드민] Bearer 토큰 ──/v1/admin/*──▶ W-01 대시보드 · 주차장 관리 · 기록 조회
```

모든 차량 쪽 호출은 **오프라인 우선**: 실패하면 마지막 캐시 → 앱에 내장된 시드 데이터 순으로 대체하고, 기록·별점은 대기열에 넣었다가 다시 보낸다.

## 공통

- JSON UTF-8, camelCase. 에러는 `{"error":{"code":"bad_request","message":"..."}}` + HTTP 상태
  (400 입력 검증 · 401 어드민 토큰 · 404 · 409 같은 id · 410 만료 링크 · 413 본문 16KB(어드민 64KB) 초과(code `bad_request`) · 429 · 500)
- CORS: 공개 GET/POST는 `*`. 어드민은 `ADMIN_ORIGINS` 환경변수 목록(기본 `http://localhost:5174,http://localhost:5173`), 사전 요청(OPTIONS)은 토큰 없이 통과
- 레이트 리밋: POST 공개 엔드포인트(기록·별점·짧은 링크 합쳐서) IP당 분당 60회 토큰 버킷 (429 `rate_limited` + `Retry-After` 초). 프록시 뒤면 `TRUST_PROXY=1` → `X-Forwarded-For` 마지막 주소
- 개인정보: 기록에는 좌표·정확한 시각·차량 식별값이 없다. 서버는 받은 시각도 **정시로 내려서** 저장한다. 모르는 키는 버린다. 공유 링크 payload는 48시간 뒤 삭제

## 공개 엔드포인트

| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| GET | `/health` | 상태 | `{ok, version}` |
| GET | `/v1/lots?lat&lng&radius=1000&limit=50` | 근처 주차장 (좌표 없으면 전체) | `ListLotsResponse` |
| GET | `/v1/lots/match?name&lat&lng` | 내비 목적지 → 주차장. 이름 부분 일치(별칭 포함) 우선, 없으면 250m 이내 가장 가까운 곳 | `MatchLotResponse` |
| GET | `/v1/lots/:id` | 상세 + 통계 | `LotDetailResponse` |
| GET | `/v1/lots/:id/easier?max=3&radius=1000` | 기준 주차장보다 쉬운 곳, 쉬운 순 | `EasierLotsResponse` |
| POST | `/v1/records` | 익명 주차 기록 (202). 같은 `clientRecordId`면 `duplicate:true`, 없는 주차장 404 | `RecordAcceptedResponse` |
| POST | `/v1/lots/:id/ratings` | 별점 1~5 (200). 같은 `clientRatingId`면 그대로 | `RatingResponse` |
| POST | `/v1/shares` | 짧은 링크 만들기 (201) | `CreateShareResponse` |
| GET | `/v1/shares/:code` | 짧은 링크 읽기 (404 / 410 만료) | `GetShareResponse` |

쿼리 범위: `lat` −90~90, `lng` −180~180(둘은 같이), `radius` 1~50000(`/easier`는 1~5000), `limit` 1~200, `max` 1~10. 벗어나면 400.

**`/v1/lots/match`** — 이름은 소문자로 바꾸고 공백·가운뎃점·괄호를 뺀 뒤 비교한다(`H스퀘어` = `h 스퀘어`).
목적지가 이름·별칭(`aliases`)을 품거나(`"현대백화점 판교점"` ⊃ `"현대백화점"`), 이름이 목적지(3자 이상)를 품으면 맞는 것으로 보고
더 길게 맞은 곳 → 가까운 곳 순. 좌표를 같이 보냈는데 이름이 맞은 곳이 **3km보다 멀면** 다른 지점으로 보고(예: "현대백화점 천호점") 버린다.
이름이 안 맞으면 **250m 안의 가장 가까운** 주차장(`matchedBy:"location"`), 없으면 `{lot:null, matchedBy:null}`.

**`/v1/lots/:id/easier`** — 기준 점수(데이터 부족이면 5.0)보다 낮은 곳 중 `radius` 안, 데이터 부족이 아니고 `suggestible`인 곳(집·회사 같은 개인 장소 제외).
`walkMinutes = max(1, ceil(직선거리m × 1.3 / 75))`, `pitch = "걸어서 {분}분, {문구}"` — 문구는 주차장 `pitch`(예 "훨씬 넓어요"), 없으면 태그로(`FLAT` "평면이라 편해요", `SPACIOUS` "자리 넉넉해요"), 둘 다 없으면 `"걸어서 {분}분"`.

**짧은 링크** — 코드 6자(충돌하면 7·8자), 글자 `abcdefghjkmnpqrstuvwxyz23456789`(0 o 1 l i 없음). payload 한도는 폰 웹 `payload.ts`와 같다:
`lot` ≤60자, `f`·`z`·`n` ≤12자, `m` ≤80자, `h` ≤4줄(줄마다 ≤80자), `r` 정수 ≤15개, `v` ≥1, `t` 양의 정수. 넘으면 400(자르지 않음).
키 순서는 차량 앱과 같게(`v, lot, f, z, n, t, m, h, r`) 저장하고 모르는 키는 버린다. 만료되면 내용을 바로 지우고 코드만 30일 남겨서 410을 준다(그 뒤 404).
`GET`은 `Cache-Control: no-store`. 만료 시간은 `SHARE_TTL_HOURS`(기본 48).

## 어드민 엔드포인트 (`Authorization: Bearer $ADMIN_TOKEN`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/v1/admin/overview` | 합계(+ `avgDifficulty`), 어려운/쉬운 곳 Top5, 시간대·요일 분포, 최근 기록 20 |
| GET | `/v1/admin/lots?q=` | 주차장 전체 (관리 필드 포함). `q`는 이름·id·주소·별칭 부분 일치 |
| GET | `/v1/admin/lots/:id` | 주차장 하나 `{ lot: AdminLot }` (404) |
| POST | `/v1/admin/lots` | 주차장 추가 (201, 같은 id 409) |
| PUT | `/v1/admin/lots/:id` | 메타데이터 수정 (이름·좌표·층·구역 체계·수동 태그·공공정보·요금·별칭·추천 문구·추천 후보·유형·지역·짧은 이름·램프 종류). 본문 `id`가 경로와 다르면 400 |
| DELETE | `/v1/admin/lots/:id` | 삭제 (기록·별점도 같이, 204) |
| GET | `/v1/admin/lots/:id/records?limit=100&before=` | 그 주차장 기록 (limit 1~1000) |
| GET | `/v1/admin/records?lotId=&demo=true\|false&limit=100&before=` | 전체 기록, 최신(id 큰) 순, `before`보다 작은 id만, limit 1~500. 응답 `nextBefore`(다음 쪽 커서, 끝이면 null). 없는 `lotId`는 404 |
| POST | `/v1/admin/recompute` | 전체 점수 재계산 `{ lots }` |

- `id`는 영문 소문자·숫자·`-` (예 `hyundai-pangyo`). 바꿀 수 없다(새로 추가하고 지울 것)
- overview: `totals.records`는 전체 기간, `records30d` 최근 30일, `shares`는 만료 전 링크 수, `avgDifficulty`는 difficulty가 null이 아닌 주차장들의 평균(소수 한 자리, 없으면 null).
  `hardest`/`easiest`는 difficulty null 제외. `byHour`(24)·`byWeekday`(7, 월..일)는 **최근 90일** 기록의 `parkedHour`/`parkedWeekday` 분포. `recentRecords`는 id 큰 순 20개
- `AdminLot`에는 공개 필드 + `manualTags`, `scoreSampleCount`(90일), `demo`, `createdAt`, `aliases`, `pitch`, `suggestible`, `shortName`, `rampKind`
- `shortName`(대시보드 짧은 이름, 1~30자)·`rampKind`(`NONE` · `STRAIGHT` · `SPIRAL`)는 주차장마다 저장한다. PUT 에서 `null` 이면 자동 — 짧은 이름은 이름 끝 "주차장"을 뗀 것,
  램프 종류는 90일 평균 램프 1바퀴 이상이면 `SPIRAL`, 층이 여럿이면 `STRAIGHT`, 아니면 `NONE`. 응답에는 늘 정해진 값이 온다

## 난이도 점수 (서버가 계산)

기록 한 건의 난이도 `d` (1~5):

```
d = clamp((1 + 0.55·후진 + 0.7·램프바퀴 + 0.35·max(0, (걸린초 − 40) / 30) + 0.12·핸들꺾음) × 차 크기 × 경력, 1, 5)
차 크기 보정: LARGE·SUV ×0.92, COMPACT ×1.05 (큰 차는 원래 어려우니 덜 반영)
경력 보정:   UNDER_1Y ×0.92 (초보는 원래 오래 걸리니 덜 반영)
(보정을 곱한 다음에 1~5로 자른다)
```

주차장 점수 (최근 90일, 베이지안 평균 — 표본이 적으면 3.0 쪽으로 당김):

```
score = (Σd + 3.0·k + Σ별점·0.5) / (n + k + 별점수·0.5),  k = 5      n·Σd = 최근 90일 기록, 별점도 최근 90일
difficulty = 소수 한 자리로 반올림. 최근 30일 기록 수(sampleCount) < 10 이면 null (데이터 부족 카드)
ratingCount = 최근 90일 별점 수
```

자동 태그(이 순서): 평균 후진 ≥ 2.5 → `FREQUENT_REVERSE`, 평균 램프 ≥ 1.5바퀴 → `SPIRAL_RAMP`, 평균 후진 ≤ 1 이고 평균 시간 ≤ 60초 → `SPACIOUS`, 층 ≥ 5 → `MANY_FLOORS`(층 수만 보므로 기록이 없어도 붙음).
**`tags` = 운영자 수동 태그 먼저(운영자 순서) → 자동 태그, 중복 제거, 최대 3개.** 수동 태그와 맞지 않는 자동 태그는 뺀다
(`NARROW_AISLE`이 있으면 `SPACIOUS`, `FLAT`이 있으면 `SPIRAL_RAMP`·`STEEP_SLOPE`).
수치 칩: 평균 후진 ≥ 2 → `"평균 후진 3.2회"`(소수 한 자리).

통계(`LotStats`, 90일 기록이 하나도 없으면 null): 평균은 그 주차장 90일(`avgReverse`·`avgRampTurns` 소수 한 자리, `avgDurationSec` 정수), `overall*`은 **전체 주차장 90일, 주차장마다 같은 무게**(90일 기록이 있는 주차장들의 평균을 다시 평균 — 기록이 아주 많은 한 곳이 "전체"를 끌지 않게. 대시보드 지역 평균과 같은 방식).
- 층별 혼잡: **평일(월~금) 13시 ≤ 주차 시각 < 18시** 기록의 층 분포를 최댓값 1로 정규화(소수 둘째 자리). 층 순서는 `floors`(위→아래), 90일 동안 기록이 없는 층은 뺀다. `congestionLabel`은 `"평일 오후"`
- `congestionSummary`: 0.95 이상이고 바로 아래층이 0.8 이상(다음 층으로 넘어감)인 층 → `"B1 만차"`, 그 아래에서 맨 아래층까지 모두 0.75 이하가 되는 가장 위층 → `"B3부터 여유"`.
  합쳐서 `"B1 만차 · B3부터 여유"`, 둘 다 없으면 `"층마다 비슷해요"`, 층이 하나면 `"한 층 주차장"`, 평일 오후 기록이 없으면 `""`
- 시간대 히트맵: `hourlyHeat[요일 0=월..6=일][칸]`, 칸은 10·12·14·16·18·20시부터 2시간(`hourLabels`), 기록 수를 최댓값 1로 정규화(소수 둘째 자리). 10시 전·22시 이후는 안 셈

점수는 `lots` 테이블에 캐시해 두고 그 주차장에 기록·별점이 들어올 때, 어드민 수정 때, `/v1/admin/recompute` 때, 그리고 30·90일 창을 갱신하려고 주기적으로(Node 서버 1시간마다 · Vercel 은 하루 한 번 Cron `GET /v1/cron/maintain`) 다시 계산한다.

## 시드 데이터 (v2 — 대시보드 시안 D-01~D-03 수치, `packages/insights-demo` 와 같은 숫자)

로컬 서버는 첫 실행(빈 DB) 때, Turso 는 노트북에서 `npm run seed` (비었을 때만) · `npm run seed -- --reset` (지우고 다시). 판교 9곳 + 테크원(데이터 부족 시연) + W-01 지도용 수도권 시연 주차장 41곳.
모든 합성 기록은 `demo=true`, **180일(30일씩 6칸)** 에 걸쳐 만들어 6개월 추이가 나온다(오래된 칸일수록 기록이 적음 — 사용자가 늘어난 모양).
결정적 난수라 같은 시각이면 같은 데이터.

**판교 9곳은 대시보드 시연 생성기 `packages/insights-demo` 의 `DEMO_LOTS` 를 그대로 쓴다** (서버 시드가 상대 경로로 import):
id·이름·짧은 이름·유형·좌표·층·램프 종류, ★·30일 대수·평균 후진·램프·시간, 6개월 추이, 층별 평균 후진, 그리고 도면(`generateFloorLayout`)·
동선(`generateOverlayPaths`, 층마다 30일 기록 수만큼)·후진 잦은 곳 — 어드민 시연 모드(`VITE_MOCK=1`)와 서버가 같은 숫자·같은 그림을 낸다.
id 는 차량 앱 `SeedLots` 와 같다 (`u-space-pangyo` · `botdeul-mall`; 예전 `uspace-pangyo` · `botdeul-shops` 는 없앴다).

| id | 이름 (짧은 이름) | 유형 | 층 · 램프 | ★ | 30일 대수 | 평균 후진 | 램프 | 평균 시간 |
|---|---|---|---|---|---|---|---|---|
| `hyundai-pangyo` | 현대백화점 판교점 지하주차장 (현대백화점 판교점 지하) | 백화점 | B1–B6 · SPIRAL | 4.3 | 1,284 | 3.2 | 2.5 | 2분 10초 |
| `u-space-pangyo` | 유스페이스 지하주차장 (유스페이스) | 오피스 | B1–B5 · SPIRAL | 4.1 | 642 | 2.9 | 1.5 | 1분 55초 |
| `h-square` | H스퀘어 지하주차장 (H스퀘어) | 오피스 | B1–B4 · SPIRAL | 3.9 | 871 | 2.6 | 2 | 1분 50초 |
| `pangyo-seven-venture` | 판교세븐벤처밸리 지하주차장 (판교세븐벤처밸리) | 오피스 | B1–B3 · SPIRAL | 3.6 | 515 | 2.4 | 1 | 1분 40초 |
| `botdeul-mall` | 봇들마을 상가 주차장 (봇들마을 상가) | 상가 | 1F · NONE | 3.4 | 233 | 2.3 | 0 | 1분 30초 |
| `hwarang-park-public` | 화랑공원 공영주차장 (화랑공원 공영) | 공영 | 1F · NONE | 2.9 | 402 | 1.8 | 0 | 1분 10초 |
| `alphadom-tower` | 알파돔타워 지하주차장 (알파돔타워) | 오피스 | B1–B4 · STRAIGHT | 2.4 | 958 | 1.5 | 0.3 | 1분 05초 |
| `avenue-france-pangyo` | 아브뉴프랑 판교 주차장 (아브뉴프랑 판교) | 상가 | B1–B3 · STRAIGHT | 1.8 | 1,106 | 1.1 | 0.2 | 50초 |
| `baekhyun-5` | 백현마을 5단지 지하주차장 (백현마을 5단지) | 아파트 | B1 · NONE | 1.6 | 377 | 0.9 | 0 | 40초 |
| `pangyo-new` | 판교 테크원 주차장 | 오피스 | 1F·B1–B4 | null | 3 | | | |

- 9곳 합 **정확히 6,388건**, 지역 평균 후진 **2.0회 (지난 기간 2.3회)**, 좋아진 곳(6개월 전 → 지금): 화랑공원 2.2→1.8 · H스퀘어 2.9→2.6 · 아브뉴프랑 1.4→1.1 · 알파돔 1.7→1.5
- 층별 평균 후진(D-02)은 생성기 값 그대로 (현대백화점 B1 2.1 · B2 3.6 · B3 3.4 · B4 3.0 · B5 2.8 · B6 2.6). 층 비율은 생성기 동선 수에서 시작해서 주차장 평균이 맞게 풀었다
- 생성기와 다른 곳은 **추이 5번째 칸(30~60일 전) 하나**: 생성기는 D-01 합계(2.0 · 2.3)를 상수로 박았지만 서버는 기록에서 계산하므로,
  다섯 곳(유스페이스·H스퀘어·세븐벤처·봇들마을 +0.4, 화랑공원 +0.33)의 그 칸을 높여 "지난 기간 2.3회"가 나오게 했다. 최근 칸은 표시값보다 0.04 낮게(반올림하면 같음) 넣어 "2.0회"
- C-08: 현대백화점 평균 후진 3.2 · 램프 2.5 · 2분10초, 전체 평균 1.4 · 0.8 · 65초(주차장마다 같은 무게 — 차량 앱 LiveServerE2ETest 가 1.4 ± 0.3 을 본다), "B1 만차 · B3부터 여유"
- 백현마을 5단지(아파트, 입주민용)는 "더 쉬운 곳" 추천 후보가 아니다(`suggestible: false`)

시연 기록은 시드 시각 기준이라, 서버는 흐른 시간(정시 단위)만큼 `demo` 기록·별점 시각을 앞으로 옮긴다(`DEMO_ROLLING`, 기본 켬). 여러 인스턴스가 동시에 해도 한 번만 옮겨진다.
그래서 며칠 뒤에도 "1,284대", "6,388건" 같은 시연 수치가 그대로다. 실제 기록은 옮기지 않는다.

---

## v1.1 — 폰 앱 페어링·동기화 · PC 대시보드 통계

> 디자인: 폰 앱 `docs/design/M-10~M-40`, PC 대시보드 `docs/design/D-01~D-03`. 타입은 `packages/api-types/index.ts` 하단 v1.1 절.

### 기기 인증 (계정 없음)
`POST /v1/devices {kind:"car"|"phone", name?}` → 201 `{deviceId, token}`. 이후 `Authorization: Device <token>`.
토큰은 32바이트 무작위(base64url 43자), 서버는 **SHA-256 만** 저장. 모르는/틀린 토큰은 401 `unauthorized`(`WWW-Authenticate: Device`) — 차량 앱은 401 이면 기기를 새로 등록한다.
차 전용 경로에 폰 토큰(또는 그 반대)도 401. `name` 은 40자까지(차종·폰 이름, 차량 번호·VIN 금지).

### 페어링 흐름 (차 C-10 › 폰 연결 ↔ 폰 M-13)
```
차  POST /v1/pairings  (차 토큰, 본문 {} 또는 없음) → 201 {code:"483920", url:"<PUBLIC_WEB_BASE>/pair/483920", expiresAt(10분)}
폰  QR → <web>/pair/483920  (또는 "코드로 연결할게요" → 6자리)
폰  POST /v1/pairings/483920/claim  {phoneName?}  (인증 없음) → 200 {token(폰), car:{deviceId,name,pairedAt}}
차  GET  /v1/pairings/483920 (차 토큰, 2초마다) → {status:"pending"|"claimed"|"expired", phoneName}
```
- 코드는 숫자 6자리, `PAIRING_TTL_MIN`(기본 10분). 다른 차의 코드는 404. 한 코드로는 폰 한 대만(두 번째는 410 `gone` "이미 연결에 쓴 코드예요"), 만료도 410, 없는 코드 404
- **무차별 대입 막기**: claim 이 실패(404·410)할 때마다 IP 버킷에서 하나 — 분당 `CLAIM_FAILURES_PER_MIN`(기본 10)번 틀리면 그 IP 는 맞는 코드도 429. 공개 POST 레이트 리밋(분당 60)도 같이. 코드는 10분 뒤 쓸모없어진다
- 차 한 대에 폰 여러 대 가능. 폰은 차 한 대에만

### 내 주차 동기화 (연결된 폰만 봄 · 익명 집계와 별개)
| 메서드 | 경로 | 누가 | 설명 |
|---|---|---|---|
| PUT | `/v1/me/parkings/:id` | 차 | 저장·수정(같은 id 는 덮어씀, "차 찾았어요" 표시는 유지) → `{parking}`. id 는 영문·숫자·`-_` 64자 |
| GET | `/v1/me/parkings?limit=50&before=<ISO>` | 차·폰 | 최신(`parkedAt`) 순, limit 1~100, `nextBefore` = 이번 쪽 마지막 `parkedAt` (끝이면 null) |
| GET | `/v1/me/parkings/current` | 차·폰 | **가장 최근 주차**가 아직 "차 찾았어요" 전이면 그것, 아니면 null (차는 한 곳에만 있으니 더 예전 것은 안 보여 줌) |
| GET | `/v1/me/parkings/:id` | 차·폰 | 한 건 `{parking}` (M-33). 이 차의 것이 아니면(다른 차·연결 안 된 폰) 404 |
| POST | `/v1/me/parkings/:id/found` | 폰·차 | 차 찾았어요 (처음 누른 시각 유지) → `{parking}`, 없으면 404 |
| GET | `/v1/me/stats` | 차·폰 | 이번 달·지난달 평균 후진, 최근 6개월(기록 있는 달만, "2026-11"), 자주 간 곳 Top3 — **한국 시간 달력** 기준, `summary` 없는 주차는 평균에서 뺌 |
| GET | `/v1/me` | 차·폰 | 폰: `{kind:"phone", car, phones, settings}` · 차: `{kind:"car", car:null, phones:연결된 폰 수, settings}` · 연결 안 된 폰: `car:null`, 기본 settings |
| PATCH | `/v1/me/settings` | 차·폰 | 같이 쓰는 설정 바꾸기(보낸 것만) → `{settings}`. 연결 전 폰은 409 `conflict` |
| DELETE | `/v1/me` | 차·폰 | 폰: 연결 끊기(이 폰 토큰·푸시 구독 폐기) · 차: 연결된 폰 모두 끊기(차 토큰은 그대로) → 204 |

- 한도(차량 앱 `MyParkingSync` 와 같음): `path` ≤ 300점, 점은 `[tMs, x, y, headingRad, reverse(0|1)]` 숫자 5개, `hints` ≤ 4줄(80자), `lotName`·`note` 80자, 층·구역·번호 12자, `route` 정수 64개, 본문 128KB
- 폰은 **연결된 차의 주차만** 본다. 다른 차의 주차 id 를 알아도 404. 같은 id 를 두 차가 써도 따로 저장(기본 키 = 차 + id)
- **같이 쓰는 설정** `settings: {shareAnonymous: boolean, experience: DrivingExperience}` — 차마다 하나(`car_settings`, 마이그레이션 v3), 기본 `{shareAnonymous: true, experience: "UNKNOWN"}`.
  폰 M-12(보낼게요 = true / 나만 볼게요 = false)·M-40 운전 경력이 쓰고, 차는 시작할 때·설정 화면에서 `GET /v1/me` 로 읽는다. `shareAnonymous: false` 면 차는 `/v1/records` 를 보내지 않는다.
  폰을 끊었다 다시 연결해도 차의 설정은 남는다. 모르는 필드·값은 400

### 알림 (선택, M-14)
- `GET /v1/push/key` → `{publicKey}` (VAPID). 서버에 `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY` 가 없으면 404 → 폰은 알림 버튼을 숨김
- `POST /v1/me/push` (폰) 본문 = 브라우저 `PushSubscription.toJSON()` (`endpoint` https, `keys.p256dh`, `keys.auth`) → 204 · `DELETE /v1/me/push` (본문 `{endpoint?}`, 없으면 이 폰 전부) → 204
- 차가 **새** 주차를 PUT 하면(같은 id 고칠 때는 안 보냄) 연결된 폰들에 웹 푸시:
  내용은 계약의 `PushMessage` 그대로 — `{"title":"주차각","body":"B2 · D-07에 주차했어요","url":"/","parkingId":"<id>"}` (필드 4개, 층·구역이 없으면 `"<주차장>에 주차했어요"`).
  푸시 서비스가 404·410 이면 구독을 지운다. 응답은 보내기(최대 5초)가 끝난 뒤

### PC 대시보드 통계 (공개 · 집계만, 개별 기록 없음 · `Cache-Control: public, max-age=60`)
| 경로 | 화면 |
|---|---|
| `GET /v1/insights/overview?region=pangyo&days=30` | D-01 개요: 합계, 지도(원 크기=기록 수, 진하기=난이도), 까다로운 곳, 요일×시간 평균 후진, 좋아진 곳(6개월) |
| `GET /v1/insights/lots/:id?days=30&floor=B2&maxPaths=300` | D-02 상세: 한 층의 겹친 동선, 후진 잦은 곳·도면(전 층), 층별 평균 후진, 이 주차장 vs 지역 평균 |
| `GET /v1/insights/compare?region=pangyo&category=&days=30` | D-03 비교: 표 + 6개월 후진 추이 (`category` 는 하나 또는 쉼표로 여러 개, 예 `DEPARTMENT,MALL`) |

- 기간: `days` 1~365(기본 30) → [지금 − days, 지금]. 지난 기간 [지금 − 2·days, 지금 − days). `region` 기본 `pangyo`, 그 지역에 주차장이 없으면 404
- 세 응답 모두 `demo: boolean` — 집계(또는 동선)에 시연(시드) 기록이 들어 있으면 true (화면에 "시연 데이터" 표시). compare 는 `{region:{id,name}, days, demo, lots}`
- 대상: 그 지역에서 **데이터가 충분한(difficulty 가 있는)** 주차장. 테크원(3대)은 빠진다
- **지역 평균 후진 = 주차장들의 평균 후진을 다시 평균**(주차장마다 같은 무게) — `totals.avgReverse`·`prevAvgReverse`·D-02 `regionAvgReverse`. 소수 한 자리
- 주차장 행(`InsightLotRow`): 기간 안 기록으로 평균 후진·램프(소수 한 자리)·시간(정수 초)·기록 수, `difficulty` 는 캐시된 점수(90일),
  `shortName`·`rampKind` 는 주차장에 저장된 값(어드민에서 고침, 없으면 자동 — 위 어드민 절). 어려운 순
- 추이(`trend`): 지금부터 30일씩 6칸, 오래된 → 최근, 칸 이름은 이번 달에서 k달 전(`"2026-06"`…`"2026-11"`), 기록 없는 칸은 빠짐
- 좋아진 곳(`improved`): 추이 첫 칸(5~6달 전) → 마지막 칸(최근 30일)이 줄어든 곳(소수 둘째 자리에서 0 초과), 많이 줄어든 순(같으면 어려운 순) 최대 4곳 —
  `insights-demo` `improvedLots` 와 같은 규칙. `name` 은 **짧은 이름**(`shortName`), `before`=첫 칸, `after`=마지막 칸, `trend` 는 6칸 값
- 히트맵(`heat`): `weekdays` 월~일 × `hours` `8시`·`10시`…`22시`(2시간씩 8칸, 8~23시) 평균 후진(소수 한 자리), 기록 없는 칸 null
- D-02 도면 좌표(미터, 원점 왼쪽 위): `layout[].aisles` = 통로 중심선 `[x1, y1, x2, y2]`(폭 3m), `ramps` = 나선 램프 `[cx, cy, r]`, `zones` = 구역 글자 위치,
  `hotspots[]` = `{x, y, r}` 원(m), `overlays[].paths` = `[x, y, 후진(0|1)][]` 동선 목록. 시드 도면은 `insights-demo` 생성기(65.6 × 35.84 m, 판교 9곳 28개 층).
- **동선은 한 층만**: `floor`(대소문자 무관)를 주면 그 층, 없거나 모르는 층이면 **동선이 가장 많은 층**(동선이 없으면 기간 안 기록이 가장 많은 층) —
  `insights-demo` `demoLotInsights(id, {floor:'auto'})` 와 같은 층. `maxPaths` 1~2000(기본 300)개까지 앞에서부터. 도면(`layout`)·후진 잦은 곳은 전 층(작음), `lot.floors` 도 전 층.
  현대백화점 기본 응답(B2 300개) 약 190KB. 도면·동선이 없는 주차장은 빈 배열
- 겹친 동선은 **주차장 도면 좌표에 맞춘 것만** 그린다. 차가 계산한 동선은 시작점 기준 상대 좌표라 차끼리 정렬할 수 없어서, 지금은 시드(시연) 동선만 있고 화면에 "시연용 예시"로 표시한다
- 기록 한 건을 알아낼 수 있는 값(기록 id·clientRecordId·받은 시각·차 크기 등)은 응답에 없다

주차장에 `category`(`DEPARTMENT` 백화점 · `MALL` 상가 · `OFFICE` 오피스 · `PUBLIC` 공영 · `APARTMENT` 아파트 · `OTHER` 기타, 기본 `OTHER`)와
`region`(영문 소문자·숫자·`-`, 예 `pangyo`, 기본 `other`)이 생겼다 — 모든 `ParkingLot` 응답에 있고 어드민 POST/PUT 으로 정한다.
지역 이름: `pangyo` 판교 일대 · `bundang` 분당 · `seoul` 서울 · `gyeonggi` 경기 · `incheon` 인천(없으면 id 그대로), 지도 중심은 주차장 좌표 평균.

### 주기 작업 · Cron
- 요청이 올 때 인스턴스마다 10분에 한 번: 시연 기록 시각 옮기기, 만료 짧은 링크 내용 지우기, 끝난 지 하루 지난 페어링 지우기
- `GET /v1/cron/maintain` (`Authorization: Bearer $CRON_SECRET` 또는 어드민 토큰) → 위 작업 + 전체 점수 다시 계산 + (v1.2) 주차왕 지난주·지지난주 순위 고정(아직 안 했으면) → `{rolledHours, sharesExpired, sharesPurged, pairingsDeleted, lots}`.
  Vercel 은 `vercel.json` crons 로 하루 한 번, Netlify 는 예약 함수 `netlify/functions/maintain.mts`(하루 한 번, HTTP 없이 직접), Node 서버는 1시간마다 스스로

### 배포 (무료)
- **Netlify (기본)**: 폰 앱 `parkinggack` · API `parkinggack-api`(Netlify Functions) · 대시보드 `parkinggack-data` + Turso(libSQL) — `scripts/deploy-netlify.sh`
- Vercel: Functions(Node, 서울 `icn1`) + Turso — `scripts/deploy-vercel.sh`. 로컬은 `file:` SQLite 그대로. 단계별: [docs/deploy.md](deploy.md)
- 웹: `apps/mobile`(폰 앱 PWA), `apps/admin`(대시보드 D-01~03 + 어드민) → 정적 배포 (`VITE_API_BASE`)

---

## v1.2 — 주차왕 (커뮤니티 순위)

> 디자인: 차 `C-13`(왼쪽 아이콘 메뉴 → 주차왕, 정차 중), `C-01`·`C-05` 한 줄 · 폰 `M-50`~`M-53`, 하단 탭에 '주차왕'. 타입은 `packages/api-types/index.ts` 맨 아래 v1.2 절.
> 서버: `apps/server/src/king.ts`(순수 계산) · `king-store.ts`(DB) · `routes-king.ts` · 시드 `seed/king.ts` · 마이그레이션 v4

**점수 (주마다, 100점)** = 후진·핸들 **70** + 가 본 주차장 **15** + 지난달보다 나아진 만큼 **15**
- 판정: 주차장 안 최고 속도(`summary.maxSpeedKmh`) > 10 이면 **빠짐**(`EXCLUDED`, `excludedReason:"SPEED"`), 아니면 후진 ≤1 이고 핸들 ≤2 면 **깔끔**(`CLEAN`), 그 밖은 **보통**(`OK`).
  `maxSpeedKmh` 가 없거나 null 이면 속도 조건은 건너뛴다. **빠진 주차는 점수·가 본 주차장·지난달 평균·배지 어디에도 안 센다** (목록 M-51 에만 "빠짐"으로 보임)
- 후진·핸들(70): 이번 주 빠지지 않은 주차마다 `70 × clamp(1 − 0.16·후진 − 0.04·max(0, 핸들 − 1), 0, 1)` 의 평균 (주차 1건만이면 0.8배 — 한 번 잘 댄 것으로 1등 되지 않게)
- 가 본 주차장(15): 이번 주 빠지지 않은 주차의 서로 다른 주차장 수 1→6, 2→10, 3→13, 4곳 이상→15 (`lotId` 로 구분, 없으면 `lotName`)
- 지난달보다 나아진 만큼(15): **이번 주 시작 전 30일**(주 중에 기준이 움직이지 않게) 평균 후진 `prev` 대비 이번 주 평균 후진 `cur` 이 준 비율 `clamp((prev − cur)/prev, 0, 1) × 15`.
  그 30일에 기록이 없으면 **7**, `prev = 0` 이면 이번 주도 0회일 때 15 · 아니면 0
- 후진·핸들·지난달은 각각 **반올림한 정수**(x.5 는 올림), `total` = 세 칸의 합 (화면의 "58 + 13 + 11 = 82" 가 늘 맞게). 요약(`summary`) 없는 주차는 빼고, 빠르기(걸린 시간)는 점수에 없다
- 이번 주에 빠지지 않은 주차가 없으면 점수 없음 → 순위·인원에 안 든다 (`rank: null`, `score: null`)

**리그·주기**: 리그 id `"<region>:<experience>"` — 동네(region) × 운전 경력. 이름은 `"판교 초보"` / `"판교 · 1년 미만"`
(`UNDER_1Y` 초보 · 1년 미만, `Y1_3` 새내기 · 1~3년, `Y3_10` 중수 · 3~10년, `OVER_10Y` 베테랑 · 10년 이상, `UNKNOWN` 모두 · 모든 경력; 동네 이름 `pangyo` 판교 · `bundang` 분당 · `seoul` 서울 · `gyeonggi` 경기 · `incheon` 인천, 없으면 id 그대로).
주는 **월요일 00:00 Asia/Seoul**(= 일요일 15:00 UTC)부터 다음 월요일 00:00 전까지, `week: {start, end}` 는 UTC ISO 이고 `end` 는 포함하지 않는다(M-53 "11월 2일 ~ 8일" = `end` − 1일).

**순위**: 점수 높은 순 → 같으면 후진·핸들 높은 순 → 같으면 먼저 참여한 순. 동점자도 등수는 하나씩(1, 2, 3 …).
`total` = 이번 주 순위에 든 사람 수(참여했지만 아직 점수 없는 사람은 뺌), `percentile = ceil(rank / total × 100)` (9/148 → 7).

| 메서드 | 경로 | 누가 | 화면 | 응답 |
|---|---|---|---|---|
| GET | `/v1/king/nickname?region=pangyo` | 누구나 | M-52 닉네임 "다시 뽑기" | `KingNicknameResponse` (`no-store`, 저장 안 함) |
| POST | `/v1/me/king/join` | 차·폰 | M-52 참여할게요 | 200 `{ me: KingMeResponse }` |
| DELETE | `/v1/me/king` | 차·폰 | 그만두기 | 204 (참여 중이 아니어도) |
| GET | `/v1/me/king` | 차·폰 | C-13 왼쪽 · M-50 위 카드 · M-51 · C-01 한 줄 | `KingMeResponse` |
| GET | `/v1/me/king/board` | 차·폰 | C-13 오른쪽 · M-50 목록 (상위 5 + 내 앞뒤) | `KingBoardResponse` |
| GET | `/v1/me/king/results/last` | 차·폰 | M-53 지난주 결과 · 공유 | `KingResultResponse` (지난주 점수가 없으면 404) |
| POST | `/v1/admin/king/demo-car` | 어드민 | 촬영용 시연 차 (아래) | `{scenario, replacedParkings, me, board, lastWeek}` |

- 차·폰 모두 **차 단위**: 폰 토큰은 연결된 차의 참여 정보를 본다. **연결 전 폰은 409 `conflict`**, 토큰이 없거나 틀리면 401
- **참여** `{nickname, region?}` (모르는 필드는 400): 닉네임은 앞뒤 공백을 떼고 공백 여럿을 하나로 바꾼 뒤 생성기 문법이거나 **한글·영문·숫자·띄어쓰기 2~20자** (아니면 400).
  지역은 보낸 값(`영문 소문자·숫자·-`) → 이 차가 **가장 최근에 댄 (서버가 아는, 지역이 정해진) 주차장의 지역** → `pangyo`. 경력은 그때의 `/v1/me/settings.experience`(`UNKNOWN` 이면 "모두" 리그)를 **참여할 때 고정** — 경력을 바꾸면 다시 참여해야 리그가 바뀐다.
  이미 참여 중이면 닉네임·리그를 바꾼다(참여 시각은 그대로). 같은 리그에서 **다른 차가 쓰는 닉네임이면 409**, 시연 참여자가 쓰는 닉네임이면 그 시연 참여자가 새 닉네임을 받는다
- **그만두기**: 순위판·인원에서 바로 빠진다. 주차 기록·지난 결과는 그대로, 다시 참여할 수 있다(참여 시각은 새로)
- **`GET /v1/me/king`**: 참여 전이면 `joined:false` 와 **참여하면 들어갈 리그**(M-52 "내 리그")·그 리그 인원, 나머지는 null/[].
  `parkings` = 이번 주에 댄 곳(요약 있는 것, 최신순, 빠짐 포함 — 이 차와 연결된 폰만 봄). `prevWeekRank` = 같은 리그 지난주 고정 순위의 내 등수
- **`nextHint`** — 깔끔한 주차(후진 0 · 핸들 1)를 **이번 주에 이미 간 주차장**에 한 번 더 했다고 치고 다시 매긴 등수(약속을 작게):
  `"한 번만 더 깔끔하게 대면 10등이에요"`. 그래도 그대로면 새 주차장으로 셈 → `"새 주차장에서 한 번 더 깔끔하게 대면 N등이에요"`, 아직 점수가 없으면 `"깔끔하게 한 번 대면 N등이에요"`,
  1등이면 `"1등을 지키고 있어요"`, 올라갈 수 없거나 참여 전이면 null
- **`board`**: `top` 1~5등, `around` = 내 앞·나·뒤 중 6등 이하만(내가 5등 안이거나 점수가 없으면 `[]`). 참여 전이면 들어갈 리그를 `isMe` 없이 보여 준다(M-52 미리 보기). `demo` = 시연 참여자가 섞여 있으면 true
- **개인정보**: 순위판 행은 `{rank, nickname, score, isMe}` 넷뿐. 다른 참여자의 주차장·시각·기기 id 는 어떤 응답에도 없다
- **`PUT /v1/me/parkings/:id` 응답에 `king`**: 참여 중이면 `{rankBefore, rankAfter}` (그 주차를 저장하기 전·후 이번 주 등수, 점수 없으면 null), 아니면 `king: null`. `parking` 은 예전 그대로.
  차는 요약에 `maxSpeedKmh`(기록 중 최고 속도, 0~400, 없거나 null 가능)를 같이 보낸다 — `my_parkings.summary` JSON 에 그대로 저장되고 응답 `parking.summary.maxSpeedKmh` 로 돌아온다

**지난주 결과(고정)**: 주가 바뀐 뒤 **처음 주차왕 요청 때**(그리고 하루 정리 `GET /v1/cron/maintain`·Netlify 예약 함수·Node 1시간 정리 때) 지난주·지지난주 순위가 아직 없으면 계산해서 `king_week_scores` 에 고정한다 (`setInterval` 없음).
그 주가 끝날 때 참여 중이던 사람만 들어가고(주 중에 그만두면 빠짐), 등수·인원·전 주 등수·개척자·깔끔한 한 주를 같이 저장해서 **나중에 늦게 올라온 주차가 있어도 결과가 바뀌지 않는다**. 인스턴스 여럿이 동시에 해도 한 벌만 남는다.
`rankDelta` = 지지난주 등수 − 지난주 등수(+ 올라감, 지지난주 기록이 없으면 null). 배지(이 순서):
`TOP10` 상위 10% 이하 · `TOP3` 3등 안 · `FIRST` 1등 · `PIONEER` 그 주에 (빠지지 않은 주차로) **그 주 끝 기준 최근 30일 익명 기록이 10건 안 되는** 주차장에 댄 적 있음(서버가 모르는 주차장도 0건) ·
`CLIMBER` `rankDelta ≥ 3` · `CLEAN_WEEK` 그 주 판정 받은 주차(빠짐 포함)가 모두 깔끔이고 3건 이상.

**닉네임 생성** "동네 형용사 동물": 동네 `pangyo` 판교·백현·삼평·운중 · `bundang` 정자·수내·서현·야탑·이매·미금 · `seoul` 성수·망원·서촌·잠실·연남·반포 · `gyeonggi` 광교·동탄·일산·평촌·죽전·위례 · `incheon` 송도·청라·부평·검단·영종·구월 (그 밖 "이웃"),
형용사 30개(조용한·단단한·느린·맑은·둥근·차분한·느긋한·다정한 …, 운전자를 평가하는 말 없음) × 동물 30개(고래·펭귄·거북·여우·너구리·두루미·수달·곰 …). 그 지역에서 지금 참여 중인 닉네임과 겹치지 않게 뽑는다(다 찼으면 끝에 숫자).

**시드 (시연 참여자, `demo=1`, 결정적)**: 판교 × 경력 5개 리그 — `pangyo:UNDER_1Y` 148명 · `Y1_3` 126 · `Y3_10` 203 · `OVER_10Y` 171 · `UNKNOWN` 64 (합 712, 지역 안에서 닉네임 안 겹침).
판교 초보는 시안 숫자: 1 백현 조용한 고래 96 · 2 삼평 단단한 펭귄 94 · 3 운중 느린 거북 93 · 4 판교 맑은 여우 91 · 5 백현 둥근 너구리 90 · 6~10등 89·88·87·86·85 ·
11 판교 차분한 두루미 84 · **12 판교 느긋한 수달 82** · 13 운중 다정한 곰 81 · 14~20등 80·79·79·78·76·76·75 · 그 아래는 생성(점수 세 칸도 그럴듯하게 나눔).
- **시연 참여자의 점수는 매주 같다** (참여자 행에 세 칸을 저장, 날짜를 옮기거나 다시 키를 매길 것이 없음). 그래서 며칠·몇 주 뒤에도 "이번 주"는 늘 시안 숫자이고,
  주가 끝나 고정할 때도 같은 숫자로 들어가서 **차가 이번 주에 본 등수가 다음 주 "지난주 결과"와 같다**. 새로 참여한 차는 실제 점수로 그 사이에 들어간다(인원 149)
- 이미 시드한 DB(v1.2 전)는 서버 시작(`SEED_ON_EMPTY`) 또는 `npm run seed` 때 시연 참여자만 더한다. `npm run seed -- --reset` 은 시연 참여자·고정 순위를 다시 만든다(실제 차 참여는 그대로, 고정 순위는 다음 요청 때 다시 계산)

**촬영용 시연 차** `POST /v1/admin/king/demo-car` (`Authorization: Bearer $ADMIN_TOKEN`) 본문 `{deviceId: "<차 기기 id>", scenario?: "board" | "results"}` (기본 board, 차가 아니면 404):
- 그 차를 판교 초보의 **"판교 느긋한 수달"** 로 만든다 — 차 설정 경력을 `UNDER_1Y` 로, 시연 참여자 수달은 지워서(인원 148 그대로), 같은 닉네임을 쓰던 다른 차는 그만두기 처리
- **그 차의 [이번 주 시작 − 30일, 다음 주 시작) 주차를 지우고**(`replacedParkings`) 시연 주차 9건을 넣는다 — **시연 차에만 쓸 것**. 모두 "찾음"이라 M-20 "지금 주차 중"을 가로채지 않는다.
  이번 주 4건(M-51): 아브뉴프랑 후진 0·깔끔 · H스퀘어 후진 2·보통 · 백현마을 5단지 시속 14km·빠짐 · 현대백화점 후진 1·깔끔 (목요일 밤 이후면 월·화·수·오늘, 그 전이면 이번 주 시작부터 지금까지 고르게) + 그 전 30일 5건(평균 후진 3.6, 지난주 1건은 판교 테크원)
  → **82점 = 58 + 13 + 11, 12등 / 148명**, `nextHint` "한 번만 더 깔끔하게 대면 10등이에요". 이미 간 주차장(예: 현대백화점)에 후진 0·핸들 1~2로 대면 PUT 응답 `king: {rankBefore: 12, rankAfter: 10}` (C-05)
- 지난 결과는 직접 정해 넣는다: `board` = 지난주 17등(77점) → C-13·M-50 "지난주 17등에서 올라왔어요" · `results` = 지난주 9등(86점) · 지지난주 12등 → M-53 9등 · 148명 중 · 상위 7% · 3계단 · 배지 상위 10%·개척자·많이 올랐어요
- 다시 불러도 같은 상태가 된다. 응답은 그 차의 `me`·`board`·`lastWeek`(없으면 null)

**시안과 다른 점** (규칙을 따랐음): M-51 의 점수 칸 "58 · **11** · **13**" 은 가 본 주차장 단계(6/10/13/15)에 11 이 없어서 서버는 **58 · 13 · 11**(합 82 는 같음), 아브뉴프랑은 "후진 0번".
M-53 "상위 6%" 는 `ceil(9/148×100)` = **7%**. 결과 배지에는 규칙대로 "많이 올랐어요"(3계단)도 붙는다.

**저장 (마이그레이션 v4)**: `king_participants`(차 한 대에 한 행 — id = 차 기기 id · 닉네임 · 지역 · 참여할 때의 경력 · 리그 · `joined_ms` · `left_ms` · `demo`, 시연은 고정 점수 세 칸) ·
`king_week_scores`(리그 · 주 시작 · 참여자 · 닉네임 · 점수 세 칸과 합 · 등수 · 인원 · 전 주 등수 · 개척자 · 깔끔한 한 주) · `king_weeks`(고정한 주).
