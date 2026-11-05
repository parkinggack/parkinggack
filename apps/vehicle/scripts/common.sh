# shellcheck shell=bash
# shellcheck disable=SC2034  # constants and PG_* globals are used by the scripts that source this file
# Shared helpers for apps/vehicle/scripts/*.sh (macOS + Linux, bash 3.2+).
# Sourced by the other scripts, not run directly. Windows: see common.ps1.

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PG_PKG="com.parkinggack.app"
PG_ACTIVITY="$PG_PKG/.ui.MainActivity"
PG_AVD_PLEOS="Pleos_Connect"
PG_AVD_FALLBACK="AAOS_Google_34"
PG_LOG_TAGS="MainActivity AppController CarSignals VehicleGateway NaviGateway"
# Pleos image: home screen app and the navigation app it starts (both take the foreground shortly after boot)
PG_PLEOS_HOME_PKG="ai.umos.homescreen"
PG_PLEOS_NAV_PKG="ai.umos.maps.android.navigation.app"
PG_DEFAULT_TIMEZONE="Asia/Seoul"

PG_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_VEHICLE_DIR="$(cd "$PG_SCRIPTS_DIR/.." && pwd)"
PG_REPO_DIR="$(cd "$PG_VEHICLE_DIR/../.." && pwd)"
PG_APK="$PG_VEHICLE_DIR/app/build/outputs/apk/debug/app-debug.apk"
PG_OUT_DIR="$PG_VEHICLE_DIR/build/emulator"

# Pleos Connect emulator v2.1.0 — values from the update-site XMLs (checked 2026-11-03):
#   API 34, tag android-automotive, vendor pleos, revision 2, needs emulator >= 24
#   x86_64 : crp_car_emulator.zip        4,087,751,964 bytes
#   arm64  : crp_car_arm64_emulator.zip  4,669,762,816 bytes
PLEOS_SITE_X86="https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml"
PLEOS_SITE_ARM="https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-arm64-sys-img.xml"
PLEOS_PKG_PREFIX="system-images;android-34;pleos_car_emulator"
# Fallback: Google's Android Automotive image (normal SDK repo). x86_64 ~1.37 GB, arm64 ~1.34 GB, needs emulator >= 35
GOOGLE_AAOS_PKG_PREFIX="system-images;android-34-ext9;android-automotive"
# Android SDK Command-line Tools 23.0 (from dl.google.com repository2-3.xml)
PG_CMDLINE_TOOLS_BUILD="16111833"

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  PG_C_B=$'\033[1m'; PG_C_DIM=$'\033[2m'; PG_C_0=$'\033[0m'
else
  PG_C_B=""; PG_C_DIM=""; PG_C_0=""
fi
# Run a command, or only print it when PG_DRY_RUN=1 (--dry-run).
run() {
  if [ "${PG_DRY_RUN:-0}" = 1 ]; then printf '    [dry-run]'; printf ' %q' "$@"; printf '\n'; return 0; fi
  "$@"
}
step() { printf '\n%s==> %s%s\n' "$PG_C_B" "$*" "$PG_C_0"; }
info() { printf '    %s\n' "$*"; }
note() { printf '    %s%s%s\n' "$PG_C_DIM" "$*" "$PG_C_0"; }
warn() { printf '%sWARNING:%s %s\n' "$PG_C_B" "$PG_C_0" "$*" >&2; }
die()  { printf '%sERROR:%s %s\n' "$PG_C_B" "$PG_C_0" "$*" >&2; exit 1; }

# Ask a yes/no question. $1 = prompt, $2 = default (y|n). Non-interactive stdin -> default.
confirm() {
  local prompt="$1" def="${2:-y}" ans hint="[Y/n]"
  [ "$def" = "n" ] && hint="[y/N]"
  if [ ! -t 0 ]; then [ "$def" = "y" ]; return; fi
  read -r -p "    $prompt $hint " ans || ans=""
  [ -z "$ans" ] && ans="$def"
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------------------
# Host
# ---------------------------------------------------------------------------
pg_host_os() {
  case "$(uname -s)" in
    Darwin) echo mac ;;
    Linux) echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}

