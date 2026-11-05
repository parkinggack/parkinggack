# apps/admin — 주차각 데이터 (공개 대시보드) + 운영자 화면

웹 앱 하나에 두 부분이 있다.

1. **공개 대시보드 '주차각 데이터'** (기본 화면, 로그인 없음) — 주차장 운영사·지자체·보험사가 보는 PC 대시보드.
   차에서 모인 익명 주차 기록을 **주차장 단위로 묶은 값만** 보여 준다 (개별 기록 없음). 시안 v2 [D-10](../../docs/design/D-10.dc.html) ·
   [D-11](../../docs/design/D-11.dc.html) · [D-12](../../docs/design/D-12.dc.html) + [D-03](../../docs/design/D-03.dc.html), 메모는 `docs/design/canvas.json` 의 `ws2`.
2. **운영자 화면** (`#/admin/...`, 관리자 토큰) — 차량 앱이 받아 가는 주차장 메타데이터(층·구역 체계·운영자 태그·공공정보·요금·**유형·지역**)를
   고치고 익명 기록을 본다. 예전 첫 화면 W-01 난이도 지도는 **'PT 비전 (이전 시안)'** 으로 남겼다 — 기획서 [F9 · 12장 8번](../../docs/product/plan.md).

### 공개 대시보드 (로그인 없음)

| 화면 | 주소 | 내용 | API (공개 GET) |
|---|---|---|---|
| **D-10 난이도 한눈에** | `#/` | 요약 4칸(평균 난이도 · 기록 · 한 번에 들어간 비율 · 후진 다발 지점), 9곳을 난이도 자 위에 한 줄씩(점 크기 = 기록 수), 주차장별 카드(작은 평면 + 후진 다발 지점, 정렬 3가지), 이번 달 눈에 띄는 변화, 내보내기 안내 | `GET /v1/insights/overview` · `GET /v1/insights/lots/:id?maxPaths=1` (주차장마다 후진 잦은 곳) |
| **D-11 주차장 상세 · 어떻게 대고 있나** | `#/lots/:id?floor=` | 층 고르기(층 난이도), **층 평면 위 동선 · 후진 구간 · 몰리는 곳**(각각 켜고 끔, 먹색 바닥 + 흰 선), 지점 목록(누르면 평면에 크게 + 바꿔 볼 만한 것), 주차 방향 · 한 번에 들어간 비율 · 들어와서 대기까지 · 차 크기별, 요일 × 시간, 바꾸고 나서 좋아졌나요, 리포트 PDF(A4 인쇄) | `GET /v1/insights/lots/:id?floor=&maxPaths=2000` (+ 순위·지역은 overview) |
| **D-12 데이터 내보내기** | `#/export?lot=` (`lot=id,id` · `all`) | 데이터 5종 × 범위(주차장 · 기간 · 층 · 차 크기) × 형식, 실제 파일 앞 5줄 미리보기, 파일에 들어 있지 않은 것, **브라우저에서 실제로 만드는 CSV · Excel · Parquet · GeoJSON**, 내보낸 기록(다시 받기), API 안내(그림) | `GET /v1/insights/overview?days=` (기간 기록 수) · `GET /v1/insights/lots/:id?maxPaths=1` |
| **D-03 비교표** | `#/compare?type=` | 유형 칩(전체 / 백화점·상가 / 오피스 / 공영 / 아파트), 열 제목으로 정렬하는 표(주차장 · 유형 · 난이도 · 평균 후진 · 램프 · 평균 시간 · 기록 · 6개월 후진 추이) | `GET /v1/insights/compare?region=pangyo&days=` |

