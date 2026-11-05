# 화면 스냅숏

- [`vehicle/`](vehicle) — 차 화면 (Paparazzi, 아래)
- [`mobile/`](mobile) — 폰 짝꿍 앱 M-10 ~ M-53 + 움직임 낱장 모음 (Playwright, [아래](#폰-짝꿍-앱-mobile))
- [`dashboard/`](dashboard) — PC 대시보드 '주차각 데이터' D-01~D-03 (Playwright, [아래](#pc-대시보드-dashboard))
- [`admin/`](admin) — 운영자 화면: 주차장 관리·기록·W-01 PT 비전 (Playwright, [맨 아래](#어드민-admin))

에뮬레이터 없이 JVM에서 Compose 화면을 그린 결과 (Paparazzi 1.3.5 / layoutlib, Android 14).
`docs/design/*.dc.html` 시안과 같은 크기라 겹쳐 비교할 수 있다.
흐름별로 모아 보기: **[index.html](index.html)** (브라우저로 바로 열기, `mobile/*.png`가 생기면 같이 보임).

- `pleos_*.png`만 Pleos 에뮬레이터 창 크기(1682×1210px). 나머지는 시안과 같은 1280×720.
- 차 화면 1280×720, 160dpi (1dp = 1px). 맨 위 44px 띠는 OS(Pleos Connect)가 그리는 자리라
  앱은 그 아래 1280×676만 쓴다 — 스냅숏은 그 띠를 흉내 내서 실제와 같은 높이로 그린다.
- 글꼴은 앱에 넣은 Noto Sans KR 400/500/700 (`apps/vehicle/app/src/main/res/font`, KS X 1001 한글 2,350자 부분 집합).
- 시각은 `PreviewData.nowMs`(2026-11-03 오후 5:02)로 고정, 데이터는 `ui/screens/PreviewData.kt`.

## 다시 만들기

```bash
cd apps/vehicle
./gradlew --max-workers=1 exportScreenshots   # recordPaparazziDebug → docs/screenshots/vehicle/*.png
```

테스트는 `app/src/test/java/com/parkinggack/app/ui/ScreenshotTest.kt`. 평소 `testDebugUnitTest`는 렌더만 하고
(결과: `app/build/reports/paparazzi/`) 이미지 비교는 하지 않는다. Paparazzi 골든 폴더(`app/src/test/snapshots`)는 커밋하지 않는다.

## 파일

| 파일 | 화면 | 시안 |
|---|---|---|
| `c01_home_dark.png`, `c01_home_light.png` | C-01 홈 | C-01 |
| `c01_home_empty_dark.png` | C-01 홈, 기록 없음 | — |
| `c02_destination_hard_dark.png`, `c02_destination_hard_light.png` | C-02 도착지 난이도 카드 (어려움 ★4.3) | Main, C-02-states |
| `c02_destination_easy_dark.png` | C-02 쉬움 (★1.8, '좋아요'만) | C-02-states |
| `c02_destination_sparse_dark.png` | C-02 데이터 부족 (점선) | C-02-states |
| `c03_easier_lots_dark.png` | C-03 더 쉬운 주차장 | C-03 |
| `c04a_driving_banner_dark.png` | C-04 주행 중 배너 | C-04a |
| `c04b_driving_recording_dark.png` | C-04 주차 기록 중 | C-04b |
| `c05_parked_high_dark.png`, `c05_parked_high_light.png` | C-05 주차 완료, 층 신뢰도 높음 | C-05 (높음) |
| `c05_parked_medium_dark.png` | C-05 신뢰도 보통 ('추정' 칩) | C-05 (보통) |
| `c05_parked_low_dark.png` | C-05 신뢰도 낮음 (층 고르기) | C-05 (낮음) |
| `c06_zone_picker_dark.png` | C-06 층·구역 빠른 선택 | C-06 |
| `c07_send_to_phone_dark.png` | C-07 폰으로 보내기 | C-07 |
| `c08_lot_detail_dark.png` | C-08 주차장 상세 | C-08 |
| `c08_lot_detail_sparse_dark.png` | C-08 데이터 부족 | — |
| `c09_history_dark.png`, `c09_history_empty_dark.png` | C-09 내 주차 기록 (기록 있음 / 없음) | C-09 |
| `c10_settings_dark.png` | C-10 설정 | C-10 |
| `c11_onboarding_step1_dark.png` … `step3` | C-11 온보딩 1~3장 | C-11 |
| `c12_replay_dark.png` | C-12 동선 리플레이 (다 그린 상태) | C-12 |
| `c12_replay_approximate_dark.png`, `_parallel_`, `_angled_` | C-12 대략적 동선 / 평행 / 사선 | C-12-states |
| `c12_shapes_dark.png` | 형태별 동선 그림 모음 (OS 띠 없음) | C-12-states |
| `components_dark.png` | 공통 컴포넌트 (1280×1080, OS 띠 없음) | Components |
| `pleos_*.png` | 같은 화면을 **Pleos 에뮬레이터 앱 창 1682×1210px**(런처 오른쪽 칸, 160dpi)에서 — 앱은 시안 폭 1280dp에 맞춰 ×1.31로 키워 그린다(`ui/theme/DesignScale.kt`). 테스트 `PleosPanelScreenshotTest` | 같은 ID |

## 시안과 다른 점 (의도한 것)

- 내비 지도·후방 카메라는 OS 화면이라 단순한 자리 표시로만 그린다 (C-02, C-03 미니맵, C-04).
- 버튼은 차 화면 규칙대로 최소 64dp: C-02 닫기(시안 52)와 '괜찮아요'(시안 60)는 64.
- C-10 토글 아래 '켜짐/꺼짐' 글자 (상태를 색이 아니라 단어로), 카드 시점은 '어려운 곳만'(★3.5 이상과 일치).
- 동선 그림은 실제 궤적 데이터로 그려서 시안 그림과 위치·축척이 조금 다르다.
- 글자 폭은 Chrome과 layoutlib의 글자 간격 계산 차이로 1~3% 다를 수 있다.

## 폰 짝꿍 앱 (mobile/)

`apps/mobile` 을 **시연 데이터**(`VITE_MOCK=1`, 서버 없이 브라우저 안의 시안 값)로 빌드해 `vite preview` 로 띄우고 Playwright(Chromium)로 그린 결과.
시안(`docs/design/M-10.dc.html` … `M-53.dc.html`, `M-01`, `M-02`)과 같은 390×844 CSS px, 2배율(780×1688 PNG), 256색으로 줄임(Pillow).
글꼴은 Google Fonts의 Noto Sans KR, 시각은 2026-11-03 오후 5:02(KST)로 고정 → 시안과 같은 "2시간 전", "오늘 · 후진 2번", "11월 1일".
주차왕은 시안의 요일에 맞춰 2026-11-05(목) 오후 5:02(M-50~M-52, M-51 "오늘 · 월요일 · 화요일 · 수요일"), M-53은 2026-11-09(월)("지난주 결과 · 11월 2일 ~ 8일").
홈은 카드의 주차 애니메이션(약 2.5초)이 끝난 장면.

```bash
cd apps/mobile
npm run screenshots   # 시연 빌드 → docs/screenshots/mobile/*.png (Playwright 필요, scripts/playwright.mjs)
npm run screenshots -- m50_king,motion   # 몇 장만 / 움직임 낱장 모음만
```

| 파일 | 화면 | 상태 |
|---|---|---|
| `m10_start.png` | M-10 시작 | 처음 켰을 때 |
| `m11_spot.png` | M-11 주차 위치 | 온보딩 |
| `m12_share.png` | M-12 익명 기록 동의 | 보낼게요 / 나만 볼게요 |
| `m13_connect.png` | M-13 차와 연결 | QR 그림 = 카메라 버튼, 코드로 연결 · 나중에 |
| `m13_code.png`, `m13_code_error.png` | 코드 입력 (새 화면) | 4자리 입력 중 / 없는 코드(000000) 안내 |
| `pair_expired.png` | `/pair/:code` | 시간이 지난 코드(111111) — 다음 할 일 안내 |
| `m14_connected.png` | M-14 연결 완료 | 알림 받을게요 / 나중에 |
| `m20_home.png`, `m20_home_dark.png` | M-20 홈 | 지금 주차 중 B2 · D-07(차가 주차를 마친 장면), 자주 가는 곳, 좋아진 것 한 줄, 아래 탭 5개 / 다크 |
| `m20_home_unpaired.png` | M-20 홈 | 연결 전 — 차와 연결할게요 + 판교역 근처 주차장 |
| `m01_parking.png`, `m01_parking_dark.png` | M-01 내 주차 위치 | 연결된 차의 지금 주차 / 다크 |
| `m02_way.png` | M-02 돌아가는 길 | 시안 값 (엘리베이터 2번 → D 구역, 3단계) |
| `m01_link.png` | M-01 (C-07 링크) | 연결 안 한 폰이 `/p/…#` 로 열었을 때 — 위쪽 '앱에서 내 차와 연결할게요' |
| `m02_link_demo.png` | M-02 (링크) | 차량 앱 시연 시나리오가 실제로 만든 힌트·경로(`[1,17,-1]`, 링크 테스트 벡터) — 램프 기준, 오른쪽 칸 |
| `m01_link_invalid.png` | 링크 오류 | `#` 뒤가 잘린 링크 |
| `m30_lots.png` | M-30 주차장 | 판교역 기준(위치 권한 없음), 쉬운 순 |
| `m31_lot.png` | M-31 주차장 상세 | 현대백화점 4.3 어려워요, 근거 3줄, 주말 오후 층별 혼잡 |
| `m31_easier.png` | 더 쉬운 곳 (새 화면) | `/v1/lots/:id/easier` 3곳 |
| `m32_records.png` | M-32 기록 | 1.6번, 지난달보다 0.4번 줄었어요 + 6개월 막대 + 기록 |
| `m33_record.png`, `m33_record_replay.png` | M-33 주차 동선 | 다 그린 상태(전환점 ①②③) / 다시 보기 중간 |
| `m40_settings.png`, `m40_settings_unpair.png` | M-40 설정 | 토글·운전 경력 / '내 차'를 눌러 화면 안에서 연결 끊기 확인 |
| `m40_settings_king_leave.png` | M-40 설정 | 주차왕 참여 중 — '주차왕 그만두기'를 눌러 화면 안에서 확인 |
| `m40_experience.png` | 운전 경력 (새 화면) | 1년 미만 고른 상태 |
| `m50_king.png`, `m50_king_dark.png` | M-50 주차왕 | 판교 초보 148명 중 12등 · 82점, 지난주 17등에서 올라왔어요, 1~5등 + ··· + 11·12(나)·13 / 다크 |
| `m50_king_sheet.png` | M-50 리그 시트 | 리그 칩 → 아래에서 올라오는 시트 (리그 설명 · 지난주 결과 볼게요) |
| `m50_king_unpaired.png` | 주차왕 탭, 연결 전 | 한 문장 + 차와 연결할게요 |
| `m51_king_me.png` | M-51 내 점수 자세히 | 58/70 · 11/15 · 13/15, 다음 등수 힌트, 이번 주에 댄 곳(깔끔·보통·빠짐) |
| `m52_king_join.png` | M-52 주차왕 참여하기 | 닉네임 "판교 느긋한 수달" + 다시 뽑기, 내 리그 판교 · 1년 미만 |
| `m53_king_result.png` | M-53 주간 결과 | 9등 · 148명 중 · 상위 6%, 배지 상위 10% · 개척자, 지난주보다 3계단 |
| `m53_share_image.png` | M-53 공유 이미지 | '이미지로 공유하기'가 캔버스로 직접 그린 1080×1350 PNG (헤드리스 크롬은 공유 시트가 없어 내려받은 파일) |
| `motion_home_parking.png` | 움직임: 홈 카드 | 차가 통로로 와서 꺾어 들어가고 살짝 후진해 편 뒤 들어가 멈춤 — 0 · 0.5 · 1.0 · 1.3 · 1.8 · 2.6초 |
| `motion_push.png`, `motion_pop.png` | 움직임: 앞으로 / 뒤로 | 홈 카드 → M-01 / 그 반대 — 0 · 60 · 130 · 220 · 330 · 560 ms (스프링 260/26, 330ms 쯤 살짝 넘침) |
| `motion_tab.png` | 움직임: 탭 | 홈 → 주차왕: 옅게 + 내용만 위로, 탭바 제자리 |
| `motion_rise.png` | 움직임: 모달 | M-50 → M-53 이 아래에서 올라옴 (임계 감쇠) |

시안과 겹쳐 비교(같은 조건 렌더, 시안의 없는 `support.js`는 빼고 정적 마크업 · M-30/M-40은 기본 상태로 펼침, 픽셀 차이):
M-10 0.01% · M-11 0.02% · M-12 0.00% · M-14 0.02% · M-20 0.00%(주차 애니메이션 끝 장면, v1.2 탭바) · M-01 0.00% · M-31 0.00% · M-40 0.56% · M-32 0.79% ·
M-13 1.08% · M-02 1.83% · M-30 2.00% · M-33 2.14% · **M-50 0.15%**(목록 아래 '순위는 시연용 예시예요') · **M-51 0.01%** · **M-52 0.00%** · **M-53 0.00%**. 차이는 모두 의도한 것 — 그림을 실제 데이터(`route`, `path`)로 그림, 필수 문구
("실제와 조금 다를 수 있어요", "동선을 그림으로 다시 그렸어요") 추가, M-13 카메라 안내·'나중에 연결할게요', 목록 길이(서버 값).
자세한 목록은 `apps/mobile/README.md` "시안과 다른 점".

## PC 대시보드 (dashboard/)

`apps/admin` 의 공개 대시보드(로그인 없음)를 **시연 모드**(`vite --mode mock`)로 띄우고 Playwright(Chromium)로 그린 결과. 1배율,
시각은 2026-11-03 오후 5:02(KST)로 고정(6개월 추이 2026-06~11). 수치는 시안과 같은 시연 데이터
([`packages/insights-demo`](../../packages/insights-demo/index.ts) — 서버와 같이 쓰는 생성기). 지도는 저장소 안의 판교 그림이라 네트워크가 필요 없다.

```bash
cd apps/admin
npm run screenshots -- dashboard   # → docs/screenshots/dashboard/*.png (Playwright 필요, scripts/screenshots.mjs 주석 참고)
```

| 파일 | 화면 | 크기 |
|---|---|---|
| `d01_overview.png` | D-01 개요 — 합계 · 판교 지도 · 까다로운 주차장 Top 5 · 요일×시간대 · 좋아진 곳 | 시안과 같은 1440×1380 |
| `d02_lot_detail.png` | D-02 현대백화점 판교점 — B2 겹친 동선 360대 · 후진 잦은 곳 3곳 · 판교 평균 비교 · 층별 · 요일×시간대 | 시안과 같은 1440×1410 |
| `d03_compare.png` | D-03 주차장 비교 — 9곳 어려운 순, 6개월 후진 추이 | 시안과 같은 1440×940 |
| `d02_lot_detail_b4.png` | D-02 같은 곳 B4 (층 버튼, `?floor=B4`) | 1440×900 |
| `d02_lot_detail_flat.png` | D-02 화랑공원 공영 — 지상 1층, 램프 없이 입구로 들어오는 동선 | 1440×900 |
| `d03_compare_office.png` | D-03 유형 칩 '오피스' (4곳) | 1440×700 |
| `d01_overview_1024.png`, `d02_lot_detail_1024.png` | 1024 폭 (지도/동선 카드와 옆 카드가 위아래로) | 1024 폭, 페이지 전체 |
| `d02_report_p1.png`, `d02_report_p2.png` | D-02 '리포트 PDF 받기' — 인쇄 스타일로 만든 A4 PDF 2쪽 (`page.pdf()` → 80dpi 미리보기) | A4 |

시안(`docs/design/D-01~D-03.dc.html`, 없는 `support.js`는 무시하고 정적 마크업 그대로)을 같은 크기·1배율로 그려 겹쳐 본 픽셀 차이
(밝기 차 40 넘는 점): **D-01 0.2% · D-03 0.3% · D-02 1.2%**. 위치·크기는 같고, 다른 곳은 아래뿐(의도함):

- 히트맵 카드 머리 오른쪽의 진하기 범례(적음 ▪▪▪▪▪ 많음), 동선 그림 아래 '층 · 대수 — 앞으로 ┄ 후진' 범례, 바닥 틀 위·아래 구역 글자 A–H
- 겹친 동선은 생성기가 만든 데이터라 손 그림과 램프 연결·세로 통로 위치가 조금 다르다
- 지도 범위 밖 주차장(백현마을 5단지)은 가장자리 안쪽에 점선 원으로 붙인다(시안은 잘려서 안 보임). D-03은 정렬한 열에 ▼
- 페이지 아래 바닥글(설명 · 운영자 화면 링크) — 시안 높이 아래라 같은 크기 스냅숏에는 거의 안 보인다

## 어드민 (admin/)

`apps/admin` 의 운영자 화면(`#/admin/...`)을 **시연 모드**(`vite --mode mock`, 서버 없이 브라우저 안의 시연 데이터)로 띄우고 Playwright(Chromium)로 그린 결과.
1배율, 시각은 2026-11-03 오후 5:02(KST)로 고정('4분 전' 같은 상대 시각이 늘 같음). 지도 타일은 OpenStreetMap(회색조 필터),
글꼴은 Google Fonts의 Noto Sans KR. 저장소가 무거워지지 않게 256색 PNG로 줄였다(Pillow 있을 때).

```bash
cd apps/admin
npm run screenshots -- admin   # → docs/screenshots/admin/*.png (Playwright 필요, scripts/screenshots.mjs 주석 참고)
```

| 파일 | 화면 | 크기 |
|---|---|---|
| `w01_dashboard.png` | W-01 난이도 지도 (`#/admin/vision`, 'PT 비전 (이전 시안)') — 시안과 같은 1440×1100 | 1440×1100 |
| `w01_dashboard_full.png` | W-01 전체 (편한 주차장 순위·시간대/요일 분포·방금 들어온 기록까지) | 1440 폭, 페이지 전체 |
| `w01_dashboard_tablet.png` | W-01 태블릿 폭 (한 열로 접힘) | 820 폭, 페이지 전체 |
| `lots.png` | 주차장 관리 표 (난이도 높은 순) | 1440×900 |
| `lot_detail.png` | 주차장 상세 — 현대백화점 ★4.3, C-08 근거 통계, 기록 | 1440 폭, 페이지 전체 |
| `lot_edit.png` | 주차장 정보 수정 (유형·지역 id · 층 칩·구역 체계·운영자 태그·공공정보·요금) | 1440×900 |
| `records.png` | 기록 — 현대백화점만, 시연/실제 배지 | 1440×900 |
| `login.png` | 관리자 토큰 입력 (`#/admin`, 시연 모드 안내 · 공개 대시보드 링크) | 1440×900 |

시안(`docs/design/W-01.dc.html`, 없는 `support.js`는 무시하고 정적 마크업 그대로)을 같은 1440×1100·1배율로 그려 겹쳐 본 결과,
머리글·합계 4칸·지도/순위 2단·비전 3장의 위치와 크기는 같다. 다른 점(의도함):

- 시안 숫자 자리표시(`[수] 곳`, `★[0.0]`)는 서버 값. 합계 칸마다 보조 수치 한 줄이 더 있어 아래 묶음이 25px 내려간다
- 지도는 시안의 그린 판교 지도 대신 실제 OSM 지도(수도권 전체가 기본, 전체·서울·판교 버튼). 제목은 '서울' → '수도권' (판교·수원·인천 포함)
- 원은 시안처럼 크기 = 기록 수, 진하기 = 난이도에 **숫자**를 더했다(색만으로 구분하지 않기). 범례 상자는 시안의 캡션 자리(왼쪽 아래)
- 머리글 메뉴는 화면 이동(주차장 관리 · 기록 · PT 비전 (이전 시안)) + '공개 대시보드' · '나가기'. 비전 아래에 운영 정보를 이어 붙였다
- 순위 1위는 시안과 같은 현대백화점 ★4.3. 2~5위는 시연 데이터의 수도권 주차장(시안은 판교만)

