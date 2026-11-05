#!/usr/bin/env bash
# 주차각을 Netlify 세 사이트 + Turso(DB) 에 한 번에 배포 — 단계별 설명·UI 로 하는 법은 docs/deploy.md "Netlify"
#
#   parkinggack        폰 앱 (apps/mobile)          https://parkinggack.netlify.app      ← 차 앱 QR·공유 링크가 이 주소
#   parkinggack-api    API 서버 (apps/server)       https://parkinggack-api.netlify.app  ← 차 앱 release 빌드 기본 주소
#   parkinggack-data   대시보드·어드민 (apps/admin)  https://parkinggack-data.netlify.app
#
#   export NETLIFY_AUTH_TOKEN=…        # 필수 (app.netlify.com → User settings → Applications → Personal access tokens)
#   export ADMIN_TOKEN=…               # 필수, 16자 이상 (예: openssl rand -hex 24) — 어드민 로그인에 씀
#   export DATABASE_URL=libsql://…     # 필수 (turso db show parkinggack --url) — --create-turso 면 만들어 줌
#   export DATABASE_AUTH_TOKEN=…       # 필수 (turso db tokens create parkinggack) — --create-turso 면 만들어 줌
#   scripts/deploy-netlify.sh [--dry-run] [--create-turso] [--reseed | --skip-seed] [--only web|api|data]...
#
#   --dry-run       아무것도 바꾸지 않고 할 일(명령·API 호출)만 찍는다. 토큰이 없어도 된다
#   --create-turso  DATABASE_URL 이 없으면 Turso Platform API 로 DB "parkinggack" 과 토큰을 만든다
#                   (TURSO_API_TOKEN · TURSO_ORG 필요, 선택 TURSO_GROUP=default · TURSO_LOCATION=aws-us-east-2)
#   --reseed        시연 데이터를 지우고 다시 넣는다 (실제 기록도 지움). 기본은 DB 가 비어 있을 때만 넣음
#   --skip-seed     마이그레이션만
#   --only <site>   그 사이트만 (여러 번 줄 수 있음). DB 마이그레이션·시드는 api 를 고를 때만
#
# 선택: NETLIFY_ACCOUNT_SLUG(팀 slug — 없으면 토큰의 첫 계정) · VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT
#
# 사이트 이름은 바꾸지 않는다: parkinggack(또는 parkinggack-api) 이름을 이미 다른 계정이 쓰고 있으면 멈춘다
# (차 앱의 QR·공유 링크·서버 주소가 이 이름에 묶여 있어서, 다른 이름으로 몰래 바꾸면 링크가 깨진다).
#
# 안전: 비밀값은 환경변수로만 받는다. 저장소에 아무것도 쓰지 않고(.netlify/ 링크 폴더도 안 만듦 — --site 로 고름),
#       화면에도 찍지 않는다. API 토큰은 명령줄 인자 대신 임시 헤더 파일(600)로 curl 에 넘기고 끝나면 지운다.
set -euo pipefail

usage() { sed -n '2,29p' "$0"; }

DRY_RUN=0
CREATE_TURSO=0
SEED_MODE=ifempty # ifempty · reset · skip
ONLY=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --create-turso) CREATE_TURSO=1 ;;
    --reseed) SEED_MODE=reset ;;
    --skip-seed) SEED_MODE=skip ;;
    --only)
      [[ $# -ge 2 ]] || { echo "--only 다음에 web · api · data 중 하나를 주세요" >&2; exit 2; }
      case "$2" in web | api | data) ONLY+=("$2") ;; *) echo "모르는 사이트: $2 (web · api · data)" >&2; exit 2 ;; esac
      shift
      ;;
    -h | --help) usage; exit 0 ;;
    *) echo "모르는 옵션: $1 (--help)" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETLIFY_CLI_VERSION="27.12.1"
NETLIFY_API="https://api.netlify.com/api/v1"
TURSO_API="https://api.turso.tech/v1"
TURSO_DB_NAME="parkinggack"