API 에 없는 값(한 번에 들어간 비율 · 주차 방향 · 차 크기별 · 걸린 시간 분포 · 개선 전후 · 눈에 띄는 변화 · 내보내기 기록 · API 키)은
`src/dashboard/v2demo.ts` 한곳의 **시연용 예시 값**이고, 다른 주차장·층 값은 API 값(층별 평균 후진 · 평균 시간)에서 결정적으로 만든다.
D-12 파일은 서버가 개별 기록을 공개하지 않으므로 API 집계에 맞춘 시연 기록(`src/dashboard/export/records.ts`)으로 만든다 —
위경도·차량번호·VIN·주차장 밖 경로 없음, 시각 30분 단위, 좌표는 입구 기준 상대 좌표(m), 5대 미만 칸·시간대는 집계에서 빼고 세션의 칸은 구역만.
메일 · 매주 자동 · API 키 만들기는 시연 화면에서 하지 않으며 화면이 그렇다고 말한다.

머리글: 난이도 한눈에 / 주차장 상세(마지막으로 본 곳, 없으면 가장 어려운 곳) / 데이터 내보내기 / 비교표, '시연용 예시 데이터' 표시, 지역, 기간(최근 7 · 30 · 90일).
서버에 연결이 안 되면 차분한 안내와 **'시연 데이터로 보기'** 버튼 → 이 탭에서만 브라우저 안의 시연 데이터로 (바닥글의 '서버 데이터로 다시 보기'로 돌아감).

### 운영자 화면 (`#/admin`, 관리자 토큰)

| 화면 | 주소 | 내용 | API |
|---|---|---|---|
| **주차장 관리** | `#/admin/lots?q=&kind=` (`#/admin` 도 여기로) | 검색·정렬 표(이름·난이도·기록 수·별점 수·태그·시연 여부), 주차장 추가, **점수 다시 계산** | `GET /v1/admin/lots` · `POST /v1/admin/recompute` |
| 주차장 상세 | `#/admin/lots/:id` | 점수와 근거 통계(C-08과 같은 막대·층별 혼잡·시간대 히트맵), 차량 앱에 나가는 정보, 그 주차장 기록(시연/실제 거르기), 삭제 | `GET /v1/admin/lots/:id/records` · `DELETE /v1/admin/lots/:id` |
| 주차장 추가·수정 | `#/admin/lots/new` · `#/admin/lots/:id/edit` | `AdminLotInput` 전부 + v1.1 **유형**(`LotCategory`, 한국어 이름) · **지역 id**(예 `pangyo`). 층(순서 있는 칩), 구역·기둥 번호·설명, 운영자 태그 9종, 공공정보 줄, 요금, '차량 앱에 이렇게 나가요' 미리보기 | `POST /v1/admin/lots` · `PUT /v1/admin/lots/:id` |
| **기록** | `#/admin/records?lot=&kind=&limit=` | 익명 기록 표 — 주차장·시연/실제로 거르기 | `GET /v1/admin/overview` · `GET /v1/admin/lots/:id/records` |
| PT 비전 (이전 시안) | `#/admin/vision` | W-01 난이도 지도: 합계 4개, 수도권 지도(Leaflet + OSM), Top 5, 시간대·요일 분포, 방금 들어온 기록, 비전 그림 | `GET /v1/admin/overview` · `GET /v1/admin/lots` |

예전 주소(`#/records`, `#/lots/new`, `#/lots/:id/edit`)는 `#/admin/...` 으로 넘겨 준다. (`#/lots/:id` 는 공개 D-11.)

![D-10](../../docs/screenshots/dashboard/d10_difficulty.png)

![D-11](../../docs/screenshots/dashboard/d11_lot_detail.png)

API 계약: [`packages/api-types/index.ts`](../../packages/api-types/index.ts) (타입을 `@api-types` 별칭으로 바로 가져다 씀) · 설명 [`docs/api.md`](../../docs/api.md)

스택: **Vite 8 + React 18 + TypeScript**, 테스트 **Vitest + Testing Library(jsdom)**. 대시보드 지도는 저장소 안의 판교 그림(SVG),
겹친 동선은 `<canvas>`(기기 픽셀 배율 반영, 수천 개 선도 수 ms), 운영자 W-01 지도는 **Leaflet 1.9 + OpenStreetMap 타일**.
라우터·상태 관리 라이브러리 없음(해시 라우터 `src/router.ts`). 런타임 의존성은 react · react-dom · leaflet 셋.
운영자 화면·Leaflet·시연 데이터는 따로 나눈 청크라 대시보드만 보는 사람은 받지 않는다.

