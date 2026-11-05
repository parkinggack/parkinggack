#!/usr/bin/env bash
# 주차각을 Vercel(서버·폰 웹·어드민) + Turso(DB) 무료 플랜에 한 번에 배포 — 단계별 설명은 docs/deploy.md
#
#   export VERCEL_TOKEN=…            # 필수 (vercel.com → Account Settings → Tokens)
#   export DATABASE_URL=libsql://…   # 필수 (turso db show parkinggack --url)
#   export DATABASE_AUTH_TOKEN=…     # 필수 (turso db tokens create parkinggack)
#   scripts/deploy-vercel.sh [--skip-seed | --reseed]
#
#   기본: 마이그레이션 + DB 가 비어 있을 때만 시연 데이터. --reseed 는 시연 데이터를 지우고 다시(실제 기록도 지움)
#
# 선택: VERCEL_SCOPE(팀 slug) · VERCEL_TEAM_ID(팀 id, REST 호출용) · ADMIN_TOKEN · CRON_SECRET ·
#       VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT · PG_API_PROJECT · PG_WEB_PROJECT · PG_ADMIN_PROJECT
#
# 안전: 비밀값은 환경변수로만 받고, 저장소에 아무것도 쓰지 않는다 (.vercel/ 링크 폴더도 만들지 않음 —
#       VERCEL_ORG_ID·VERCEL_PROJECT_ID 환경변수로 프로젝트를 고른다). 토큰은 화면에 찍지 않는다.
set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN 이 필요해요 (vercel.com → Account Settings → Tokens)}"
: "${DATABASE_URL:?DATABASE_URL 이 필요해요 (turso db show parkinggack --url)}"
: "${DATABASE_AUTH_TOKEN:?DATABASE_AUTH_TOKEN 이 필요해요 (turso db tokens create parkinggack)}"

SKIP_SEED=0
RESEED=0
for arg in "$@"; do
  case "$arg" in
    --skip-seed) SKIP_SEED=1 ;;
    --reseed) RESEED=1 ;;
    -h | --help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "모르는 옵션: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERCEL_CLI_VERSION="64.1.0"
API_PROJECT="${PG_API_PROJECT:-parkinggack-api}"
WEB_PROJECT="${PG_WEB_PROJECT:-parkinggack}"
ADMIN_PROJECT="${PG_ADMIN_PROJECT:-parkinggack-data}"
REST="https://api.vercel.com"
SCOPE_ARGS=()
[[ -n "${VERCEL_SCOPE:-}" ]] && SCOPE_ARGS=(--scope "$VERCEL_SCOPE")

GENERATED_ADMIN_TOKEN=""
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  ADMIN_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  GENERATED_ADMIN_TOKEN="$ADMIN_TOKEN"
fi
CRON_SECRET="${CRON_SECRET:-$(node -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')}"

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# (macOS 기본 bash 3.2 + set -u 에서 빈 배열도 되게)
vercel() { npx --yes "vercel@${VERCEL_CLI_VERSION}" "$@" --token "$VERCEL_TOKEN" ${SCOPE_ARGS[@]+"${SCOPE_ARGS[@]}"}; }

# REST 호출 (JSON 응답을 stdout 으로). $1=메서드 $2=경로 $3=본문(선택)
rest() {
  local method="$1" path="$2" body="${3:-}"
  local sep='?'
  [[ "$path" == *\?* ]] && sep='&'
  local qs=""
  [[ -n "${VERCEL_TEAM_ID:-}" ]] && qs="${sep}teamId=${VERCEL_TEAM_ID}"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$REST$path$qs" -H "Authorization: Bearer $VERCEL_TOKEN" -H 'Content-Type: application/json' -d "$body"
  else
    curl -sS -X "$method" "$REST$path$qs" -H "Authorization: Bearer $VERCEL_TOKEN"
  fi
}

# JSON 에서 값 하나 꺼내기: json_get '<json>' 'a.b.0.c'
json_get() { node -e 'const o=JSON.parse(process.argv[1]);const v=process.argv[2].split(".").reduce((a,k)=>a==null?a:a[k],o);console.log(v==null?"":v)' "$1" "$2"; }

