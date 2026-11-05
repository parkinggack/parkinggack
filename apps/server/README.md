# apps/server — 주차각 API 서버 (v1.2)

차량 앱 · 폰 앱(폰 웹) · 어드민·대시보드를 잇는 서버.
- 익명 주차 기록을 모아 **주차장 난이도(★)** 를 계산하고, 내비 목적지를 주차장에 맞추고, "폰으로 보내기" **짧은 링크**(`/s/{code}`)를 48시간 보관 (v1)
- **차 ↔ 폰 페어링**(6자리 코드·QR), 차가 저장한 **내 주차를 연결된 폰에 동기화**, "차 찾았어요", 내 기록 통계, 선택 **웹 푸시** (v1.1)
- PC 대시보드(D-01~D-03)용 **집계 통계** `/v1/insights/*` (v1.1)
- **주차왕** — 동네 × 운전 경력 리그의 주간 순위(후진·핸들 70 + 가 본 주차장 15 + 지난달보다 15), 닉네임만 보이는 순위판, 지난주 결과·배지 (v1.2, C-13 · M-50~M-53)

- 계약(타입): [`packages/api-types/index.ts`](../../packages/api-types/index.ts) · 설명·점수 규칙: [`docs/api.md`](../../docs/api.md) · **무료 배포: [`docs/deploy.md`](../../docs/deploy.md)**
- 스택: Node.js 20+ · TypeScript · [Hono](https://hono.dev) · **libSQL**([@libsql/client](https://github.com/tursodatabase/libsql-client-ts) — 로컬은 SQLite 파일, 배포는 Turso) · zod · web-push · 테스트 Vitest
- 첫 실행 때 DB가 비어 있으면 **시연 데이터**를 넣는다: 판교 9곳(대시보드 시연 생성기 `packages/insights-demo` 의 수치·도면·동선 그대로, 180일치) + 테크원 + 수도권 41곳(W-01 지도용), 기록 약 3만 8천 건,
  주차왕 시연 참여자 712명(판교 × 경력 5개 리그, 판교 초보 148명은 시안 C-13 · M-50 숫자)

```
[차량 앱] ──match / easier / lots / records / ratings / shares · devices / pairings / me/parkings──┐
[폰 앱]   ──/s/:code · pairings/:code/claim · me/parkings/current · me/stats · me/push · me/king/*──┼──▶ apps/server ──▶ libSQL
[대시보드·어드민] ──/v1/insights/* (공개) · /v1/admin/* (Bearer ADMIN_TOKEN)──────────────────────┘        (file: 또는 Turso)
```

## 실행

필요: Node 22 권장 (서버는 20+, 테스트 도구 Vitest 5 는 22.12+).

```bash
cd apps/server
npm ci
npm run dev          # http://localhost:8787 (0.0.0.0, 파일 바꾸면 다시 시작). 첫 실행이면 시연 데이터 (1~2초)
npm test             # Vitest — 네트워크 없이 앱 핸들러를 직접 부름 (시연 DB를 한 번 만들어 테스트마다 복사)
npm run migrate      # 마이그레이션만 (Turso 에 배포 전: DATABASE_URL·DATABASE_AUTH_TOKEN)
npm run seed -- --reset   # 주차장·기록·별점·도면을 지우고 시연 데이터 다시 (짧은 링크·기기·내 주차는 그대로)
npm run build && npm start   # tsc → dist/, node 로 실행
npm run typecheck
```

`npm run seed` 는 판교 9곳이 목표 값과 같은지 표로 보여 준다:

```
판교 시연 주차장              난이도   30일 대수   (목표)
hyundai-pangyo               ★4.3    1284대   (★4.3 · 1284대) ok
u-space-pangyo               ★4.1     642대   (★4.1 · 642대) ok
h-square                     ★3.9     871대   (★3.9 · 871대) ok
pangyo-seven-venture         ★3.6     515대   (★3.6 · 515대) ok
botdeul-mall                 ★3.4     233대   (★3.4 · 233대) ok
hwarang-park-public          ★2.9     402대   (★2.9 · 402대) ok
alphadom-tower               ★2.4     958대   (★2.4 · 958대) ok
avenue-france-pangyo         ★1.8    1106대   (★1.8 · 1106대) ok
baekhyun-5                   ★1.6     377대   (★1.6 · 377대) ok
pangyo-new                     부족       3대   (부족 · 3대) ok
```

예전 DB 파일이 있으면 시작할 때 최신 스키마(v4)로 올라간다(데이터 유지). v1.2 전에 시드한 DB 에는 시작할 때(또는 `npm run seed`) 주차왕 시연 참여자만 더한다. 시연 수치·id 를 새 시드로 바꾸려면 `npm run seed -- --reset`.

### 에뮬레이터·폰에서 붙기

- **Android 에뮬레이터(Pleos Connect AVD)** 에서 호스트 PC 는 `10.0.2.2` → 차량 앱 기본 서버 주소 `http://10.0.2.2:8787`
- **같은 Wi-Fi 의 폰**: 노트북 IP 로 `http://192.168.x.x:8787` (방화벽에서 8787 허용)
- 짧은 링크·페어링 QR 주소를 개발 서버로: `PUBLIC_WEB_BASE=http://localhost:5173 npm run dev`
- 차량 앱 실제 서버 E2E: 서버를 띄운 채 `cd apps/vehicle && PG_SERVER_URL=http://localhost:8787 ./gradlew testDebugUnitTest --tests '*LiveServerE2ETest*'`

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` · `HOST` | `8787` · `0.0.0.0` | Node 서버 (Vercel 에서는 안 씀) |
| `DATABASE_URL` | (없음) | libSQL 주소: `libsql://<db>-<조직>.turso.io`(Turso) · `file:경로` · `:memory:`. 있으면 `DB_PATH` 보다 먼저 |
| `DATABASE_AUTH_TOKEN` | (없음) | Turso 토큰 (`turso db tokens create parkinggack`) — `libsql://` 이면 필수 |
| `DB_PATH` | `./data/parkinggack.db` | 로컬 SQLite 파일 (폴더 자동 생성, git 에 안 올라감) |
| `ADMIN_TOKEN` | 개발: `dev-admin-token` (시작할 때 크게 경고) | 어드민 `Authorization: Bearer …`. **운영(`NODE_ENV=production`)·Netlify·Vercel 에서는 필수 · 16자 이상 · 개발 토큰 금지** |
| `ADMIN_ORIGINS` | `http://localhost:5174,http://localhost:5173` | 어드민 API 를 부를 수 있는 웹 출처 (쉼표로) |
| `PUBLIC_WEB_BASE` | `https://parkinggack.vercel.app` | 폰 웹 주소 → 짧은 링크 `…/s/{code}`, 페어링 QR `…/pair/{6자리}` |
| `SHARE_TTL_HOURS` · `PAIRING_TTL_MIN` | `48` · `10` | 짧은 링크 보관 시간 · 페어링 코드 유효 시간 |
| `RATE_LIMIT_PER_MIN` | `60` | 공개 POST(기록·별점·짧은 링크·기기·페어링) IP당 분당 |
| `CLAIM_FAILURES_PER_MIN` | `10` | 페어링 코드 **틀린** 시도 IP당 분당 (6자리 무차별 대입 막기) |
| `TRUST_PROXY` | `false` (Netlify·Vercel 에서는 `true`) | 프록시 뒤면 `X-Forwarded-For` 마지막 주소로 IP 판단 (Netlify 는 `x-nf-client-connection-ip` 먼저) |
| `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT` | (없음) | 웹 푸시 (`npx web-push generate-vapid-keys`, subject 는 `mailto:…`). 없으면 `/v1/push/key` 404 · 보내기 안 함 |
| `CRON_SECRET` | (없음) | `GET /v1/cron/maintain` 의 Bearer (Vercel Cron 이 자동으로 붙임). 없으면 어드민 토큰으로만 |
| `SEED_ON_EMPTY` | `true` (Netlify·Vercel 에서는 `false`) | DB 가 비어 있으면 시연 데이터 넣기 (Node 서버만) |
| `DEMO_ROLLING` | `true` | 시연 기록 시각을 현재로 옮김 → 며칠 지나도 "1,284대" 그대로 |
| `LOG` · `NODE_ENV` | `true`(테스트 제외) · `development` | 요청 로그 · `production` 이면 `ADMIN_TOKEN` 검사 |

## 엔드포인트

자세한 모양은 [`docs/api.md`](../../docs/api.md) 와 [`packages/api-types/index.ts`](../../packages/api-types/index.ts).

| | 경로 |
|---|---|
| 공개 (v1) | `GET /health` · `GET /v1/lots` · `GET /v1/lots/match` · `GET /v1/lots/:id` · `GET /v1/lots/:id/easier` · `POST /v1/records` (202) · `POST /v1/lots/:id/ratings` · `POST /v1/shares` (201) · `GET /v1/shares/:code` (404/410) |
| 기기·페어링 (v1.1) | `POST /v1/devices` (201) · `POST /v1/pairings` (차, 201) · `GET /v1/pairings/:code` (차) · `POST /v1/pairings/:code/claim` (인증 없음, 404/410/429) |
| 내 주차 (v1.1, `Authorization: Device <token>`) | `GET·DELETE /v1/me` (+ `settings`) · `PATCH /v1/me/settings` · `PUT /v1/me/parkings/:id` (차) · `GET /v1/me/parkings` · `GET /v1/me/parkings/current` · `GET /v1/me/parkings/:id` · `POST /v1/me/parkings/:id/found` · `GET /v1/me/stats` · `GET /v1/push/key` · `POST·DELETE /v1/me/push` (폰) |
| 주차왕 (v1.2) | `GET /v1/king/nickname` (공개) · `POST /v1/me/king/join` · `DELETE /v1/me/king` · `GET /v1/me/king` · `GET /v1/me/king/board` · `GET /v1/me/king/results/last` (404) · `PUT /v1/me/parkings/:id` 응답 `king` |
| 대시보드 (v1.1, 공개·집계만, `demo` 표시) | `GET /v1/insights/overview` · `GET /v1/insights/lots/:id` (`?floor=B2&maxPaths=300`, 동선은 한 층) · `GET /v1/insights/compare` (`?category=OFFICE` 또는 `DEPARTMENT,MALL`) |
| 어드민 | `GET /v1/admin/overview` · `GET·POST /v1/admin/lots` · `GET·PUT·DELETE /v1/admin/lots/:id` · `GET /v1/admin/lots/:id/records` · `GET /v1/admin/records` · `POST /v1/admin/recompute` · `POST /v1/admin/king/demo-car` (촬영용) |
| 주기 작업 | `GET /v1/cron/maintain` (Bearer `CRON_SECRET` 또는 어드민 토큰) · Netlify 예약 함수 `maintain` |

- 에러는 항상 `{"error":{"code","message"}}`. CORS: 공개(기기 토큰 요청 포함) `*`, 어드민은 `ADMIN_ORIGINS` 만
- 점수는 `lots` 테이블에 캐시: 기록·별점이 들어오면 그 주차장만, 주기적으로(Node 1시간 · Netlify 예약 함수/Vercel Cron 하루 한 번)·`/v1/admin/recompute` 때 전체
- 개인정보: 익명 기록에 좌표·차량 식별값 없음, 받은 시각도 정시로 내림. 기기 토큰은 SHA-256 만 저장. 내 주차는 그 차와 연결된 폰만 봄.
  짧은 링크 내용은 만료되면 바로 지움. 대시보드 응답에는 기록 한 건을 알아낼 값이 없음

## 예시

`npm run dev`(`PUBLIC_WEB_BASE=http://localhost:5173`)에 실제로 보낸 요청. 차량 앱 E2E 가 아브뉴프랑에 기록을 하나 올린 뒤라 1,107대.

```console
$ curl -s localhost:8787/health
{"ok":true,"version":"1.1.0"}

$ curl -s "localhost:8787/v1/lots?lat=37.39248&lng=127.11221&radius=500" | jq -c '.lots[] | {id, difficulty, sampleCount, distanceM}'
{"id":"hyundai-pangyo","difficulty":4.3,"sampleCount":1284,"distanceM":0}
{"id":"avenue-france-pangyo","difficulty":1.8,"sampleCount":1107,"distanceM":186}
{"id":"hwarang-park-public","difficulty":2.9,"sampleCount":402,"distanceM":358}
{"id":"alphadom-tower","difficulty":2.4,"sampleCount":958,"distanceM":376}

$ curl -s -G localhost:8787/v1/lots/match --data-urlencode "name=현대백화점 판교점" | jq -c '{matchedBy, lot: {id: .lot.id, difficulty: .lot.difficulty, tags: .lot.tags, statChips: .lot.statChips, sampleCount: .lot.sampleCount}}'
{"matchedBy":"name","lot":{"id":"hyundai-pangyo","difficulty":4.3,"tags":["SPIRAL_RAMP","MANY_PILLARS","FREQUENT_REVERSE"],"statChips":["평균 후진 3.2회"],"sampleCount":1284}}

$ curl -s localhost:8787/v1/lots/hyundai-pangyo | jq -c '.lot.stats | del(.hourlyHeat, .hourLabels)'
{"avgReverse":3.2,"overallAvgReverse":1.4,"avgRampTurns":2.5,"overallAvgRampTurns":0.8,"avgDurationSec":130,"overallAvgDurationSec":65,"congestionLabel":"평일 오후","floorCongestion":[{"floor":"B1","occupancy":1},{"floor":"B2","occupancy":0.9},{"floor":"B3","occupancy":0.6},{"floor":"B4","occupancy":0.4},{"floor":"B5","occupancy":0.3},{"floor":"B6","occupancy":0.2}],"congestionSummary":"B1 만차 · B3부터 여유"}

$ curl -s localhost:8787/v1/lots/hyundai-pangyo/easier | jq -c '.suggestions[] | {id: .lot.id, difficulty: .lot.difficulty, walkMinutes, pitch}'
{"id":"avenue-france-pangyo","difficulty":1.8,"walkMinutes":4,"pitch":"걸어서 4분, 훨씬 넓어요"}
{"id":"alphadom-tower","difficulty":2.4,"walkMinutes":7,"pitch":"걸어서 7분, 자리 넉넉해요"}
{"id":"hwarang-park-public","difficulty":2.9,"walkMinutes":7,"pitch":"걸어서 7분, 평면이라 편해요"}

$ curl -s -X POST localhost:8787/v1/records -H 'Content-Type: application/json' -d '{"clientRecordId":"6f1c2a8e-0b1d-4c2e-9a7f-3d5e8b9c1a20","lotId":"pangyo-new","floor":"B2","reverseCount":2,"steeringTurns":5,"brakeCount":11,"durationSec":98,"rampTurns":2.1,"shape":"PERPENDICULAR","approximate":false,"vehicleClass":"SUV","experience":"Y1_3","parkedHour":14,"parkedWeekday":2}'
{"accepted":true,"duplicate":false,"lot":{"id":"pangyo-new","difficulty":null,"sampleCount":4}}      ← 202 (같은 id 를 또 보내면 "duplicate":true)

$ curl -s -X POST localhost:8787/v1/shares -H 'Content-Type: application/json' -d '{"payload":{"v":1,"lot":"아브뉴프랑 판교 주차장","f":"B2","z":"D","n":"07","t":1793685120000,"m":"엘리베이터 2번 쪽","h":["주차장 입구에서 곧장","첫 번째 통로에서 오른쪽","왼쪽 칸 줄, 약 60m 지점"],"r":[0,12,-1,55,1]}}'
{"code":"zq82pn","url":"http://localhost:5173/s/zq82pn","expiresAt":"2026-11-05T13:38:20.854Z"}      ← 201 (48시간 뒤 GET 은 410)

$ curl -s localhost:8787/v1/admin/overview
{"error":{"code":"unauthorized","message":"어드민 토큰이 없거나 맞지 않아요"}}      ← 401
$ curl -s -H "Authorization: Bearer dev-admin-token" localhost:8787/v1/admin/overview | jq -c .totals
{"lots":51,"avgDifficulty":3,"records":38203,"records30d":9266,"ratings":398,"shares":1}
```

v1.1 페어링 → 내 주차 동기화 (차량 앱 `PairingSyncTest` 와 같은 요청 모양):

```console
$ curl -s -X POST localhost:8787/v1/devices -H "Content-Type: application/json" -d '{"kind":"car","name":"그랜저"}'
{"deviceId":"557243a3-c6a3-4ce4-a803-06ea998b58ec","token":"h9B_uf…"}
$ curl -s -X POST localhost:8787/v1/pairings -H "Authorization: Device $CAR_TOKEN" -H "Content-Type: application/json" -d "{}"
{"code":"684422","url":"http://localhost:5173/pair/684422","expiresAt":"2026-11-03T13:43:43.477Z"}
$ curl -s localhost:8787/v1/pairings/684422 -H "Authorization: Device $CAR_TOKEN"
{"status":"pending","phoneName":null}
$ curl -s -X POST localhost:8787/v1/pairings/684422/claim -H "Content-Type: application/json" -d '{"phoneName":"갤럭시 S25"}'      # 폰 (인증 없음)
{"token":"ZmhRSm…","car":{"deviceId":"557243a3-c6a3-4ce4-a803-06ea998b58ec","name":"그랜저","pairedAt":"2026-11-03T13:33:43.543Z"}}
$ curl -s localhost:8787/v1/pairings/684422 -H "Authorization: Device $CAR_TOKEN"
{"status":"claimed","phoneName":"갤럭시 S25"}

$ curl -s -X PUT localhost:8787/v1/me/parkings/rec-sync-1 -H "Authorization: Device $CAR_TOKEN" -H "Content-Type: application/json" -d '{"lotId":"avenue-france-pangyo",…,"path":[[0.0,0.0,0.0,1.571,0.0],…]}'
{"parking":{"id":"rec-sync-1","lotId":"avenue-france-pangyo","lotName":"아브뉴프랑 판교 주차장","floor":"B2","zone":"D","number":"07","note":null,"parkedAt":"2026-11-03T05:52:00.000Z","summary":{"reverseCount":2,…},"hints":["램프를 다 내려와서 곧장","오른쪽 칸 줄, 약 15m 지점"],"route":[1,17,-1],"path":[…],"foundAt":null,"updatedAt":"2026-11-03T13:33:43.638Z"}}
$ curl -s localhost:8787/v1/me/parkings/current -H "Authorization: Device $PHONE_TOKEN" | jq -c '{id: .parking.id, floor: .parking.floor, zone: .parking.zone, number: .parking.number}'
{"id":"rec-sync-1","floor":"B2","zone":"D","number":"07"}
$ curl -s -X POST localhost:8787/v1/me/parkings/rec-sync-1/found -H "Authorization: Device $PHONE_TOKEN" | jq -c '{foundAt: .parking.foundAt}'
{"foundAt":"2026-11-03T13:33:43.692Z"}
$ curl -s localhost:8787/v1/me/parkings/current -H "Authorization: Device $PHONE_TOKEN"
{"parking":null}
$ curl -s localhost:8787/v1/me/stats -H "Authorization: Device $PHONE_TOKEN"
{"thisMonthAvgReverse":2,"lastMonthAvgReverse":null,"monthly":[{"month":"2026-11","avgReverse":2}],"favorites":[{"lotId":"avenue-france-pangyo","count":1}]}

$ curl -s localhost:8787/v1/me/parkings/rec-sync-2 -H "Authorization: Device $PHONE_TOKEN" | jq -c '{id: .parking.id, floor: .parking.floor, zone: .parking.zone, number: .parking.number, path: (.parking.path | length)}'
{"id":"rec-sync-2","floor":"B2","zone":"D","number":"07","path":2}      ← M-33 한 건 (다른 차 토큰이면 404)
$ curl -s -X PATCH localhost:8787/v1/me/settings -H "Authorization: Device $PHONE_TOKEN" -H "Content-Type: application/json" -d '{"shareAnonymous":false,"experience":"Y1_3"}'
{"settings":{"shareAnonymous":false,"experience":"Y1_3"}}      ← 폰 M-12 "나만 볼게요" · M-40 운전 경력
$ curl -s localhost:8787/v1/me -H "Authorization: Device $CAR_TOKEN"
{"kind":"car","car":null,"phones":1,"settings":{"shareAnonymous":false,"experience":"Y1_3"}}      ← 차는 시작할 때 읽음
```

v1.1 대시보드 (D-01 · D-03 · D-02). 판교 9곳 숫자·도면·동선은 `packages/insights-demo`(어드민 시연 모드)와 같다.
아래는 차량 앱 E2E 가 아브뉴프랑에 실제 기록 1건을 올린 뒤라 6,389건 (시드만이면 정확히 6,388):

```console
$ curl -s "localhost:8787/v1/insights/overview?region=pangyo&days=30" | jq -c '{demo, totals, improved: [.improved[] | [.name, .before, .after]]}'
{"demo":true,"totals":{"records":6389,"lots":9,"avgReverse":2,"prevAvgReverse":2.3},"improved":[["화랑공원 공영",2.2,1.8],["H스퀘어",2.9,2.6],["아브뉴프랑 판교",1.4,1.1],["알파돔타워",1.7,1.5]]}
$ curl -s "localhost:8787/v1/insights/compare?region=pangyo&category=OFFICE" | jq -c '{region, days, demo}, (.lots[] | [.shortName, .rampKind, .difficulty, .avgReverse, .avgRampTurns, .avgDurationSec, .records])'
{"region":{"id":"pangyo","name":"판교 일대"},"days":30,"demo":true}
["유스페이스","SPIRAL",4.1,2.9,1.5,115,642]
["H스퀘어","SPIRAL",3.9,2.6,2,110,871]
["판교세븐벤처밸리","SPIRAL",3.6,2.4,1,100,515]
["알파돔타워","STRAIGHT",2.4,1.5,0.3,65,958]
$ curl -s "localhost:8787/v1/insights/lots/hyundai-pangyo" | jq -c '{demo, rampKind: .lot.rampKind, floors: [.floorAvgReverse[] | "\(.floor) \(.avgReverse)"], overlay: [.overlays[] | "\(.floor) \(.paths | length)"], layout: (.layout | length), hotspots: (.hotspots | length), regionAvg: .lot.regionAvgReverse}'
{"demo":true,"rampKind":"SPIRAL","floors":["B1 2.1","B2 3.6","B3 3.4","B4 3","B5 2.8","B6 2.6"],"overlay":["B2 300"],"layout":6,"hotspots":10,"regionAvg":2}      ← 동선은 가장 많은 층 하나, 300개까지 (?floor=B3&maxPaths=50)
```

### v1.2 주차왕 — 로컬 E2E

빈 SQLite 파일로 `DB_PATH=…/e2e.db PORT=8799 npm run dev` 를 띄우고(2026-11-04 수요일 10:34 KST) 보낸 요청 그대로 (토큰은 줄임).
차 등록 → 폰 연결 → 경력 1년 미만 → 참여 → 주차 4건(하나는 시속 14km) → 내 순위·순위판·PUT 전후 등수, 그다음 촬영용 시연 차:

```console
$ curl -s -X POST localhost:8799/v1/devices -d '{"kind":"car","name":"아이오닉 5"}'
{"deviceId":"f203b56d-9eaa-4bc2-9ef0-fe5a9edab090","token":"9lStz2…"}
$ curl -s -X POST localhost:8799/v1/pairings -H "Authorization: Device $CAR_TOKEN"
{"code":"823539","url":"http://localhost:5173/pair/823539","expiresAt":"2026-11-04T01:44:56.159Z"}
$ curl -s -X POST localhost:8799/v1/pairings/823539/claim -d '{"phoneName":"갤럭시 S25"}'
{"token":"XdgNgz…","car":{"deviceId":"f203b56d-9eaa-4bc2-9ef0-fe5a9edab090","name":"아이오닉 5","pairedAt":"2026-11-04T01:34:56.178Z"}}
$ curl -s -X PATCH localhost:8799/v1/me/settings -H "Authorization: Device $PHONE_TOKEN" -d '{"experience":"UNDER_1Y"}'
{"settings":{"shareAnonymous":true,"experience":"UNDER_1Y"}}

$ curl -s localhost:8799/v1/me/king -H "Authorization: Device $PHONE_TOKEN" | jq -c '{joined, league: .league.label, longLabel: .league.longLabel, total, week}'
{"joined":false,"league":"판교 초보","longLabel":"판교 · 1년 미만","total":148,"week":{"start":"2026-11-01T15:00:00.000Z","end":"2026-11-08T15:00:00.000Z"}}      ← 참여 전: 들어갈 리그 (M-52)
$ curl -s localhost:8799/v1/me/king/board -H "Authorization: Device $PHONE_TOKEN" | jq -c '{total, demo, top: [.top[] | "\(.rank) \(.nickname) \(.score)점"]}'
{"total":148,"demo":true,"top":["1 백현 조용한 고래 96점","2 삼평 단단한 펭귄 94점","3 운중 느린 거북 93점","4 판교 맑은 여우 91점","5 백현 둥근 너구리 90점"]}
$ curl -s "localhost:8799/v1/king/nickname?region=pangyo"
{"nickname":"운중 느린 백조"}
$ curl -s -X POST localhost:8799/v1/me/king/join -H "Authorization: Device $PHONE_TOKEN" -d '{"nickname":"운중 느린 백조"}' | jq -c '.me | {joined, nickname, league: .league.id, rank, total, nextHint}'
{"joined":true,"nickname":"운중 느린 백조","league":"pangyo:UNDER_1Y","rank":null,"total":148,"nextHint":"깔끔하게 한 번 대면 30등이에요"}

$ curl -s -X PUT localhost:8799/v1/me/parkings/e2e-1 -H "Authorization: Device $CAR_TOKEN" -d '{"lotId":"h-square",…,"summary":{"reverseCount":1,"steeringTurns":2,…,"maxSpeedKmh":7},…}' | jq -c '{parking: {id: .parking.id, maxSpeedKmh: .parking.summary.maxSpeedKmh}, king}'
{"parking":{"id":"e2e-1","maxSpeedKmh":7},"king":{"rankBefore":null,"rankAfter":54}}      ← 1건이라 0.8배: 45 + 6 + 7 = 58점
$ curl -s -X PUT localhost:8799/v1/me/parkings/e2e-2 … '{"lotId":"avenue-france-pangyo",…,"summary":{"reverseCount":0,"steeringTurns":1,…,"maxSpeedKmh":14},…}'
{"parking":{"id":"e2e-2","maxSpeedKmh":14},"king":{"rankBefore":54,"rankAfter":54}}      ← 시속 14km: 빠짐 (등수 그대로)
$ curl -s -X PUT localhost:8799/v1/me/parkings/e2e-3 … '{"lotId":"hyundai-pangyo",…,"summary":{"reverseCount":0,"steeringTurns":1,…,"maxSpeedKmh":6},…}'
{"parking":{"id":"e2e-3","maxSpeedKmh":6},"king":{"rankBefore":54,"rankAfter":14}}
$ curl -s -X PUT localhost:8799/v1/me/parkings/e2e-4 … '{"lotId":"alphadom-tower",…,"summary":{"reverseCount":2,"steeringTurns":3,…,"maxSpeedKmh":8},…}'
{"parking":{"id":"e2e-4","maxSpeedKmh":8},"king":{"rankBefore":14,"rankAfter":18}}      ← 평균이라 후진 2번이면 내려감

$ curl -s localhost:8799/v1/me/king -H "Authorization: Device $CAR_TOKEN" | jq -c '{nickname, league: .league.label, rank, total, percentile, score, prevWeekRank, nextHint}, (.parkings[] | {parkingId, reverseCount, grade, excludedReason})'
{"nickname":"운중 느린 백조","league":"판교 초보","rank":18,"total":149,"percentile":13,"score":{"total":76,"maneuver":56,"lotsVisited":13,"improvement":7},"prevWeekRank":null,"nextHint":"한 번만 더 깔끔하게 대면 14등이에요"}
{"parkingId":"e2e-4","reverseCount":2,"grade":"OK","excludedReason":null}
{"parkingId":"e2e-3","reverseCount":0,"grade":"CLEAN","excludedReason":null}
{"parkingId":"e2e-2","reverseCount":0,"grade":"EXCLUDED","excludedReason":"SPEED"}
{"parkingId":"e2e-1","reverseCount":1,"grade":"CLEAN","excludedReason":null}
$ curl -s localhost:8799/v1/me/king/board -H "Authorization: Device $PHONE_TOKEN" | jq -c '{league: .league.label, total, demo, around: [.around[] | "\(.rank) \(.nickname) \(.score)\(if .isMe then " (나)" else "" end)"]}'
{"league":"판교 초보","total":149,"demo":true,"around":["17 백현 느긋한 고양이 78","18 운중 느린 백조 76 (나)","19 운중 밝은 수달 76"]}      ← 같은 76점이면 후진·핸들 높은 쪽이 앞
$ curl -s localhost:8799/v1/me/king/results/last -H "Authorization: Device $PHONE_TOKEN"
{"error":{"code":"not_found","message":"지난주 주차왕 점수가 없어요"}}      ← 이번 주에 처음 참여
```

**촬영용 시연 차** — `POST /v1/admin/king/demo-car` (어드민 토큰) 본문 `{"deviceId":"<차 기기 id>","scenario":"board"|"results"}` (기본 `board`).
그 차를 판교 초보 **"판교 느긋한 수달" 82점(58·13·11) 12등**으로 만든다. **그 차의 최근 30일 + 이번 주 주차를 시연 주차 9건으로 바꾸니 시연 차에만** 쓸 것 (규칙·숫자: [docs/api.md](../../docs/api.md) v1.2).
차 기기 id 는 차가 받은 `POST /v1/devices` 응답의 `deviceId` (차량 앱 저장소). `board` = C-13·M-50·M-51(지난주 17등), `results` = M-53(지난주 9등 · 3계단).
촬영 순서: 도우미 → C-13/M-50 확인 → 이미 간 주차장(현대백화점 등)에 후진 없이 주차 → C-05 "12등 → 10등".

```console
$ curl -s -X POST localhost:8799/v1/admin/king/demo-car -H 'Authorization: Bearer dev-admin-token' -H 'Content-Type: application/json' -d '{"deviceId":"<시연 차 id>"}' | jq -c '{scenario, me: (.me | {nickname, rank, total, score, prevWeekRank, nextHint}), around: [.board.around[] | "\(.rank) \(.nickname) \(.score)"], lastWeek: (.lastWeek | {rank, total, percentile, score})}'
{"scenario":"board","me":{"nickname":"판교 느긋한 수달","rank":12,"total":149,"score":{"total":82,"maneuver":58,"lotsVisited":13,"improvement":11},"prevWeekRank":17,"nextHint":"한 번만 더 깔끔하게 대면 10등이에요"},"around":["11 판교 차분한 두루미 84","12 판교 느긋한 수달 82","13 운중 다정한 곰 81"],"lastWeek":{"rank":17,"total":148,"percentile":12,"score":77}}
                                                    ← 인원 149 = 시연 147 + 시연 차 + 위의 "운중 느린 백조" (시연 차만 있으면 148)
$ curl -s -X PUT localhost:8799/v1/me/parkings/filming-1 -H "Authorization: Device $DEMO_CAR_TOKEN" -d '{"lotId":"hyundai-pangyo",…,"reverseCount":0,"steeringTurns":1,…}' | jq -c '{king}'
{"king":{"rankBefore":12,"rankAfter":10}}      ← C-05 "주차왕 이번 주 12등 → 10등"
$ curl -s -X POST localhost:8799/v1/admin/king/demo-car -H 'Authorization: Bearer dev-admin-token' -H 'Content-Type: application/json' -d '{"deviceId":"<시연 차 id>","scenario":"results"}' | jq -c .lastWeek
{"week":{"start":"2026-10-25T15:00:00.000Z","end":"2026-11-01T15:00:00.000Z"},"league":{"id":"pangyo:UNDER_1Y","region":"pangyo","regionName":"판교","experience":"UNDER_1Y","label":"판교 초보","longLabel":"판교 · 1년 미만"},"rank":9,"total":148,"percentile":7,"score":86,"rankDelta":3,"badges":["TOP10","PIONEER","CLIMBER"]}      ← M-53
```

폰 웹 짧은 링크 M-01 (`VITE_API_BASE=http://localhost:8787`):
![](../../docs/screenshots/mobile/m01_shortlink_light.png)

## 배포

### 무료(기본): Netlify Functions + Turso — [docs/deploy.md](../../docs/deploy.md) "Netlify"

- `netlify/functions/api.mts`: API 전체(Functions v2, 웹 표준 `Request → Response`, `hono/netlify`). `netlify.toml`: 모든 경로 → `/.netlify/functions/api/:splat`(200),
  esbuild 로 TS 소스를 바로 묶음(`web-push` 만 node_modules 째로), 정적 파일은 `public/robots.txt` 뿐. 사이트 `parkinggack-api` → https://parkinggack-api.vercel.app
- `netlify/functions/maintain.mts`: 예약 함수(매일 18:17 UTC = 03:17 KST) — 시연 시각 옮기기·만료 링크/페어링 지우기·집계 다시 (Vercel Cron 과 같은 일, HTTP 없이 직접)
- 클라이언트 IP 는 `x-nf-client-connection-ip`. DB·시드·마이그레이션·레이트 리밋은 아래 Vercel 과 같다
- 한 번에: 저장소 루트의 `scripts/deploy-netlify.sh` (폰 `parkinggack` · API `parkinggack-api` · 대시보드 `parkinggack-data`, `--dry-run` · `--create-turso`)

### 무료: Vercel Functions + Turso — [docs/deploy.md](../../docs/deploy.md) "Vercel"

- `api/index.ts`: Vercel 함수 진입점(웹 표준 `Request → Response`), 빌드된 `dist/` 를 부른다. `vercel.json`: 모든 경로 → `/api`, 서울 `icn1`, 하루 한 번 Cron
- DB 는 Turso(`DATABASE_URL=libsql://…`). 함수는 네이티브 모듈 없는 `@libsql/client/http` 를 쓴다
- **시드는 함수 안에서 하지 않는다** — 노트북에서 `npm run migrate && npm run seed` (비었을 때만, 다시 넣으려면 `-- --reset`. Turso 주소·토큰을 환경변수로)
- 첫 요청 때 스키마를 확인·적용(인스턴스 여러 개가 동시에 해도 한 번만). `setInterval` 없음: 요청 때 10분에 한 번 가벼운 정리 + Cron
- 레이트 리밋은 메모리라서 **인스턴스마다 따로** 센다 (무료 시연 규모에서는 충분, 더 엄격하게 하려면 Upstash 같은 공유 저장소)
- 한 번에: 저장소 루트의 `scripts/deploy-vercel.sh` (`VERCEL_TOKEN`·Turso 값만 환경변수로)

### Docker (Fly.io · Render · Railway · 내 서버)

SQLite 파일 하나라 **영구 볼륨**만 있으면 된다(없으면 재배포마다 시연 데이터로 처음부터). 서버는 한 대(레이트 리밋이 메모리라서).
이미지는 [`Dockerfile`](Dockerfile) (multi-stage, `node:22-slim`, 비루트 `node` 사용자, `/data` 볼륨, `/health` 헬스체크). **빌드 컨텍스트는 저장소 루트**.
Turso 를 쓰려면 같은 이미지에 `DATABASE_URL`·`DATABASE_AUTH_TOKEN` 만 주면 된다.

```bash
# 저장소 루트에서
docker build -f apps/server/Dockerfile -t parkinggack-server .
docker run -p 8787:8787 -v parkinggack-data:/data -e ADMIN_TOKEN=$(openssl rand -hex 24) parkinggack-server
# 또는
ADMIN_TOKEN=$(openssl rand -hex 24) docker compose up --build      # 루트 docker-compose.yml, 볼륨 parkinggack-data
```

- **Fly.io**: `fly launch --dockerfile apps/server/Dockerfile --no-deploy` → `fly volumes create parkinggack_data --size 1` → `fly.toml` 에
  `[mounts] source="parkinggack_data" destination="/data"`, `internal_port = 8787` → `fly secrets set ADMIN_TOKEN=… TRUST_PROXY=true` → `fly deploy` (머신 1대)
- **Render**: Docker, Dockerfile Path `apps/server/Dockerfile`, Build Context `.`, Disk 를 `/data` 에 · **Railway**: `RAILWAY_DOCKERFILE_PATH=apps/server/Dockerfile`, Volume `/data`
- 시연 데이터 다시: `docker exec <컨테이너> node dist/apps/server/src/cli/seed.js --reset`

## 구조

| 경로 | 내용 |
|---|---|
| `src/index.ts`, `src/server.ts` | Node 서버: 설정 → DB(마이그레이션) → 빈 DB면 시드 → HTTP, 1시간마다 정리·점수 |
| `src/serverless.ts` | 서버리스 공통: Turso(`@libsql/client/http`) 앱, 첫 요청 마이그레이션, 경로 접두어 떼기, 예약 정리 |
| `netlify/functions/*.mts`, `src/netlify.ts`, `netlify.toml` | Netlify 함수 `api`(`/.netlify/functions/api` 접두어 처리) · 예약 함수 `maintain` |
| `api/index.ts`, `src/vercel.ts`, `vercel.json` | Vercel 함수 (`/api` 접두어 처리) |
| `src/app.ts` | 앱 조립: CORS·로그·가벼운 정리·에러, 라우트 모듈, Cron |
| `src/routes-public.ts` · `routes-me.ts` · `routes-king.ts` · `routes-insights.ts` · `routes-admin.ts` | v1 공개 · 기기/페어링/내 주차/푸시 · 주차왕 · 대시보드 · 어드민 |
| `src/config.ts` · `src/http.ts` · `src/schemas.ts` | 환경변수 · 검증·IP·레이트 리밋 공통 · 요청 검증(zod, 계약 타입과 컴파일 때 대조) |
| `src/db.ts` · `src/db-node.ts` | 버전 붙은 SQL 마이그레이션(동시 적용 안전) · 로컬용 libSQL 클라이언트 |
| `src/store.ts` · `src/me-store.ts` | 주차장·기록·별점·짧은 링크·점수 캐시·시연 시각 옮기기 · 기기·페어링·내 주차·푸시 구독 |
| `src/scoring.ts` · `src/insights.ts` · `src/match.ts` | 난이도 식·태그·층별 혼잡 · 대시보드 집계 · 목적지 → 주차장, 더 쉬운 곳 |
| `src/king.ts` · `src/king-store.ts` | 주차왕 순수 계산(판정·점수·순위·힌트·배지·닉네임·주 경계) · 참여자·이번 주 순위·지난주 고정·시연 차 도우미 |
| `src/push.ts` · `src/maintenance.ts` | 웹 푸시(VAPID) · 주기 작업 (+ 주차왕 지난주 고정) |
| `src/seed/` | 시연 주차장(판교 9곳은 `packages/insights-demo` DEMO_LOTS)·합성 기록(30일 칸·층마다 정확히 맞춤)·D-02 도면/동선(`insights-demo` 생성기)·주차왕 시연 참여자(`king.ts`) |
| `test/` | 엔드포인트 전부(정상·에러), 점수, 시드 목표, 대시보드 수치, 페어링·격리·무차별 대입, 푸시, 링크 만료, CORS, 레이트 리밋, 마이그레이션, Netlify·Vercel, insights-demo 와 같은 숫자 |