## 실행

필요: Node 22.12+ (모노레포의 다른 웹 앱과 같음).

```bash
cd apps/admin
npm ci

# ① 서버 없이 — 시연 데이터 (PT 연습·화면 확인용)
npm run dev:mock     # http://localhost:5174 (대시보드)  ·  #/admin 토큰: dev-admin-token

# ② 서버와 같이 — apps/server 를 먼저 띄운다 (기본 http://localhost:8787)
npm run dev          # http://localhost:5174  ·  #/admin 토큰: 서버의 ADMIN_TOKEN (개발 기본값 dev-admin-token)

npm test             # Vitest: API 클라이언트, 포맷·검증, 시연 서버 계약(어드민·대시보드), 시연 데이터 생성기, D-01~D-03·W-01·로그인 렌더
npm run build        # 타입 검사 + dist/ (정적 파일)
npm run preview      # dist/ 를 http://localhost:4174 로
npm run screenshots  # docs/screenshots/{dashboard,admin}/*.png 다시 만들기 (Playwright 필요 — scripts/screenshots.mjs 주석)
```

`--host`로 떠서 같은 네트워크의 태블릿에서도 `http://<노트북 IP>:5174` 로 열린다 (이때는 그 주소를 서버 `ADMIN_ORIGINS`에도 넣을 것).

### 로그인 (운영자 화면만)

`#/admin` 에서 **관리자 토큰**을 넣는다. 공개 대시보드는 로그인이 없다. 그 토큰으로 `GET /v1/admin/overview` 를 불러 보고 되면 들어간다.

- 토큰은 **sessionStorage**에만 둔다 (탭을 닫으면 사라짐, localStorage 아님). '나가기'로 지운다
- 어떤 호출이든 **401**이 오면 토큰을 지우고 로그인 화면으로 돌아가 이유를 알려 준다
- 서버 개발 기본 토큰은 `dev-admin-token`. 배포 서버는 반드시 다른 값으로
- 서버에 연결이 안 되면 "서버에 연결할 수 없어요 — ADMIN_ORIGINS 확인" 안내가 뜬다 (서버 꺼짐과 CORS 거부는 브라우저에서 구분이 안 됨)
- 로그인 화면의 **'서버 없이 시연 데이터로 둘러보기'**: 서버가 없는 자리(PT 리허설 등)에서 이 탭만 시연 데이터로 연다. 서버에는 아무것도 보내지 않고, 고친 내용은 새로고침하면 처음으로 돌아간다. 머리글 칩에 '예시 데이터 (서버 없음)'이 계속 보인다

## 환경변수

빌드 때 정해진다 (Vite `VITE_*`). 예시는 [`.env.example`](.env.example) — 복사해서 `.env.local` 로 (커밋 안 됨).

| 변수 | 기본값 | 뜻 |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:8787` | 주차각 서버 주소 (`apps/server`) |
| `VITE_MOCK` | (없음) | `1`이면 서버 없이 시연 데이터. `npm run dev:mock` / `build:mock` 은 `.env.mock` 으로 이 값을 켠다 |
| `VITE_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | 지도 타일. **`none`** 이면 타일 없이 단순 그림(SVG) 지도 — 인터넷 없는 PT 장소용 |
| `VITE_TILE_ATTRIBUTION` | OpenStreetMap 기여자 | 타일 출처 표시 (타일을 바꾸면 그 서비스의 표시 문구로) |
| `VITE_DEMO_BADGE` | (켜짐) | `0` 이면 대시보드 머리글의 '시연용 예시 데이터'와 리포트의 같은 문구를 끈다 (서버 시드가 아니라 실제 기록만 쌓인 뒤). 계약에 '시연 데이터인지' 필드가 없어 빌드 설정으로 정한다 |
| `BASE_PATH` | `/` | 하위 경로에 올릴 때만 (예: `BASE_PATH=/admin/ npm run build`) |

## 시연 데이터 (mock)