# System-image ABI for this machine. On Apple Silicon this is arm64-v8a even when the shell runs under Rosetta.
pg_host_abi() {
  if [ "$(pg_host_os)" = mac ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
    echo arm64-v8a; return
  fi
  case "$(uname -m)" in
    arm64|aarch64) echo arm64-v8a ;;
    x86_64|amd64) echo x86_64 ;;
    *) echo "unsupported-$(uname -m)" ;;
  esac
}

# ---------------------------------------------------------------------------
# Android SDK
# ---------------------------------------------------------------------------
# sdk.dir from apps/vehicle/local.properties (Java properties escaping: "\:" -> ":", "\\" -> "\")
pg_local_props_sdk() {
  local f="$PG_VEHICLE_DIR/local.properties"
  [ -f "$f" ] || return 0
  sed -n 's/^[[:space:]]*sdk\.dir[[:space:]]*[=:][[:space:]]*//p' "$f" | tail -1 | sed -e 's/\\:/:/g' -e 's/\\\\/\\/g'
}

pg_default_sdk_dir() {
  case "$(pg_host_os)" in
    mac) echo "$HOME/Library/Android/sdk" ;;
    *) echo "$HOME/Android/Sdk" ;;
  esac
}

pg_is_sdk_dir() {
  [ -n "${1:-}" ] && [ -d "$1" ] || return 1
  [ -d "$1/platform-tools" ] || [ -d "$1/cmdline-tools" ] || [ -d "$1/platforms" ] || [ -d "$1/emulator" ] || [ -d "$1/licenses" ]
}

# Sets PG_SDK (and exports ANDROID_HOME / ANDROID_SDK_ROOT). $1 = explicit dir (optional).
# Order: --sdk, $ANDROID_HOME, $ANDROID_SDK_ROOT, local.properties sdk.dir, Android Studio default location.
pg_find_sdk() {
  local explicit="${1:-}" c
  PG_SDK=""
  if [ -n "$explicit" ]; then
    PG_SDK="$explicit"
  else
    for c in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$(pg_local_props_sdk)" "$(pg_default_sdk_dir)"; do
      if pg_is_sdk_dir "$c"; then PG_SDK="$c"; break; fi
    done
  fi
  if [ -z "$PG_SDK" ]; then
    return 1
  fi
  PG_SDK="$(cd "$PG_SDK" 2>/dev/null && pwd || echo "$PG_SDK")"
  export ANDROID_HOME="$PG_SDK" ANDROID_SDK_ROOT="$PG_SDK"
  PG_ADB="$PG_SDK/platform-tools/adb"
  PG_EMULATOR="$PG_SDK/emulator/emulator"
  return 0
}

pg_require_sdk() {
  pg_find_sdk "${1:-}" || die "Android SDK not found. Install Android Studio (it creates $(pg_default_sdk_dir)),
       or set ANDROID_HOME, or run: apps/vehicle/scripts/setup-emulator.sh --sdk <dir>"
  [ -x "$PG_ADB" ] || die "adb not found at $PG_ADB — run apps/vehicle/scripts/setup-emulator.sh first."
}

# Path of sdkmanager (cmdline-tools/latest preferred), empty if missing.
pg_sdkmanager_path() {
  local c best=""
  if [ -x "$PG_SDK/cmdline-tools/latest/bin/sdkmanager" ]; then echo "$PG_SDK/cmdline-tools/latest/bin/sdkmanager"; return; fi
  for c in "$PG_SDK"/cmdline-tools/*/bin/sdkmanager; do [ -x "$c" ] && best="$c"; done
  echo "$best"
}

pg_avdmanager_path() {
  local s; s="$(pg_sdkmanager_path)"
  if [ -n "$s" ]; then echo "$(dirname "$s")/avdmanager"; fi
}

# ---------------------------------------------------------------------------
# Java (sdkmanager / avdmanager / Gradle need JDK 17+)
# ---------------------------------------------------------------------------
pg_java_major() {
  local v
  v="$("$1" -version 2>&1 | sed -n 's/.*version "\([^"]*\)".*/\1/p' | head -1)"
  case "$v" in
    1.*) v="${v#1.}"; echo "${v%%.*}" ;;
    "") echo 0 ;;
    *) v="${v%%[.+-]*}"; echo "${v:-0}" ;;
  esac
}