WEB_SITE="parkinggack"
API_SITE="parkinggack-api"
DATA_SITE="parkinggack-data"
WEB_URL="https://${WEB_SITE}.netlify.app"
API_URL="https://${API_SITE}.netlify.app"
DATA_URL="https://${DATA_SITE}.netlify.app"

# ───────────── 도우미 ─────────────

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

want() { # want web|api|data → 이번에 그 사이트를 하나
  [[ ${#ONLY[@]} -eq 0 ]] && return 0
  local s
  for s in "${ONLY[@]}"; do [[ "$s" == "$1" ]] && return 0; done
  return 1
}

MISSING=()
need() { # need VAR "어디서 얻는지"
  if [[ -z "${!1:-}" ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      MISSING+=("$1 — $2")
      printf -v "$1" '%s' "<$1>"
      export "${1?}"
    else
      die "$1 이 필요해요 ($2)"
    fi
  fi
}

# 명령 실행 (dry-run 이면 찍기만). run <디렉터리> <명령…>
run() {
  local dir="$1"
  shift
  printf '  $ (cd %s && %s)\n' "${dir#"$ROOT"/}" "$*"
  [[ $DRY_RUN -eq 1 ]] && return 0
  (cd "$dir" && "$@")
}

netlify() { npx --yes "netlify-cli@${NETLIFY_CLI_VERSION}" "$@"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
umask 077

# HTTP 호출. http <헤더 파일> <메서드> <주소> [본문 파일] → 응답 본문은 $TMP/resp, 상태 코드는 stdout
http() {
  local hdr="$1" method="$2" url="$3" body="${4:-}"
  local args=(-sS -o "$TMP/resp" -w '%{http_code}' -X "$method" "$url" -H @"$hdr")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary @"$body")
  curl "${args[@]}" || echo 000
}

# JSON 에서 값 하나: json <파일> 'a.b.0.c'  (배열에서 조건으로 찾기: 'find:name=parkinggack.id')
json() {
  node -e '
    const fs = require("fs")
    let o; try { o = JSON.parse(fs.readFileSync(process.argv[1], "utf8")) } catch { o = null }
    let v = o
    for (const k of process.argv[2].split(".")) {
      if (v == null) break
      if (k.startsWith("find:")) { const [f, x] = k.slice(5).split("="); v = Array.isArray(v) ? v.find((e) => e && String(e[f]) === x) : undefined }
      else v = v[k]
    }
    process.stdout.write(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))
  ' "$1" "$2"
}

# ───────────── 0. 확인 ─────────────

log "확인"
[[ $DRY_RUN -eq 1 ]] && info "dry-run: 아무것도 바꾸지 않고 할 일만 찍어요"
for c in node npm npx curl; do command -v "$c" >/dev/null || die "$c 가 필요해요"; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=12)?0:1)' ||
  die "Node 22.12 이상이 필요해요 (지금 $(node -v)) — apps/admin 빌드 조건"

need NETLIFY_AUTH_TOKEN "app.netlify.com → User settings → Applications → Personal access tokens"
need ADMIN_TOKEN "openssl rand -hex 24 — 16자 이상"
if [[ $DRY_RUN -eq 0 ]]; then
  [[ ${#ADMIN_TOKEN} -ge 16 ]] || die "ADMIN_TOKEN 은 16자 이상으로 해 주세요"
  [[ "$ADMIN_TOKEN" != "dev-admin-token" ]] || die "개발용 ADMIN_TOKEN(dev-admin-token)은 배포에 쓸 수 없어요"
fi
if [[ -n "${VAPID_PUBLIC_KEY:-}${VAPID_PRIVATE_KEY:-}" && ( -z "${VAPID_PUBLIC_KEY:-}" || -z "${VAPID_PRIVATE_KEY:-}" ) ]]; then
  die "VAPID_PUBLIC_KEY 와 VAPID_PRIVATE_KEY 는 같이 정해 주세요 (npx web-push generate-vapid-keys)"
fi
export NETLIFY_AUTH_TOKEN ADMIN_TOKEN
printf 'Authorization: Bearer %s\n' "$NETLIFY_AUTH_TOKEN" >"$TMP/netlify.h"

# ───────────── 1. Turso ─────────────

if want api; then
  log "1. DB (Turso)"
  if [[ -z "${DATABASE_URL:-}" && $CREATE_TURSO -eq 1 ]]; then
    need TURSO_API_TOKEN "turso auth api-tokens mint parkinggack-deploy"
    need TURSO_ORG "turso org list — 보통 계정 이름"
    group="${TURSO_GROUP:-default}"
    location="${TURSO_LOCATION:-aws-us-east-2}"
    info "Turso: 조직 $TURSO_ORG · 그룹 $group($location) · DB $TURSO_DB_NAME 만들기(있으면 그대로) + 토큰"
    if [[ $DRY_RUN -eq 1 ]]; then
      info "[dry-run] GET  $TURSO_API/organizations/$TURSO_ORG/groups/$group → 없으면 POST …/groups {name,location}"
      info "[dry-run] GET  $TURSO_API/organizations/$TURSO_ORG/databases/$TURSO_DB_NAME → 없으면 POST …/databases {name,group}"
      info "[dry-run] POST $TURSO_API/organizations/$TURSO_ORG/databases/$TURSO_DB_NAME/auth/tokens?expiration=never&authorization=full-access"
      export DATABASE_URL="libsql://${TURSO_DB_NAME}-${TURSO_ORG}.turso.io" DATABASE_AUTH_TOKEN="<turso-token>"
    else
      printf 'Authorization: Bearer %s\n' "$TURSO_API_TOKEN" >"$TMP/turso.h"
      st="$(http "$TMP/turso.h" GET "$TURSO_API/organizations/$TURSO_ORG/groups/$group")"
      if [[ "$st" == 404 ]]; then
        GROUP="$group" LOC="$location" node -e 'process.stdout.write(JSON.stringify({ name: process.env.GROUP, location: process.env.LOC }))' >"$TMP/body.json"
        st="$(http "$TMP/turso.h" POST "$TURSO_API/organizations/$TURSO_ORG/groups" "$TMP/body.json")"
        [[ "$st" == 2* ]] || die "Turso 그룹을 만들지 못했어요 ($st): $(cat "$TMP/resp")"
      elif [[ "$st" != 2* ]]; then
        die "Turso API 에 들어가지 못했어요 ($st) — TURSO_API_TOKEN · TURSO_ORG 를 확인해 주세요: $(cat "$TMP/resp")"
      fi
      st="$(http "$TMP/turso.h" GET "$TURSO_API/organizations/$TURSO_ORG/databases/$TURSO_DB_NAME")"
      if [[ "$st" == 404 ]]; then
        GROUP="$group" NAME="$TURSO_DB_NAME" node -e 'process.stdout.write(JSON.stringify({ name: process.env.NAME, group: process.env.GROUP }))' >"$TMP/body.json"
        st="$(http "$TMP/turso.h" POST "$TURSO_API/organizations/$TURSO_ORG/databases" "$TMP/body.json")"
        [[ "$st" == 2* ]] || die "Turso DB 를 만들지 못했어요 ($st): $(cat "$TMP/resp")"
      fi
      host="$(json "$TMP/resp" database.Hostname)"
      [[ -n "$host" ]] || die "Turso DB 주소를 읽지 못했어요: $(cat "$TMP/resp")"
      st="$(http "$TMP/turso.h" POST "$TURSO_API/organizations/$TURSO_ORG/databases/$TURSO_DB_NAME/auth/tokens?expiration=never&authorization=full-access")"
      [[ "$st" == 2* ]] || die "Turso DB 토큰을 만들지 못했어요 ($st)"
      DATABASE_AUTH_TOKEN="$(json "$TMP/resp" jwt)"
      DATABASE_URL="libsql://$host"
      export DATABASE_URL DATABASE_AUTH_TOKEN
      info "DATABASE_URL=$DATABASE_URL (토큰은 화면에 찍지 않고 Netlify 환경변수로만 넣어요)"
    fi
  else
    need DATABASE_URL "turso db show $TURSO_DB_NAME --url · 또는 --create-turso"
    need DATABASE_AUTH_TOKEN "turso db tokens create $TURSO_DB_NAME"
    if [[ $DRY_RUN -eq 0 && ! "$DATABASE_URL" =~ ^(libsql|https):// ]]; then
      die "DATABASE_URL 은 Turso 주소(libsql://…)여야 해요 — Netlify Functions 에는 오래 남는 디스크가 없어요"
    fi
    info "DATABASE_URL=${DATABASE_URL}"
  fi
  export DATABASE_URL DATABASE_AUTH_TOKEN
fi

# ───────────── 2. 사이트 만들기(있으면 그대로) ─────────────

log "2. Netlify 사이트"
ACCOUNT_SLUG="${NETLIFY_ACCOUNT_SLUG:-}"
if [[ $DRY_RUN -eq 1 ]]; then
  info "[dry-run] GET $NETLIFY_API/accounts → 팀 slug ${ACCOUNT_SLUG:-(첫 계정)}"
elif [[ -z "$ACCOUNT_SLUG" ]]; then
  st="$(http "$TMP/netlify.h" GET "$NETLIFY_API/accounts")"
  [[ "$st" == 200 ]] || die "Netlify API 에 들어가지 못했어요 ($st) — NETLIFY_AUTH_TOKEN 을 확인해 주세요"
  ACCOUNT_SLUG="$(json "$TMP/resp" 0.slug)"
  [[ -n "$ACCOUNT_SLUG" ]] || die "Netlify 계정(팀)을 찾지 못했어요"
fi

# ensure_site <이름> → SITE_ID · SITE_ACCOUNT 설정
ensure_site() {
  local name="$1" st
  if [[ $DRY_RUN -eq 1 ]]; then
    info "[dry-run] GET  $NETLIFY_API/sites?name=$name&filter=all → 이 계정에 있으면 그대로"
    info "[dry-run] POST $NETLIFY_API/${ACCOUNT_SLUG:-<team>}/sites {\"name\":\"$name\"} → 422 면 이름을 다른 계정이 쓰는 중 → 멈춤"
    SITE_ID="<site-id:$name>"
    SITE_ACCOUNT="<account-id>"
    return
  fi
  st="$(http "$TMP/netlify.h" GET "$NETLIFY_API/sites?name=$name&filter=all&per_page=100")"
  [[ "$st" == 200 ]] || die "사이트 목록을 읽지 못했어요 ($st)"
  SITE_ID="$(json "$TMP/resp" "find:name=$name.id")"
  if [[ -n "$SITE_ID" ]]; then
    SITE_ACCOUNT="$(json "$TMP/resp" "find:name=$name.account_id")"
    info "$name: 이미 있어요 ($SITE_ID)"
    return
  fi
  NAME="$name" node -e 'process.stdout.write(JSON.stringify({ name: process.env.NAME }))' >"$TMP/body.json"
  st="$(http "$TMP/netlify.h" POST "$NETLIFY_API/$ACCOUNT_SLUG/sites" "$TMP/body.json")"
  if [[ "$st" == 422 ]]; then
    die "사이트 이름 \"$name\" ($name.netlify.app) 을 쓸 수 없어요 — 다른 계정이 이미 쓰는 중이에요.
  차 앱의 QR·공유 링크(${WEB_URL})와 서버 주소(${API_URL})가 이 이름에 묶여 있어서 다른 이름으로 바꾸지 않고 멈춰요.
  그 사이트가 내 다른 팀에 있다면 NETLIFY_ACCOUNT_SLUG 를 그 팀으로 정해 주세요. 응답: $(cat "$TMP/resp")"
  fi
  [[ "$st" == 2* ]] || die "사이트 $name 을 만들지 못했어요 ($st): $(cat "$TMP/resp")"
  SITE_ID="$(json "$TMP/resp" id)"
  SITE_ACCOUNT="$(json "$TMP/resp" account_id)"
  info "$name: 새로 만들었어요 ($SITE_ID)"
}

WEB_ID="" API_ID="" API_ACCOUNT="" DATA_ID=""
if want web; then ensure_site "$WEB_SITE"; WEB_ID="$SITE_ID"; fi
if want api; then ensure_site "$API_SITE"; API_ID="$SITE_ID"; API_ACCOUNT="$SITE_ACCOUNT"; fi
if want data; then ensure_site "$DATA_SITE"; DATA_ID="$SITE_ID"; fi

# ───────────── 3. API 사이트 환경변수 ─────────────

# set_env <KEY> <값이 든 환경변수 이름> — 값은 명령줄에 올리지 않는다
set_env() {
  local key="$1" var="$2" st
  if [[ $DRY_RUN -eq 1 ]]; then
    case "$key" in
      *TOKEN* | *PRIVATE* | DATABASE_URL) info "[dry-run] $key=*** (지우고 다시 만들기: DELETE·POST $NETLIFY_API/accounts/<account>/env?site_id=<api>)" ;;
      *) info "[dry-run] $key=${!var}" ;;
    esac
    return
  fi
  st="$(http "$TMP/netlify.h" DELETE "$NETLIFY_API/accounts/$API_ACCOUNT/env/$key?site_id=$API_ID")"
  [[ "$st" == 2* || "$st" == 404 ]] || die "환경변수 $key 를 지우지 못했어요 ($st)"
  KEY="$key" VAR="$var" node -e '
    const v = process.env[process.env.VAR] ?? ""
    // scopes 를 적지 않으면 전체(builds·functions·runtime·post-processing). 무료 요금제는 scopes 지정이 403
    process.stdout.write(JSON.stringify([{ key: process.env.KEY, values: [{ value: v, context: "all" }] }]))
  ' >"$TMP/body.json"
  st="$(http "$TMP/netlify.h" POST "$NETLIFY_API/accounts/$API_ACCOUNT/env?site_id=$API_ID" "$TMP/body.json")"
  rm -f "$TMP/body.json"
  [[ "$st" == 2* ]] || die "환경변수 $key 를 넣지 못했어요 ($st): $(cat "$TMP/resp")"
  info "$key ✓"
}

if want api; then
  log "3. $API_SITE 환경변수"
  export PG_ADMIN_ORIGINS="$DATA_URL" PG_PUBLIC_WEB_BASE="$WEB_URL"
  set_env DATABASE_URL DATABASE_URL
  set_env DATABASE_AUTH_TOKEN DATABASE_AUTH_TOKEN
  set_env ADMIN_TOKEN ADMIN_TOKEN
  set_env ADMIN_ORIGINS PG_ADMIN_ORIGINS
  set_env PUBLIC_WEB_BASE PG_PUBLIC_WEB_BASE
  if [[ -n "${VAPID_PUBLIC_KEY:-}" ]]; then
    export VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:parkinggack@example.com}"
    set_env VAPID_PUBLIC_KEY VAPID_PUBLIC_KEY
    set_env VAPID_PRIVATE_KEY VAPID_PRIVATE_KEY
    set_env VAPID_SUBJECT VAPID_SUBJECT
  else
    info "VAPID_* 없음 → 웹 푸시 꺼짐 (GET /v1/push/key 404, 폰은 알림 버튼을 숨김)"
  fi
fi

# ───────────── 4. DB 마이그레이션 · 시드 (노트북에서, 함수 안에서는 시드하지 않음) ─────────────

if want api; then
  log "4. DB 마이그레이션 · 시드"
  run "$ROOT/apps/server" npm ci --no-audit --no-fund
  run "$ROOT/apps/server" npm run migrate
  case "$SEED_MODE" in
    ifempty) run "$ROOT/apps/server" npm run seed ;;
    reset) run "$ROOT/apps/server" npm run seed -- --reset ;;
    skip) info "시드 건너뜀 (--skip-seed)" ;;
  esac
fi

# ───────────── 5. 빌드 (모노레포: apps/* 가 ../../packages/* 를 상대 경로로 읽으므로 저장소 통째로 있는 곳에서) ─────────────

log "5. 빌드"
if want web; then
  run "$ROOT/apps/mobile" npm ci --no-audit --no-fund
  run "$ROOT/apps/mobile" env VITE_API_BASE="$API_URL" npm run build
  # public/_redirects (히스토리 라우팅: /pair/…, /s/…, /p/…) 가 dist 로 복사됐는지
  if [[ $DRY_RUN -eq 0 && ! -f "$ROOT/apps/mobile/dist/_redirects" ]]; then
    die "apps/mobile/dist/_redirects 가 없어요 — /pair/<코드> 같은 주소가 404 가 돼요"
  fi
fi
if want data; then
  run "$ROOT/apps/admin" npm ci --no-audit --no-fund
  run "$ROOT/apps/admin" env VITE_API_BASE="$API_URL" npm run build
  # 한 페이지 앱: 없는 경로는 index.html (빌드 결과에만 씀, 저장소는 그대로)
  info "apps/admin/dist/_redirects ← '/*  /index.html  200'"
  if [[ $DRY_RUN -eq 0 && ! -f "$ROOT/apps/admin/dist/_redirects" ]]; then
    printf '/*  /index.html  200\n' >"$ROOT/apps/admin/dist/_redirects"
  fi
fi
if want api; then
  info "API 함수는 netlify deploy 가 esbuild 로 묶어요 (apps/server/netlify.toml [functions])"
fi

# ───────────── 6. 배포 (--prod, 빌드는 위에서 했으니 --no-build) ─────────────

log "6. 배포"
MSG="deploy-netlify.sh $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
if want api; then
  run "$ROOT/apps/server" netlify deploy --prod --no-build --dir public --functions netlify/functions --site "$API_ID" --message "$MSG"
fi
if want web; then
  run "$ROOT/apps/mobile" netlify deploy --prod --no-build --dir dist --site "$WEB_ID" --message "$MSG"
fi
if want data; then
  run "$ROOT/apps/admin" netlify deploy --prod --no-build --dir dist --site "$DATA_ID" --message "$MSG"
fi

# ───────────── 7. 확인 (curl) ─────────────

log "7. 확인"
# check <설명> <주소> <응답에 있어야 할 글자> [curl 추가 인자…]
check() {
  local what="$1" url="$2" expect="$3"
  shift 3
  if [[ $DRY_RUN -eq 1 ]]; then
    info "[dry-run] curl $* $url → \"$expect\" 가 있어야 함"
    return 0
  fi
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -m 20 "$@" "$url" -o "$TMP/check" -D "$TMP/check.h" 2>/dev/null && grep -qi -- "$expect" "$TMP/check" "$TMP/check.h"; then
      info "$what ✓"
      return 0
    fi
    sleep "$i"
  done
  die "$what 확인 실패: $url (\"$expect\" 를 못 찾았어요)"
}
if want api; then
  check "API /health" "$API_URL/health" '"ok":true'
  check "API 대시보드 통계" "$API_URL/v1/insights/overview?region=pangyo" '"totals"'
  check "API 어드민 CORS ($DATA_SITE)" "$API_URL/v1/admin/overview" "access-control-allow-origin: $DATA_URL" \
    -X OPTIONS -H "Origin: $DATA_URL" -H 'Access-Control-Request-Method: GET'
fi
if want web; then
  check "폰 앱 첫 화면" "$WEB_URL/" '<div id="app">'
  check "폰 앱 연결 주소 (/pair/…)" "$WEB_URL/pair/000000" '<div id="app">'
fi
if want data; then
  check "대시보드 첫 화면" "$DATA_URL/" '<div id="root">'
fi

log "끝"
want web && info "폰 앱      $WEB_URL"
want api && info "API        $API_URL   (예약 함수 maintain: 매일 03:17 KST)"
want data && info "대시보드   $DATA_URL   (로그인: ADMIN_TOKEN)"
if [[ $DRY_RUN -eq 1 && ${#MISSING[@]} -gt 0 ]]; then
  printf '\n  실제로 돌리려면 이 값들이 더 필요해요:\n'
  printf '   - %s\n' "${MISSING[@]}"
fi