`src/mock/` — `docs/api.md` "시드 데이터"와 같은 구성을 브라우저 안에서 만든다. 고정 시드 난수라 같은 시각이면 늘 같은 값.

### 대시보드 시연 데이터 = 서버와 같이 쓰는 생성기 [`packages/insights-demo`](../../packages/insights-demo/index.ts)

순수 함수(입출력·전역 상태 없음, 시각은 인자로), 의존성 없음(타입만 `packages/api-types`). 서버도 시드·시연 응답을 같은 모양으로 만들 때 그대로 쓸 수 있다.

```ts
import { demoOverview, demoCompare, demoLotInsights } from '../../packages/insights-demo/index.ts'
demoOverview({ days: 30, now })            // InsightsOverviewResponse  — 6,388건 · 9곳 · 2.0회(지난달 2.3회), 좋아진 곳 4곳
demoCompare({ category: 'OFFICE', now })   // InsightsCompareResponse   — 쉼표로 여러 유형도 ('DEPARTMENT,MALL')
demoLotInsights('hyundai-pangyo', { now }) // InsightsLotResponse | null — 층별 도면·겹친 동선·후진 잦은 곳·층별 평균·히트맵
// 낮은 단계: generateFloorLayout({ floor, ramp }) · generateOverlayPaths(layout, { count, seed, ramp, hotspots }) · deriveStalls(layout)
```

- 판교 9곳의 난이도·평균 후진·램프·평균 시간·30일 기록 수는 D-03 표 그대로 (현대백화점 판교점 지하 4.3 · 3.2회 · 2.5바퀴 · 2분 10초 · 1,284 … 백현마을 5단지 1.6 · 0.9회 · 없음 · 40초 · 377).
  좋아진 곳은 D-01 값(화랑공원 2.2→1.8, H스퀘어 2.9→2.6, 아브뉴프랑 1.4→1.1, 알파돔 1.7→1.5). 기간을 바꾸면 기록 수만 비례
- 좌표는 시안 그림 지도에 원이 놓인 자리를 거꾸로 계산한 근사값(판교역 기준 0.32 px/m). 장소 이름만 실제
- 도면(미터, 층 65.6 × 35.84 m): 가로 통로 3개 + 램프 쪽 세로 통로, 나선 램프 / 곧은 경사로 / 지상(램프 없음), 구역 A–D(위) · E–H(아래, 되돌아옴).
  주차 칸·기둥은 도면의 가로 통로에서 정해진다(`deriveStalls` — 화면 장식과 생성기가 같은 규칙)
- 동선: 램프(입구)로 들어와 통로를 따라 칸에 넣는다 — 후진 주차 60% · 앞으로 40%, 후진 잦은 곳 근처에서는 한두 번 더 고쳐 넣는다.
  점은 `[x, y, r]`, r = 1 이면 바로 앞 점에서 이 점까지 후진. 층별 대수 합 = 기록 수 (현대백화점 B2 360대)
- 현대백화점 B2 후진 잦은 곳은 시안 3곳(램프 나와서 바로 왼쪽 2.8회 / C 구역 기둥 사이 2.4회 / E 구역 끝 칸 2.1회), 다른 곳은 도면에서 만든다
- 가짜 서버는 `/v1/insights/*` 를 인증 없이 받고, 잘못된 `days`·`category` 는 400, 없는 주차장·지역은 404

### 운영자 화면 시연 데이터

