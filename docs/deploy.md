# 무료로 배포하기 — Vercel(기본) 또는 Netlify, DB 는 Turso

차량 앱의 QR·공유 링크는 **https://parkinggack.vercel.app** (폰 앱)을, 서버 주소는 **https://parkinggack-api.vercel.app** 를 본다 (debug·release 모두).
**지금 쓰는 배포처는 Vercel 세 프로젝트 + Turso** 다 (2026-11-04 Netlify 에서 옮김): 폰 https://parkinggack.vercel.app · API https://parkinggack-api.vercel.app · 대시보드 https://parkinggack-data.vercel.app.
한 번에 다시 배포: `scripts/deploy-vercel.sh --skip-seed` ([Vercel](#vercel)). Netlify 로 올리는 법도 대안으로 아래 [Netlify](#netlify-대안--지금은-안-씀) 에 남겨 둔다 (그 경우 차 앱 `-PwebBaseUrl`·`-PapiBaseUrl` 을 Netlify 주소로).
DB 는 어느 쪽이든 **Turso(libSQL, SQLite 호환)** — 서버리스 함수에는 오래 남는 디스크가 없다.

## Netlify (대안 — 지금은 안 씀)

```
[차량 앱 APK] ─▶ https://parkinggack-api.netlify.app   (apps/server → Netlify Functions) ─▶ Turso libsql://parkinggack-<조직>.turso.io
[폰 앱]        https://parkinggack.netlify.app        (apps/mobile, VITE_API_BASE=…api…)  ─┘
[대시보드]     https://parkinggack-data.netlify.app   (apps/admin,  VITE_API_BASE=…api…)  ─┘ (Bearer ADMIN_TOKEN)
```

| 사이트 | 폴더 | 무엇 | 설정 파일 |
|---|---|---|---|
| `parkinggack` | `apps/mobile` | 폰 앱(PWA) — `/pair/<코드>`·`/s/<코드>`·`/p/…` 히스토리 라우팅 | `apps/mobile/netlify.toml`, `public/_redirects` |
| `parkinggack-api` | `apps/server` | API 전체 = 함수 `api` (모든 경로 → `/.netlify/functions/api/:splat`) + 예약 함수 `maintain`(매일 03:17 KST) | `apps/server/netlify.toml`, `netlify/functions/*.mts` |
| `parkinggack-data` | `apps/admin` | 대시보드 D-01~03 + 어드민 | (빌드 결과에 `_redirects` 를 스크립트가 넣음) |

- 함수는 Netlify 가 **TypeScript 소스를 esbuild 로 바로 묶는다** (`[functions] node_bundler = "esbuild"`, `web-push` 는 묶지 않고 node_modules 째로). 실행 중에 읽는 파일은 없다
- 첫 요청에서 마이그레이션을 확인한다(여러 인스턴스가 동시에 해도 한 번). **시드는 함수 안에서 하지 않는다** — 노트북(또는 스크립트)에서 `npm run seed`
- 클라이언트 IP(레이트 리밋·페어링 코드 시도 제한)는 Netlify 가 넣는 `x-nf-client-connection-ip` 로 본다. 레이트 리밋은 인스턴스마다 따로 센다
- 함수 지역: Netlify Functions 기본 지역은 미국(us-east-2)이라 Turso 도 가까운 곳(`aws-us-east-2`)에 두면 왕복이 짧다. 한국 가까이 두려면 Netlify 의 Functions 지역 설정(유료 플랜)을 바꾸고 Turso 도 `aws-ap-northeast-1`(도쿄)로

### 한 번에: `scripts/deploy-netlify.sh`

사이트 만들기(있으면 그대로) → API 환경변수 → Turso 마이그레이션·시드 → 폰·대시보드 빌드 → `netlify deploy --prod` 셋 → curl 확인을 대화 없이 한다.
**비밀값은 환경변수로만 받고 저장소·화면에 남기지 않는다** (`.netlify/` 는 `.gitignore`, 토큰은 임시 헤더 파일로 curl 에 넘김, Netlify CLI 는 `NETLIFY_AUTH_TOKEN` 환경변수를 읽음).

```bash
# 필요: Node 22.12+, npm, curl. Netlify 토큰: app.netlify.com → User settings → Applications → Personal access tokens
export NETLIFY_AUTH_TOKEN=…
export ADMIN_TOKEN=$(openssl rand -hex 24)                       # 어드민 로그인에 씀 — 따로 적어 두기
export DATABASE_URL='libsql://parkinggack-<조직>.turso.io'       # 아래 "Turso DB 만들기" (또는 --create-turso)
export DATABASE_AUTH_TOKEN=…
export VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com   # 선택 (웹 푸시)

scripts/deploy-netlify.sh --dry-run      # 먼저: 할 일(명령·API 호출)만 찍음 — 토큰 없이도 됨
scripts/deploy-netlify.sh                # 전부 (DB 가 비어 있을 때만 시드)
scripts/deploy-netlify.sh --only api     # API 만 다시 (web · api · data, 여러 번 가능)
scripts/deploy-netlify.sh --reseed       # 시연 데이터를 지우고 다시 (실제 기록도 지워짐)
scripts/deploy-netlify.sh --skip-seed    # 마이그레이션만

# Turso DB 까지 만들게 하려면 (DATABASE_URL 을 비워 두고):
export TURSO_API_TOKEN=$(turso auth api-tokens mint parkinggack-deploy) TURSO_ORG=<조직>   # 선택 TURSO_GROUP · TURSO_LOCATION
scripts/deploy-netlify.sh --create-turso
```

- 사이트 이름 `parkinggack`·`parkinggack-api`·`parkinggack-data` 는 바꾸지 않는다. **이름을 다른 계정이 이미 쓰고 있으면 스크립트가 멈춘다** —
  차 앱 링크가 이 주소에 묶여 있어서, 다른 이름으로 몰래 바꾸면 QR·공유 링크가 깨진다. 내 다른 팀에 있으면 `NETLIFY_ACCOUNT_SLUG=<팀 slug>`
- API 사이트 환경변수(스크립트가 넣음): `DATABASE_URL` · `DATABASE_AUTH_TOKEN` · `ADMIN_TOKEN` · `ADMIN_ORIGINS=https://parkinggack-data.netlify.app` ·
  `PUBLIC_WEB_BASE=https://parkinggack.netlify.app` (+ `VAPID_*`). 폰·대시보드는 빌드 때 `VITE_API_BASE=https://parkinggack-api.netlify.app`
- 모노레포: `apps/mobile`·`apps/admin`·`apps/server` 는 `../../packages/*` 를 상대 경로로 읽는다. 스크립트는 저장소 안에서 빌드한 뒤 `dist` 만 올리므로 그대로 된다
- 끝에 확인: API `/health` · `/v1/insights/overview` · 어드민 CORS, 폰 `/` · `/pair/000000`, 대시보드 `/`

### 무료(Free) 팀에서 꼭 확인할 것 — 실제 배포하며 겪은 것 (2026-11-03)

1. **방문자 접근 보호(Visitor access)를 끌 것.** 새 팀은 *Netlify login protection*(팀 SSO)이 모든 배포에 켜져 있을 수 있다.
   켜져 있으면 세 사이트가 모두 **401 "Login Redirect"** 를 돌려줘서 차·폰이 API를 못 부르고, QR을 찍은 폰도 페이지를 못 연다.
   app.netlify.com → 각 프로젝트(`parkinggack`, `parkinggack-api`, `parkinggack-data`) → **Project configuration → Access & security → Visitor access**
   → *Password / Netlify login protection* → **No protection(보호 끔)** 으로 저장. (팀 기본값: Team settings → Access & security)
   확인: `curl -s -o /dev/null -w '%{http_code}' https://parkinggack-api.netlify.app/health` → `200`
2. **환경변수 scopes 지정 불가.** 무료 요금제는 env var에 scopes(builds/functions/runtime)를 지정하면 403
   ("Upgrade your Netlify account to set specific scopes") — 스크립트는 scopes 없이(=전체) 넣는다.
3. Turso DB는 함수 지역과 가까울수록 빠르다. 함수 기본 지역은 미국 동부(us-east-1)라 도쿄(`aws-ap-northeast-1`) DB면 요청마다 약 150ms가 더 걸린다 — 시연엔 문제없음.

### UI 로 하기 (Import from Git)

app.netlify.com → **Add new project → Import an existing project → GitHub `parkinggack/parkinggack`** 를 세 번 (사이트마다 하나).
세 사이트 모두 저장소 전체를 받으므로 `../../packages/*` 상대 경로가 그대로 된다.

| 사이트 이름 | Base directory | Build command | Publish directory | Functions directory | 환경변수 |
|---|---|---|---|---|---|
| `parkinggack-api` | `apps/server` | (netlify.toml: `npm run typecheck`) | `public` | `netlify/functions` | `DATABASE_URL` `DATABASE_AUTH_TOKEN` `ADMIN_TOKEN` `ADMIN_ORIGINS=https://parkinggack-data.netlify.app` `PUBLIC_WEB_BASE=https://parkinggack.netlify.app` (+ `VAPID_*`) |
| `parkinggack` | `apps/mobile` | (netlify.toml: `npm ci && npm test && npm run build`) | `dist` | — | `VITE_API_BASE=https://parkinggack-api.netlify.app` |
| `parkinggack-data` | `apps/admin` | `npm ci && npm run build && printf '/*  /index.html  200\n' > dist/_redirects` | `dist` | — | `VITE_API_BASE=https://parkinggack-api.netlify.app` · `NODE_VERSION=22` |

1. 사이트를 만든 뒤 **Site configuration → Change site name** 으로 위 이름을 정한다 (이미 쓰는 이름이면 Netlify 가 거절 — 그때는 멈추고 이름 주인을 확인)
2. API 사이트 환경변수는 **Site configuration → Environment variables** 에서 (Scopes 에 Functions 포함). 넣은 뒤 **Deploys → Trigger deploy**
3. DB 마이그레이션·시드는 노트북에서 한 번: 아래 [Turso DB 만들기](#1-turso-db-만들기) · [스키마 + 시연 데이터](#2-스키마--시연-데이터-넣기-노트북에서) (`npm run seed`)
4. 예약 함수 `maintain` 은 **Logs & metrics → Functions** 에 Scheduled 로 보인다. 지금 한 번 돌리려면 거기서 **Run now** (예약 함수는 프로덕션 배포에서만 돈다)
5. 차량 앱: release 빌드는 이미 `https://parkinggack-api.netlify.app`·`https://parkinggack.netlify.app` 를 본다 (`apps/vehicle/app/build.gradle.kts`). debug 는 `-PapiBaseUrl=https://parkinggack-api.netlify.app`

### 로컬에서 확인한 것 (Netlify 토큰 없이)

- `npm test` 의 `test/netlify.test.ts`: `/.netlify/functions/api/…` 와 원래 경로가 같은 처리, 첫 요청 마이그레이션, CORS(폰 `*`·대시보드 출처), `x-nf-client-connection-ip` 레이트 리밋, 예약 함수
- Netlify 가 쓰는 묶음기(`@netlify/zip-it-and-ship-it`)로 `netlify/functions` 를 묶은 결과를 로컬 libSQL 서버(`ghcr.io/tursodatabase/libsql-server`, Turso 와 같은 HTTP 프로토콜)에
  붙여 실행: 마이그레이션·시드(원격 batch) → `/health`·대시보드·기기·설정·예약 함수 모두 응답
- `scripts/deploy-netlify.sh --dry-run`, `shellcheck`

---

# Vercel

서버(`apps/server`)는 **Vercel Functions(Node)** 에서, 폰 웹(`apps/mobile`)과 어드민·대시보드(`apps/admin`)는 **Vercel 정적 배포**로 올린다.
이때는 차량 앱을 `-PapiBaseUrl=… -PwebBaseUrl=…` 로 빌드해서 주소를 바꿔야 한다 (8단계).

```
[차량 앱 APK] ──▶ https://<서버>.vercel.app  (apps/server, 서울 icn1) ──▶ Turso libsql://parkinggack-<조직>.turso.io
[폰 웹]      https://<폰>.vercel.app      ──VITE_API_BASE──┘
[어드민]     https://<어드민>.vercel.app  ──VITE_API_BASE──┘ (Bearer ADMIN_TOKEN)
```

한 번에 하려면 맨 아래 [스크립트](#한-번에-scriptsdeploy-vercelsh)를 쓴다. 처음이면 아래 순서대로 한 번 손으로 해 보는 게 좋다.

## 0. 준비

- GitHub 저장소 `parkinggack/parkinggack` (비공개여도 됨)
- 노트북: Node 22, `git`, (선택) `openssl`
- 무료 계정: [Turso](https://turso.tech) · [Vercel](https://vercel.com) (GitHub 로 가입하면 편함)

비밀값(토큰·키)은 **저장소에 넣지 않는다.** 아래에서 만든 값은 Vercel 프로젝트 환경변수와 각자 노트북에만 둔다.

## 1. Turso DB 만들기

```bash
# CLI 설치 (macOS: brew install tursodatabase/tap/turso)
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup            # 처음이면 (이미 있으면 turso auth login)

turso db locations           # 고를 수 있는 지역 목록
turso db create parkinggack --location icn          # 목록에 서울(icn)이 있으면
# 없으면 가장 가까운 곳: 예) turso db create parkinggack --location aws-ap-northeast-1   (도쿄)
# Netlify Functions(기본 지역 미국 us-east-2)로 올리면: turso db create parkinggack --location aws-us-east-2

turso db show parkinggack --url        # → libsql://parkinggack-<조직>.turso.io      = DATABASE_URL
turso db tokens create parkinggack     # → eyJhbGciOi…                               = DATABASE_AUTH_TOKEN
```

## 2. 스키마 + 시연 데이터 넣기 (노트북에서)

서버리스 함수 안에서는 시드를 하지 않는다(수만 건이라 시간 초과). 노트북에서 한 번:

```bash
cd apps/server
npm ci
export DATABASE_URL='libsql://parkinggack-<조직>.turso.io'
export DATABASE_AUTH_TOKEN='<위 토큰>'
npm run migrate              # → 스키마 v3
npm run seed                 # 비어 있을 때만: 판교 9곳 + 테크원 + 수도권 41곳, 기록 약 3만 8천 건 (원격이라 10초~1분)
# npm run seed -- --reset    # 지우고 다시 (실제 기록도 지워짐)
```

마지막에 판교 9곳 표가 `ok` 로 나오면 된다. 스키마가 바뀌는 새 버전을 배포할 때도 `npm run migrate` 를 먼저 (서버도 첫 요청 때 스스로 확인하지만, 미리 해 두면 첫 요청이 느리지 않다).

## 3. 비밀값 만들기

```bash
openssl rand -hex 24                 # ADMIN_TOKEN (16자 이상, 어드민 로그인에 씀)
openssl rand -hex 16                 # CRON_SECRET (Vercel Cron 이 매일 정리 작업을 부를 때)
npx web-push generate-vapid-keys     # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (웹 푸시, 선택)
```

웹 푸시를 안 쓰면 VAPID 셋을 비워 둔다 (`GET /v1/push/key` 가 404 → 폰 앱은 알림 버튼을 숨김).
`VAPID_SUBJECT` 는 `mailto:you@example.com` 처럼 연락처.

## 4. 서버 — Vercel 프로젝트 ①

1. Vercel → **Add New… → Project → Import** `parkinggack/parkinggack`
2. **Project Name**: 예) `parkinggack-api` → 주소 `https://parkinggack-api.vercel.app`
3. **Root Directory: `apps/server`** · Framework Preset: **Other** (빌드 설정은 `apps/server/vercel.json` 이 채움:
   `npm ci` → `npm run build`, 모든 경로 → `api/index.ts`, 지역 서울 `icn1`, 매일 Cron)
4. **"Include files outside of the root directory in the Build Step"** 는 켠 채로 (기본값) — 빌드가 `packages/api-types` 를 읽는다
5. **Environment Variables** (Production):

   | 이름 | 값 |
   |---|---|
   | `DATABASE_URL` | `libsql://parkinggack-<조직>.turso.io` |
   | `DATABASE_AUTH_TOKEN` | Turso 토큰 |
   | `ADMIN_TOKEN` | 3단계 값 |
   | `CRON_SECRET` | 3단계 값 |
   | `ADMIN_ORIGINS` | 지금은 `http://localhost:5174` — 7단계에서 어드민 주소로 바꿈 |
   | `PUBLIC_WEB_BASE` | 지금은 `https://parkinggack.netlify.app` — 7단계에서 폰 웹 주소로 바꿈 |
   | `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT` | 3단계 값 (선택) |

6. **Deploy** → `https://parkinggack-api.vercel.app/health` 가 `{"ok":true,"version":"1.1.0"}` 이면 성공.
   `…/v1/insights/overview` 에 `"records":6388` 이 보이면 Turso 시드까지 연결된 것

서버리스라서 다른 점:
- 레이트 리밋(공개 POST 분당 60, 페어링 코드 틀린 시도 분당 10)은 **인스턴스마다 따로** 센다 (무료 시연 규모에서는 충분)
- 주기 작업: 요청이 올 때 인스턴스마다 10분에 한 번 가벼운 정리(시연 기록 시각 옮기기·만료 링크·페어링 정리) +
  **매일 한 번 Vercel Cron** 이 `GET /v1/cron/maintain`(Bearer `CRON_SECRET`)으로 전체 점수를 다시 계산
- 첫 요청(콜드 스타트)은 1~2초 걸릴 수 있다. 차량 앱은 오프라인 우선이라 괜찮다

## 5. 폰 웹 — Vercel 프로젝트 ②

1. **Import** 같은 저장소 → Project Name 예) `parkinggack` → `https://parkinggack.vercel.app`
2. **Root Directory: `apps/mobile`** · Framework: **Vite** (Build `npm run build`, Output `dist`)
3. Environment Variables: **`VITE_API_BASE` = `https://parkinggack-api.vercel.app`** (빌드 때 들어가므로 바꾸면 다시 배포)
4. 경로 `/p/*`, `/s/*`, `/pair/*` 가 앱(index.html)으로 가야 한다 — `apps/mobile` 에 `vercel.json` rewrites 가 있는지 확인
   (없으면 `{"rewrites":[{"source":"/(p|s|pair)/(.*)","destination":"/index.html"}]}`)
5. Deploy → `https://parkinggack.vercel.app/dev/` 에서 "API 서버 연결됨"

## 6. 어드민·대시보드 — Vercel 프로젝트 ③

1. **Import** 같은 저장소 → 예) `parkinggack-admin` → `https://parkinggack-admin.vercel.app`
2. **Root Directory: `apps/admin`** · Framework: **Vite**
3. Environment Variables: **`VITE_API_BASE` = `https://parkinggack-api.vercel.app`**
4. Deploy → 대시보드(D-01~D-03)는 공개 `/v1/insights/*`, 어드민 화면은 `ADMIN_TOKEN` 으로 로그인

## 7. 서버에 웹 주소 알려 주기

서버 프로젝트 ① → Settings → Environment Variables:

| 이름 | 값 |
|---|---|
| `ADMIN_ORIGINS` | `https://parkinggack-admin.vercel.app` (쉼표로 여러 개, 로컬 개발도 쓰려면 `,http://localhost:5174`) |
| `PUBLIC_WEB_BASE` | `https://parkinggack.vercel.app` — 짧은 링크 `…/s/<코드>`, 페어링 QR `…/pair/<6자리>` 주소 |

→ **Deployments → … → Redeploy** (환경변수는 다시 배포해야 반영)

### 배포가 `Blocked` 로 멈출 때 (Hobby)
CLI 로 올린 배포가 빌드도 안 하고 **Blocked** 면, 커밋 작성자(GitHub 계정·이메일)가 Vercel 계정 주인과 달라서다 —
Hobby 팀은 협업자를 받지 않아서, 배포에 붙은 git 정보의 작성자가 팀 주인이 아니면 막는다.
`scripts/deploy-vercel.sh` 는 저장소를 `.git` 없이 임시 폴더로 복사해서 올리므로 걸리지 않는다.
직접 올릴 때도 `.git` 없는 복사본에서 `vercel deploy --prod` 하거나, 이미 Ready 인 배포를 `vercel redeploy <주소>` 하면 된다
(redeploy 는 그 배포의 **예전 코드**를 다시 올리는 것이라 코드가 바뀌었으면 소용없다).

## 8. 차량 앱 APK

```bash
cd apps/vehicle
./gradlew assembleDebug \
  -PapiBaseUrl=https://parkinggack-api.vercel.app \
  -PwebBaseUrl=https://parkinggack.vercel.app
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

배포한 서버로 차량 앱 E2E 를 돌려 볼 수도 있다 (기록·별점·짧은 링크가 실제로 하나씩 생김):

```bash
PG_SERVER_URL=https://parkinggack-api.vercel.app ./gradlew --no-daemon --max-workers=1 testDebugUnitTest --tests '*LiveServerE2ETest*'
```

## 9. 마지막 확인

- [ ] `https://<서버>/health` → `{"ok":true,"version":"1.1.0"}`
- [ ] `https://<서버>/v1/insights/overview` → `"records":6388,"lots":9,"avgReverse":2`
- [ ] `https://<서버>/v1/lots/match?name=현대백화점` → 현대백화점 ★4.3
- [ ] 어드민에서 로그인 → 개요(합계·최근 기록)가 보임 (CORS: `ADMIN_ORIGINS` 에 어드민 주소)
- [ ] 폰 웹 `/dev/` → "API 서버 연결됨", 짧은 링크 카드가 `https://<폰>/s/<코드>` 로 열림
- [ ] 차 화면 C-10 › 폰 연결 → QR 이 `https://<폰>/pair/<6자리>` → 폰에서 열면 "내 차와 연결됐어요"
- [ ] 차에서 주차 → 폰 홈(M-20) "지금 주차 중"에 층·구역 (VAPID 를 넣었으면 알림 "B2 · D-07에 주차했어요")
- [ ] Vercel 서버 프로젝트 → Settings → Cron Jobs 에 `/v1/cron/maintain` 이 보임 (Netlify 는 Functions 목록에 `maintain` Scheduled)
- [ ] 저장소에 토큰·키가 없음 (`git grep -n "turso.io\|eyJhbGci"` 이 비어 있어야)

## 한 번에: `scripts/deploy-vercel.sh`

1~8단계를 Vercel CLI 로 대화 없이 한다 (프로젝트 만들기·연결, 환경변수, 배포, Turso 마이그레이션·시드, 서로 주소 맞추기).
**비밀값은 환경변수로만 받고 저장소에는 아무것도 쓰지 않는다** (`.vercel/` 폴더는 `.gitignore`).

```bash
# 필요: Node 22, npx. Vercel 토큰: vercel.com → Account Settings → Tokens
export VERCEL_TOKEN=…                         # 필수
export VERCEL_SCOPE=…                         # 팀이면 팀 slug (개인 계정이면 생략)
export DATABASE_URL='libsql://parkinggack-<조직>.turso.io'   # 1단계 (Turso CLI 로 만든 값)
export DATABASE_AUTH_TOKEN=…
export ADMIN_TOKEN=$(openssl rand -hex 24)     # 없으면 스크립트가 만들고 끝에 한 번 보여 줌
export VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com   # 선택

scripts/deploy-vercel.sh                 # 전부
scripts/deploy-vercel.sh --skip-seed     # DB 는 그대로 두고 코드만 다시 배포
```

프로젝트 이름은 `PG_API_PROJECT`(기본 `parkinggack-api`) · `PG_WEB_PROJECT`(`parkinggack`) · `PG_ADMIN_PROJECT`(`parkinggack-admin`) 로 바꿀 수 있다.
CI(GitHub Actions)에서 쓰려면 위 값들을 저장소 Secrets 에 넣고 같은 스크립트를 부르면 된다.

## 다른 곳에 올릴 때

- **Docker**(Fly.io·Render·Railway·내 서버): `apps/server/Dockerfile` + 영구 볼륨 `/data` — [apps/server/README.md](../apps/server/README.md) "배포".
  Turso 를 쓰려면 같은 이미지에 `DATABASE_URL`·`DATABASE_AUTH_TOKEN` 만 주면 된다
- 서버만 Vercel, 폰 웹은 Netlify 처럼 섞어도 된다 — 서버 `PUBLIC_WEB_BASE` 를 폰 웹 주소로, 폰·대시보드 `VITE_API_BASE` 를 서버 주소로