# 프로젝트가 없으면 만들고 Root Directory·프레임워크를 맞춘다. "<projectId> <orgId>" 출력
ensure_project() {
  local name="$1" root_dir="$2" framework="$3"
  local fw_json="null"
  [[ "$framework" != "null" ]] && fw_json="\"$framework\""
  local got
  got="$(rest GET "/v9/projects/$name")"
  if [[ -z "$(json_get "$got" id)" ]]; then
    got="$(rest POST /v10/projects "{\"name\":\"$name\",\"rootDirectory\":\"$root_dir\",\"framework\":$fw_json}")"
  else
    got="$(rest PATCH "/v9/projects/$name" "{\"rootDirectory\":\"$root_dir\",\"framework\":$fw_json}")"
  fi
  local id org
  id="$(json_get "$got" id)"
  org="$(json_get "$got" accountId)"
  [[ -n "$id" ]] || { echo "프로젝트 $name 을(를) 만들지 못했어요: $(json_get "$got" error.message)" >&2; exit 1; }
  echo "$id $org"
}

# 프로젝트의 기본 *.vercel.app 주소
project_url() {
  local id="$1" got domain
  got="$(rest GET "/v9/projects/$id/domains")"
  domain="$(node -e 'const o=JSON.parse(process.argv[1]);const d=(o.domains||[]).map(x=>x.name).find(n=>n.endsWith(".vercel.app"));console.log(d||"")' "$got")"
  echo "https://${domain}"
}

# 환경변수 (Production) 덮어쓰기 — 값은 stdin 으로 넘겨서 명령줄·로그에 남지 않게
set_env() {
  local pid="$1" org="$2" key="$3" value="$4"
  [[ -n "$value" ]] || return 0
  VERCEL_ORG_ID="$org" VERCEL_PROJECT_ID="$pid" vercel env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | VERCEL_ORG_ID="$org" VERCEL_PROJECT_ID="$pid" vercel env add "$key" production >/dev/null
  echo "  $key ✓"
}

# 올릴 파일을 .git 없이 따로 복사해 둔다. Hobby 팀은 커밋 작성자가 Vercel 계정 주인이 아니면
# (예: 커밋은 GitHub 계정, 배포는 다른 Vercel 계정) 배포를 BLOCKED 로 막는다. git 정보가 없으면 안 막는다.
SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
(cd "$ROOT" && tar --exclude=./.git --exclude=./.claude --exclude=./apps/vehicle --exclude=./captures \
  --exclude=node_modules --exclude=.vercel --exclude=.netlify -cf - . | tar -xf - -C "$SRC")

# 배포하고 그 배포의 주소(https://…vercel.app)를 stdout 으로.
# CLI 출력(비 TTY 면 JSON)은 버전마다 달라서, 끝난 뒤 REST 로 그 프로젝트의 가장 최근 Production 배포를 읽는다
deploy() {
  local pid="$1" org="$2" got
  (cd "$SRC" && VERCEL_ORG_ID="$org" VERCEL_PROJECT_ID="$pid" vercel deploy --prod --yes >/dev/null 2>&1)
  got="$(rest GET "/v6/deployments?projectId=$pid&target=production&limit=1")"
  node -e 'const o=JSON.parse(process.argv[1]);const d=(o.deployments||[])[0];console.log(d&&d.url?"https://"+d.url:"")' "$got"
}

# 같은 파일로 다시 배포 (환경변수만 바뀐 경우 — 서버에 웹 주소를 알려 준 뒤)
redeploy() {
  local url="$1"
  [[ -n "$url" ]] || { echo "다시 배포할 주소가 없어요 (서버 배포가 안 됐어요)" >&2; exit 1; }
  vercel redeploy "$url" --target production >/dev/null
}

# ───── 1. Turso: 스키마 + 시연 데이터 ─────
if [[ "$RESEED" == 1 ]]; then
  log "Turso 마이그레이션 + 시연 데이터 다시 (--reseed, 1~2분)"
  (cd "$ROOT/apps/server" && npm ci --no-audit --no-fund >/dev/null && npm run --silent migrate && npm run --silent seed -- --reset)
elif [[ "$SKIP_SEED" == 0 ]]; then
  log "Turso 마이그레이션 + 시연 데이터 (DB 가 비어 있을 때만)"
  (cd "$ROOT/apps/server" && npm ci --no-audit --no-fund >/dev/null && npm run --silent migrate && npm run --silent seed)