- 판교 시연 주차장 7곳: 차량 앱 [`SeedLots.kt`](../vehicle/app/src/main/java/com/parkinggack/app/data/SeedLots.kt) 와 **같은 id·이름·좌표·별점·대수·태그·층·통계** (현대백화점 ★4.3·142대, 아브뉴프랑 ★1.8·87대, …, 판교 테크원 = 기록 적음 3대)
- 수도권 시연 주차장 42곳: 판교 3곳은 W-01 시안 순위의 이름(유스페이스 판교 ★4.1 등), 나머지는 '지역 + 시설 종류' 이름. 점수·대수는 예시
- v1.1 유형·지역: 대시보드 9곳(+ 판교 테크원)은 D-03 표와 같은 유형, 나머지는 이름으로 어림. 지역은 판교 범위면 `pangyo`, 아니면 주소로 `seoul` · `incheon` · `gyeonggi`
- 합성 기록(`demo=true`) 약 1.1만 건: 주차장마다 최근 30일 = `sampleCount` 건 + 31~90일 더. 실제 기록(`demo=false`) 5건(차량 앱에서 개발 중 보낸 것처럼)
- 가짜 서버(`mockFetch.ts`)는 `fetch`와 같은 모양이라 실제와 같은 API 클라이언트·헤더·상태 코드(401·400·404·409·204)를 거친다
- 다른 점: '점수 다시 계산'은 태그 합치기와 고친 시각만 새로 고친다 (실제 서버는 기록으로 점수까지 다시 계산)

## 디자인

### 공개 대시보드 (D-01~D-03)

- 시안 1440 폭의 치수를 그대로 옮겼다 (머리글 72px, 본문 최대 1376px, 카드 반경 12 · 선 1.5px, 목록 한 줄 64px). 같은 크기로 그려 겹쳐 본 픽셀 차이:
  D-01 0.2% · D-03 0.3% · D-02 1.2%(겹친 동선 그림 자체만 다름)
- 그림 언어는 차·폰 화면과 같다: 먹색 바닥 + 흰 선. **단계는 색이 아니라 회색 5단 채움** + 숫자·단어(어려움/보통/쉬움, 막대 5칸)
- 히트맵의 회색 5단은 모든 화면이 같은 잣대(평균 후진 2.2 · 2.8 · 3.4 · 4.0회 경계) — 같은 진하기면 같은 횟수. 카드 머리 오른쪽에 작은 범례, 칸마다 툴팁, 화면 낭독기용 숨은 표
- 겹친 동선: 선 하나하나 반투명(동선 수에 맞춰 조절)이라 겹친 통로·램프가 밝게 드러난다. 후진 구간은 점선, 후진 잦은 곳은 점선 원 + 번호. 목록에 마우스를 올리면 그 원이 굵어진다
- 지도 이름표는 시안처럼 '가장 어려운 세 곳 + 기록이 가장 많은 곳'을 원 오른쪽(겹치면 왼쪽)에. 나머지는 마우스·키보드 초점을 두면 보인다. 원은 전부 링크(낭독 이름: 이름 · 난이도 · 기록 수)
- 키보드: 본문 건너뛰기, 메뉴·기간(기본 select)·지도 원·목록·층 버튼(aria-pressed)·유형 칩·열 정렬(aria-sort) 전부 Tab · Enter
- 1180px 아래에서 지도/동선 카드와 옆 카드가 위아래로, 900px 아래에서 두 칸 카드도 한 줄로. 1024 폭에서 비교 표가 가로 스크롤 없이 들어간다
- **리포트 PDF 받기**: 인쇄 스타일(A4 세로 2쪽 — 1쪽 동선 그림 + 후진 잦은 곳 + 평균 비교, 2쪽 층별 막대 + 히트맵 + 출처)로 `window.print()`.
  머리글·버튼은 숨기고 '주차각 데이터 · 주차장 리포트 · 날짜 · 기간'을 붙인다. 파일 이름은 '주차각 리포트 - 주차장 - 날짜'. Chrome은 동선을 벡터로 넣는다

시안과 다른 점(의도함):

- 히트맵 카드 머리에 진하기 범례(적음 ▪▪▪▪▪ 많음), 동선 그림 아래에 '층 · 대수 — 앞으로 ┄ 후진' 범례, 바닥 틀 위·아래에 구역 글자 A–H
- 지도 범위 밖에 놓인 주차장(백현마을 5단지)은 가장자리 안쪽에 점선 원으로 붙인다 (시안은 잘려서 안 보임)
- 동선은 생성기가 만든 실제 데이터라 시안의 손 그림과 램프 연결·세로 통로 위치가 조금 다르다(세로 통로가 램프 바로 왼쪽)
- D-03 열 제목을 눌러 정렬(정렬한 열에만 ▲▼), 부제의 '어려운 순'이 정렬에 따라 바뀐다. 바닥글(설명 · 운영자 화면 링크)을 더했다
- 시안 문단의 단어 중간 줄바꿈 대신 한국어 단어 단위 줄바꿈(`keep-all`)