# Exports JAVA_HOME pointing at a JDK >= 17 (JAVA_HOME, macOS java_home, PATH, Android Studio's bundled JBR).
pg_find_java() {
  local c cands=()
  [ -n "${JAVA_HOME:-}" ] && cands+=("$JAVA_HOME")
  if [ "$(pg_host_os)" = mac ]; then
    c="$(/usr/libexec/java_home -v 17+ 2>/dev/null || true)"; [ -n "$c" ] && cands+=("$c")
    cands+=("/Applications/Android Studio.app/Contents/jbr/Contents/Home"
            "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"
            "/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home")
  else
    cands+=("$HOME/android-studio/jbr" "/opt/android-studio/jbr" "/usr/local/android-studio/jbr"
            "/snap/android-studio/current/jbr" "$HOME/.local/share/JetBrains/Toolbox/apps/android-studio/jbr")
  fi
  for c in "${cands[@]}"; do
    if [ -x "$c/bin/java" ] && [ "$(pg_java_major "$c/bin/java")" -ge 17 ]; then
      export JAVA_HOME="$c"; export PATH="$JAVA_HOME/bin:$PATH"; return 0
    fi
  done
  c="$(command -v java 2>/dev/null || true)"
  if [ -n "$c" ] && [ "$(pg_java_major "$c")" -ge 17 ]; then
    # Resolve JAVA_HOME from the java on PATH (follows symlinks such as /usr/bin/java)
    c="$("$c" -XshowSettings:properties -version 2>&1 | sed -n 's/^[[:space:]]*java\.home = //p' | head -1)"
    [ -n "$c" ] && export JAVA_HOME="$c"
    return 0
  fi
  return 1
}

pg_require_java() {
  pg_find_java || die "JDK 17+ not found. Install Android Studio (bundles a JDK) or a JDK 17/21, or set JAVA_HOME."
}

# ---------------------------------------------------------------------------
# Android user dir / AVDs
# ---------------------------------------------------------------------------
pg_android_user_home() {
  if [ -n "${ANDROID_USER_HOME:-}" ]; then echo "$ANDROID_USER_HOME"
  elif [ -n "${ANDROID_PREFS_ROOT:-}" ]; then echo "$ANDROID_PREFS_ROOT/.android"
  elif [ -n "${ANDROID_SDK_HOME:-}" ]; then echo "$ANDROID_SDK_HOME/.android"
  else echo "$HOME/.android"; fi
}

pg_avd_home() { echo "${ANDROID_AVD_HOME:-$(pg_android_user_home)/avd}"; }

pg_avd_exists() { [ -f "$(pg_avd_home)/$1.ini" ] && [ -d "$(pg_avd_home)/$1.avd" ]; }

# AVD to use: explicit > fallback flag > Pleos_Connect if created > AAOS_Google_34 if created > Pleos_Connect
pg_pick_avd() {
  local explicit="${1:-}" fallback="${2:-0}"
  if [ -n "$explicit" ]; then echo "$explicit"
  elif [ "$fallback" = 1 ]; then echo "$PG_AVD_FALLBACK"
  elif pg_avd_exists "$PG_AVD_PLEOS"; then echo "$PG_AVD_PLEOS"
  elif pg_avd_exists "$PG_AVD_FALLBACK"; then echo "$PG_AVD_FALLBACK"
  else echo "$PG_AVD_PLEOS"; fi
}

# Set KEY=VALUE in an ini file (replace or append). Portable (no sed -i).
pg_set_ini() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/pg-ini.XXXXXX")"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    { line = $0; sub(/\r$/, "", line); split(line, kv, "="); key = kv[1]; gsub(/[ \t]+$/, "", key)
      if (key == k) { if (!done) { print k "=" v; done = 1 }; next }
      print line }
    END { if (!done) print k "=" v }' "$file" > "$tmp" && mv "$tmp" "$file"
}