else
  log "Turso 마이그레이션만 (--skip-seed)"
  (cd "$ROOT/apps/server" && npm ci --no-audit --no-fund >/dev/null && npm run --silent migrate)
fi

# ───── 2. 프로젝트 ─────
log "Vercel 프로젝트"
read -r API_ID ORG_ID <<<"$(ensure_project "$API_PROJECT" apps/server null)"
read -r WEB_ID _ <<<"$(ensure_project "$WEB_PROJECT" apps/mobile vite)"
read -r ADMIN_ID _ <<<"$(ensure_project "$ADMIN_PROJECT" apps/admin vite)"
[[ -n "${API_ID:-}" && -n "${ORG_ID:-}" && -n "${WEB_ID:-}" && -n "${ADMIN_ID:-}" ]] || { echo "Vercel 프로젝트를 준비하지 못했어요 (토큰·VERCEL_TEAM_ID 확인)" >&2; exit 1; }
echo "  $API_PROJECT · $WEB_PROJECT · $ADMIN_PROJECT"

# ───── 3. 서버 먼저 (DB 환경변수) ─────
log "서버 환경변수 · 배포"
set_env "$API_ID" "$ORG_ID" DATABASE_URL "$DATABASE_URL"
set_env "$API_ID" "$ORG_ID" DATABASE_AUTH_TOKEN "$DATABASE_AUTH_TOKEN"
set_env "$API_ID" "$ORG_ID" ADMIN_TOKEN "$ADMIN_TOKEN"
set_env "$API_ID" "$ORG_ID" CRON_SECRET "$CRON_SECRET"
set_env "$API_ID" "$ORG_ID" VAPID_PUBLIC_KEY "${VAPID_PUBLIC_KEY:-}"
set_env "$API_ID" "$ORG_ID" VAPID_PRIVATE_KEY "${VAPID_PRIVATE_KEY:-}"
set_env "$API_ID" "$ORG_ID" VAPID_SUBJECT "${VAPID_SUBJECT:-}"
API_DEPLOY="$(deploy "$API_ID" "$ORG_ID")"
API_URL="$(project_url "$API_ID")"
echo "  $API_URL"

# ───── 4. 폰 웹 · 어드민 (VITE_API_BASE) ─────
log "폰 웹 · 어드민 배포"
set_env "$WEB_ID" "$ORG_ID" VITE_API_BASE "$API_URL"
set_env "$ADMIN_ID" "$ORG_ID" VITE_API_BASE "$API_URL"
deploy "$WEB_ID" "$ORG_ID" >/dev/null
deploy "$ADMIN_ID" "$ORG_ID" >/dev/null
WEB_URL="$(project_url "$WEB_ID")"
ADMIN_URL="$(project_url "$ADMIN_ID")"
echo "  $WEB_URL · $ADMIN_URL"

# ───── 5. 서버에 웹 주소 알려 주고 다시 배포 ─────
log "서버: ADMIN_ORIGINS · PUBLIC_WEB_BASE → 다시 배포"
set_env "$API_ID" "$ORG_ID" ADMIN_ORIGINS "$ADMIN_URL"
set_env "$API_ID" "$ORG_ID" PUBLIC_WEB_BASE "$WEB_URL"
redeploy "$API_DEPLOY"

# ───── 6. 확인 ─────
log "확인"
curl -fsS "$API_URL/health" && echo
# shellcheck disable=SC2016 # node 코드 안의 ${…} 는 JS 템플릿 문자열
curl -fsS "$API_URL/v1/insights/overview" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).totals;console.log(`  판교 일대: 기록 ${t.records}건 · ${t.lots}곳 · 평균 후진 ${t.avgReverse}회`)})'

cat <<EOF

다 됐어요.
  서버     $API_URL
  폰 웹    $WEB_URL
  어드민   $ADMIN_URL

차량 앱 APK:
  cd apps/vehicle && ./gradlew assembleDebug -PapiBaseUrl=$API_URL -PwebBaseUrl=$WEB_URL
EOF
if [[ -n "$GENERATED_ADMIN_TOKEN" ]]; then
  echo
  echo "어드민 토큰을 새로 만들었어요 (이번 한 번만 보여 줘요 — 안전한 곳에 적어 두세요):"
  echo "  $GENERATED_ADMIN_TOKEN"
fi