### 운영자 화면

- 시안 [`docs/design/W-01.dc.html`](../../docs/design/W-01.dc.html) (1440폭), 토큰 [`tokens-jettae.json`](../../docs/design/tokens-jettae.json) 라이트 테마
- 따뜻한 회색 단색, Noto Sans KR. **상태는 색이 아니라 채움·굵기·단어로** — 난이도는 원의 진하기 + 숫자 + 막대 5칸, 시연/실제는 점선 테두리/채운 배지와 단어, 운영자 태그는 굵은 테두리. 빨강·초록, 그라데이션, 그림자 없음 (Leaflet 기본 그림자도 걷어 냄)
- OSM 타일은 CSS 필터로 회색조로 바꿔 시안 톤에 맞췄다 (출처 표시는 그대로)
- 키보드만으로: 본문 건너뛰기 링크, 모든 조작이 버튼·링크·입력, 지도는 화살표·+/- 키, 마커는 Tab → Enter로 팝업, 표 열 제목 정렬은 `aria-sort`, 삭제 확인은 화면 안에서(Esc = 그대로 두기)
- 태블릿 폭(820px)까지 한 열로 접힌다. 표는 가로로 스크롤

시안과 다른 점(의도함):

- 시안 숫자 자리표시(`[수] 곳`)는 서버 값. 합계 칸 아래 한 줄씩 보조 수치(최근 30일 건수 등)를 더해 칸이 25px 높다
- 지도 제목 '서울 …' → **'수도권 주차장 난이도 지도'** (판교·수원·인천까지 들어 있어서). 시안의 그린 지도 대신 실제 OSM 지도, 범위 버튼(전체·서울·판교)과 '단순 그림' 전환, 범례를 더했다
- 머리글 메뉴는 화면 이동(주차장 관리 · 기록 · PT 비전 (이전 시안)) + '공개 대시보드' + '나가기'
- 시안 아래에 운영 정보(편한 주차장 순위, 시간대·요일 분포, 방금 들어온 기록)를 이어 붙였다

## 배포 — Vercel (무료)

정적 파일(`dist/`)만 올리면 된다. 해시 라우팅(`#/...`)이라 다시 쓰기(rewrite) 설정이 필요 없다. 설정은 [`vercel.json`](vercel.json).

Vercel 새 프로젝트 → 이 저장소 가져오기:

| 항목 | 값 |
|---|---|
| Root Directory | `apps/admin` |
| Framework Preset | Vite (vercel.json 에 있음) |
| Build Command | `npm run build` (타입 검사 + 빌드) |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | 22.x |
| 환경변수 | `VITE_API_BASE=https://<서버 주소>` (예: Vercel에 올린 apps/server). 선택: `VITE_DEMO_BADGE=0`, `VITE_TILE_URL` |

- 빌드가 `../../packages/api-types` · `../../packages/insights-demo` 를 읽는다 → 프로젝트 설정 **'Include source files outside of the Root Directory in the Build Step'** 이 켜져 있어야 한다 (새 프로젝트 기본값은 켜짐)
- `VITE_*` 는 빌드 때 박힌다 → 서버 주소를 바꾸면 다시 배포
- **공개 대시보드**(`/v1/insights/*`)는 인증 없는 GET이라 서버 CORS `*` 로 된다. **운영자 화면**(`/v1/admin/*`)은 올린 주소(origin)가 서버 `ADMIN_ORIGINS` 에 꼭 있어야 한다
  (예: `ADMIN_ORIGINS=https://parkinggack-admin.vercel.app,http://localhost:5174`). 빠지면 로그인 화면에 '서버에 연결할 수 없어요'가 뜬다. 미리보기 배포 주소(…-git-…vercel.app)도 쓰려면 같이 넣는다