pg_get_ini() {
  [ -f "$1" ] || return 0
  sed -n "s/^$2[[:space:]]*=[[:space:]]*//p" "$1" | tr -d '\r' | tail -1
}

# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------
pg_online_serials() { "$PG_ADB" devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { print $1 }'; }

pg_emulator_avd_name() { "$PG_ADB" -s "$1" emu avd name 2>/dev/null | head -1 | tr -d '\r'; }

pg_is_automotive() {
  [ "$("$PG_ADB" -s "$1" shell pm has-feature android.hardware.type.automotive 2>/dev/null | tr -d '\r')" = "true" ]
}

# Sets PG_SERIAL. $1 = explicit serial (or $ANDROID_SERIAL), $2 = preferred AVD name.
# Picks: the explicit serial > the emulator running that AVD > the only online Automotive device (never a phone).
# Returns 0 = selected, 1 = nothing suitable online, 2 = several candidates (pass --serial).
pg_select_device() {
  local explicit="${1:-${ANDROID_SERIAL:-}}" avd="${2:-}" serials s autos="" count=0
  PG_SERIAL=""
  serials="$(pg_online_serials)"
  if [ -n "$explicit" ]; then
    printf '%s\n' "$serials" | grep -qx -- "$explicit" || return 1
    PG_SERIAL="$explicit"; return 0
  fi
  for s in $serials; do
    case "$s" in emulator-*)
      if [ -n "$avd" ] && [ "$(pg_emulator_avd_name "$s")" = "$avd" ]; then PG_SERIAL="$s"; return 0; fi ;;
    esac
    if pg_is_automotive "$s"; then autos="$autos $s"; count=$((count + 1)); fi
  done
  if [ "$count" = 1 ]; then PG_SERIAL="${autos# }"; return 0; fi
  if [ "$count" -gt 1 ]; then warn "Several Automotive devices are online:$autos. Pass --serial <id>."; return 2; fi
  return 1
}

pg_require_device() {
  local rc=0
  pg_select_device "${1:-}" "${2:-}" || rc=$?
  [ "$rc" = 0 ] && return 0
  [ "$rc" = 2 ] && exit 1
  die "No Automotive emulator online. Start one with apps/vehicle/scripts/run-app.sh (or pass --serial <id>)."
}

adbs() { "$PG_ADB" -s "$PG_SERIAL" "$@"; }

# Wait until the device reports sys.boot_completed=1 and the package manager answers.
# $1 = timeout seconds, $2 = emulator PID to watch (optional). Returns 1 on timeout, 2 if the emulator exited.
pg_wait_boot() {
  local timeout="${1:-600}" pid="${2:-}" start now boot pm
  start="$(date +%s)"
  while :; do
    now="$(date +%s)"
    [ $((now - start)) -gt "$timeout" ] && return 1
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then return 2; fi
    if [ "$("$PG_ADB" -s "$PG_SERIAL" get-state 2>/dev/null)" = "device" ]; then
      boot="$("$PG_ADB" -s "$PG_SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
      if [ "$boot" = "1" ]; then
        pm="$("$PG_ADB" -s "$PG_SERIAL" shell pm path android 2>/dev/null | tr -d '\r')"
        case "$pm" in package:*) return 0 ;; esac
      fi
    fi
    printf '.'
    sleep 3
  done
}

pg_app_installed() {
  local out; out="$(adbs shell pm path "$PG_PKG" 2>/dev/null | tr -d '\r')"
  case "$out" in package:*) return 0 ;; *) return 1 ;; esac
}

pg_pkg_installed() {
  local out; out="$(adbs shell pm path "$1" 2>/dev/null | tr -d '\r' || true)"
  case "$out" in package:*) return 0 ;; *) return 1 ;; esac
}

pg_pkg_running() { [ -n "$(adbs shell pidof "$1" 2>/dev/null | tr -d '\r' || true)" ]; }

# The device's top resumed activity as dumpsys prints it, e.g.
# "ActivityRecord{1c4b5e2 u0 com.parkinggack.app/.ui.MainActivity t12}"; "null" while nothing is resumed,
# empty when dumpsys has no such line.
pg_top_resumed_activity() {
  adbs shell dumpsys activity activities 2>/dev/null | tr -d '\r' \
    | sed -n 's/^[[:space:]]*topResumedActivity=//p' | head -1 || true
}

# Home screen package: the Pleos launcher if the image has it, else whatever resolves the HOME intent
# (com.android.car.carlauncher on Google's Automotive image). Empty if unknown.
pg_home_pkg() {
  local pkg
  if pg_pkg_installed "$PG_PLEOS_HOME_PKG"; then echo "$PG_PLEOS_HOME_PKG"; return 0; fi
  pkg="$(adbs shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null \
    | tr -d '\r' | sed -n 's#^\([A-Za-z0-9_.]*\)/.*#\1#p' | tail -1 || true)"
  case "$pkg" in android) pkg="" ;; esac   # ResolverActivity (no default home) tells us nothing
  echo "$pkg"
}

# $1 = top resumed activity, $2 = home package (may be empty). True once the launcher has taken over:
# a Pleos home/navigation activity is resumed, or the home app runs and a real activity (not FallbackHome) is resumed.
pg_launcher_ready() {
  case "$1" in
    ""|null|*FallbackHome*) return 1 ;;
    *" $PG_PLEOS_HOME_PKG/"*|*" $PG_PLEOS_NAV_PKG/"*) return 0 ;;
  esac
  [ -n "$2" ] || return 0
  case "$1" in *" $2/"*) return 0 ;; esac
  pg_pkg_running "$2"
}

# Fresh boot only: the Pleos launcher (ai.umos.homescreen) and its navigation app come up a few seconds after
# sys.boot_completed=1 and take the foreground, so an app launched right after boot ends up in the background.
# Waits until the launcher is up, then $2 more seconds (default 5) for the navigation app. Prints a dot per poll.
# $1 = timeout seconds (default 60). Returns 1 on timeout.
pg_wait_launcher_settled() {
  local timeout="${1:-60}" settle="${2:-5}" start home
  start="$(date +%s)"
  home="$(pg_home_pkg)"
  while ! pg_launcher_ready "$(pg_top_resumed_activity)" "$home"; do
    [ $(($(date +%s) - start)) -ge "$timeout" ] && return 1
    printf '.'
    sleep 2
  done
  sleep "$settle"
}

# Android user the foreground runs as. On Pleos/AAOS this is 10, not 0, and `pm clear/grant/revoke` without --user act on
# user 0, so they would not touch the app the driver sees. Falls back to 0.
pg_current_user() {
  local u; u="$(adbs shell am get-current-user 2>/dev/null | tr -d '\r' | tail -1)"
  case "$u" in ''|*[!0-9]*) echo 0 ;; *) echo "$u" ;; esac
}

pg_launch_app() {
  adbs shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$PG_ACTIVITY" >/dev/null
}

# Launch the app, wait $2 seconds (default 3) and check that it is the top resumed activity. If something else has
# the foreground (on a fresh Pleos boot: the navigation app), launch again, up to $1 times (default 3).
# Returns 1 (after a warning) if it is still not on top. Not verifiable (no topResumedActivity in dumpsys) -> 0.
pg_launch_app_verified() {
  local tries="${1:-3}" pause="${2:-3}" i=0 top
  pg_launch_app || die "Could not start $PG_ACTIVITY (adb shell am start failed)."
  while :; do
    sleep "$pause"
    top="$(pg_top_resumed_activity)"
    case "$top" in
      "") note "Could not read the top activity (dumpsys activity activities); launch not verified."; return 0 ;;
      *" $PG_PKG/"*) return 0 ;;
    esac
    if [ "$i" -ge "$tries" ]; then
      warn "$PG_ACTIVITY is still not in the foreground after $tries relaunches (top: $top). Open it from the launcher."
      return 1
    fi
    i=$((i + 1))
    note "Not in the foreground (top: $top) — launching again ($i/$tries)"
    pg_launch_app || die "Could not start $PG_ACTIVITY (adb shell am start failed)."
  done
}