- 서버 없이 시연용으로만 올리려면 환경변수 `VITE_MOCK=1` (= `npm run build:mock`): 대시보드·운영자 화면 모두 브라우저 안의 시연 데이터, 토큰 `dev-admin-token`
- 캐시: `/assets/*`(파일 이름에 해시)는 1년 immutable, `index.html` 은 매번 확인. 보안 헤더 nosniff · Referrer-Policy · X-Frame-Options DENY · Permissions-Policy
- 토큰을 브라우저에 넣는 화면이 있어 **HTTPS**로만 올릴 것 (Vercel 기본). 검색엔진 색인 안 함(`noindex`)
- 다른 정적 호스팅(Netlify / Cloudflare Pages / GitHub Pages / S3)도 같다: Base directory = `apps/admin`, build = `npm ci && npm test && npm run build`, publish = `dist`.
  하위 경로면 `BASE_PATH=/admin/ npm run build`
- 인터넷 없는 PT 장소: `VITE_TILE_URL=none npm run build:mock` (대시보드 지도는 원래 저장소 안의 그림이라 네트워크가 필요 없다)
- OSM 공식 타일(운영자 W-01만 씀)은 사용량이 많으면 막힐 수 있다 ([타일 사용 정책](https://operations.osmfoundation.org/policies/tiles/))

## 파일

```
src/
  App.tsx           첫 갈림길: #/admin → 운영자 화면(따로 불러옴), 나머지 → 공개 대시보드. 예전 주소 넘기기
  AdminApp.tsx      운영자 화면: 로그인 · 셸 · #/admin 라우트
  api.ts            API 클라이언트 — createApiClient(어드민, Bearer · 401 로그아웃) · createInsightsClient(공개 통계, 인증 없음)
  auth.ts           sessionStorage 토큰 · 시연 세션
  config.ts         VITE_* 환경변수
  format.ts         한국어 포맷 (난이도 라벨·태그·시간·숫자 — 차량 앱 Format.kt 와 같은 규칙)
  types.ts          계약 v1.1 주석의 category · region (인터페이스에 아직 없어서 덧붙임)
  stats.ts · validate.ts · router.ts · data.tsx
  dashboard/        공개 대시보드
    DashboardApp.tsx  머리글(메뉴 4개 · 시연 표시 · 지역 · 기간) · 바닥글 · 라우트 (D-12 는 열 때만 불러옴)
    context.tsx       통계 클라이언트(서버/시연) · 기간 · 응답 캐시(useInsight)
    pages/            Difficulty(D-10) · LotDetail(D-11) · Export(D-12) · Compare(D-03)
    v2demo.ts         API 에 없는 값의 시연용 예시 (시안 값 + 주차장·층 값을 만드는 관계)
    FloorPlan.tsx     D-11 층 평면 (도면 SVG + 동선·후진 canvas + 지점 버튼) · plan.ts 그림 틀 · 입구(0, 0)
    export/           D-12: records(시연 기록) · datasets(5종 표 + 개인정보 규칙) · writers(CSV · xlsx · GeoJSON) · parquet · zip · files
    components.tsx    막대 5칸 · 꺾은선
    format.ts         회색 5단 · 평균 후진 단계 · 램프 · 층 범위 · 꺾은선 점
    dashboard.css     화면 + 인쇄(A4 리포트)
  pages/            운영자: Login · Dashboard(W-01 PT 비전) · Lots · LotDetail · LotEdit · Records
  components/       운영자: DifficultyMap(LeafletMap · SvgMap) · Charts · LotStatsView · RecordsTable · ChipListEditor · ui
  mock/             시연 데이터(fixtures) · 가짜 서버(mockFetch: /v1/admin/* + /v1/insights/*)
../../packages/insights-demo/   대시보드 시연 데이터 생성기 (서버와 같이 씀) — index.ts · layout.ts
scripts/screenshots.mjs   docs/screenshots/{dashboard,admin}/*.png + D-02 리포트 쪽 미리보기
vercel.json               Vercel 정적 배포 (캐시 · 보안 헤더)
```
