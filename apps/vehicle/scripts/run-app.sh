#!/usr/bin/env bash
# Build the debug APK, start the emulator (cold boot) if needed, install and launch 주차각, forward Virtual Console.
# After boot it sets the device time zone (Asia/Seoul; the Pleos AVD ships with America/Los_Angeles). On a fresh boot
# it waits for the Pleos launcher and its navigation app to come up first, and it relaunches the app if they still
# take the foreground.
#
#   apps/vehicle/scripts/run-app.sh                 # AVD Pleos_Connect (or AAOS_Google_34 if that is the only one)
#   apps/vehicle/scripts/run-app.sh --fallback      # AVD AAOS_Google_34
#   apps/vehicle/scripts/run-app.sh --no-build      # reuse the last APK
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

  --avd NAME          AVD to start (default: $PG_AVD_PLEOS, else $PG_AVD_FALLBACK if only that exists)
  --fallback          Same as --avd $PG_AVD_FALLBACK
  --serial ID         Use this already-running device/emulator (adb serial)
  --no-build          Skip Gradle; install the existing APK
  --quick-boot        Allow snapshot quick boot (default: cold boot, -no-snapshot-load, as the Pleos docs recommend)
  --wipe              Factory-reset the AVD data on this boot (-wipe-data)
  --headless          No emulator window (-no-window), e.g. for recording via adb only
  --gpu MODE          Emulator -gpu mode (auto, host, swiftshader_indirect, ...)
  --boot-timeout SEC  How long to wait for boot (default 600)
  --no-grant          Install without granting runtime permissions (CAR_SPEED dialog appears on first launch)
  --timezone TZ       Device time zone to set after boot (default $PG_DEFAULT_TIMEZONE; the Pleos AVD boots with
                      America/Los_Angeles, so parking times would show US time)
  --keep-timezone     Leave the device time zone as it is
  --sdk DIR           Android SDK location
  -h, --help          Show this help
EOF
}

AVD_ARG=""; FALLBACK=0; SERIAL_ARG=""; BUILD=1; COLD=1; WIPE=0; HEADLESS=0; GPU=""; BOOT_TIMEOUT=600; GRANT=1; SDK_ARG=""
DEVICE_TZ="$PG_DEFAULT_TIMEZONE"; KEEP_TZ=0
while [ $# -gt 0 ]; do
  case "$1" in
    --avd) AVD_ARG="${2:?--avd needs a name}"; shift ;;
    --fallback) FALLBACK=1 ;;
    --serial) SERIAL_ARG="${2:?--serial needs an id}"; shift ;;
    --no-build) BUILD=0 ;;
    --quick-boot) COLD=0 ;;
    --wipe) WIPE=1 ;;
    --headless) HEADLESS=1 ;;
    --gpu) GPU="${2:?--gpu needs a mode}"; shift ;;
    --boot-timeout) BOOT_TIMEOUT="${2:?--boot-timeout needs seconds}"; shift ;;
    --no-grant) GRANT=0 ;;
    --timezone) DEVICE_TZ="${2:?--timezone needs a zone id, e.g. Asia/Seoul}"; shift ;;
    --keep-timezone) KEEP_TZ=1 ;;
    --sdk) SDK_ARG="${2:?--sdk needs a directory}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Unknown option: $1" ;;
  esac
  shift
done
# adb shell passes the value through the device shell, so allow only zone-id characters
case "$DEVICE_TZ" in ''|*[!A-Za-z0-9_+/-]*) die "--timezone must be a zone id such as Asia/Seoul (got '$DEVICE_TZ')." ;; esac

pg_require_sdk "$SDK_ARG"
AVD="$(pg_pick_avd "$AVD_ARG" "$FALLBACK")"

# ---------------------------------------------------------------------------
if [ "$BUILD" = 1 ]; then
  step "Build debug APK (apps/vehicle: ./gradlew assembleDebug)"
  pg_require_java
  if ! (cd "$PG_VEHICLE_DIR" && ./gradlew assembleDebug); then
    warn "Build failed. Retrying with --max-workers=1 (helps when Maven Central answers 429)."
    (cd "$PG_VEHICLE_DIR" && ./gradlew --max-workers=1 assembleDebug) || die "Gradle build failed."
  fi
fi
[ -f "$PG_APK" ] || die "APK not found: $PG_APK (run without --no-build)"
info "APK: $PG_APK"

# ---------------------------------------------------------------------------
step "Emulator"
EMU_PID=""; LOG=""; SEL=0; FRESH_BOOT=0
pg_select_device "$SERIAL_ARG" "$AVD" || SEL=$?
[ "$SEL" = 2 ] && exit 1
if [ "$SEL" = 0 ]; then
  NAME="$(pg_emulator_avd_name "$PG_SERIAL")"
  info "Using running device $PG_SERIAL${NAME:+ (AVD $NAME)}"
  # still booting (e.g. just started from Android Studio) -> same launcher race as a boot started here
  [ "$(adbs shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" = 1 ] || FRESH_BOOT=1
else
  if [ -n "$SERIAL_ARG" ] || [ -n "${ANDROID_SERIAL:-}" ]; then die "Device ${SERIAL_ARG:-$ANDROID_SERIAL} is not online (adb devices)."; fi
  pg_avd_exists "$AVD" || die "AVD '$AVD' not found in $(pg_avd_home). Run apps/vehicle/scripts/setup-emulator.sh first."
  [ -x "$PG_EMULATOR" ] || die "Emulator not installed ($PG_EMULATOR). Run setup-emulator.sh."
  # pick a free console port so we know the adb serial (emulator-<port>) in advance
  USED="$("$PG_ADB" devices 2>/dev/null | awk 'NR > 1 && $1 ~ /^emulator-/ { sub("emulator-", "", $1); print $1 }')"
  PORT=5554
  while printf '%s\n' "$USED" | grep -qx "$PORT"; do PORT=$((PORT + 2)); done
  PG_SERIAL="emulator-$PORT"
  ARGS=(-avd "$AVD" -port "$PORT")
  [ "$COLD" = 1 ] && ARGS+=(-no-snapshot-load)
  [ "$WIPE" = 1 ] && ARGS+=(-wipe-data)
  [ "$HEADLESS" = 1 ] && ARGS+=(-no-window)
  [ -n "$GPU" ] && ARGS+=(-gpu "$GPU")
  mkdir -p "$PG_OUT_DIR"
  LOG="$PG_OUT_DIR/emulator-$AVD.log"
  info "Starting: emulator ${ARGS[*]}"
  info "Log: $LOG"
  nohup "$PG_EMULATOR" "${ARGS[@]}" >"$LOG" 2>&1 &
  EMU_PID=$!
  FRESH_BOOT=1
fi

info "Waiting for boot (cold boot of an Automotive image can take 2-5 min)"
printf '    '
set +e; pg_wait_boot "$BOOT_TIMEOUT" "$EMU_PID"; RC=$?; set -e
printf '\n'
if [ "$RC" = 2 ]; then
  warn "The emulator exited. Last log lines:"; tail -n 25 "$LOG" >&2 || true
  die "Emulator did not start — see 'Troubleshooting' in docs/run-locally.md."
elif [ "$RC" != 0 ]; then
  die "Timed out after ${BOOT_TIMEOUT}s waiting for $PG_SERIAL to boot (--boot-timeout to wait longer)."
fi
info "Booted: $PG_SERIAL"

if [ "$KEEP_TZ" = 0 ]; then
  CUR_TZ="$(adbs shell getprop persist.sys.timezone 2>/dev/null | tr -d '\r' || true)"
  if [ "$CUR_TZ" != "$DEVICE_TZ" ]; then
    adbs shell settings put global auto_time_zone 0 >/dev/null 2>&1 || true
    TZ_OUT="$(adbs shell cmd alarm set-timezone "$DEVICE_TZ" 2>&1 | tr -d '\r' || true)"
    NEW_TZ="$(adbs shell getprop persist.sys.timezone 2>/dev/null | tr -d '\r' || true)"
    if [ "$NEW_TZ" != "$DEVICE_TZ" ]; then
      sleep 1; NEW_TZ="$(adbs shell getprop persist.sys.timezone 2>/dev/null | tr -d '\r' || true)"
    fi
    if [ "$NEW_TZ" = "$DEVICE_TZ" ]; then
      info "Time zone: ${CUR_TZ:-unset} -> $DEVICE_TZ (auto time zone off; --keep-timezone to skip)"
    else
      warn "Could not set the device time zone to $DEVICE_TZ (still ${NEW_TZ:-unset})${TZ_OUT:+: $TZ_OUT}"
    fi
  fi
fi

# ---------------------------------------------------------------------------
step "Install"
INSTALL_ARGS=(install -r)
[ "$GRANT" = 1 ] && INSTALL_ARGS+=(-g)
if ! OUT="$(adbs "${INSTALL_ARGS[@]}" "$PG_APK" 2>&1)"; then
  printf '%s\n' "$OUT" >&2
  case "$OUT" in
    *INSTALL_FAILED_UPDATE_INCOMPATIBLE*) info "Signature differs from the installed copy: adb -s $PG_SERIAL uninstall $PG_PKG, then re-run." ;;
    *INSTALL_FAILED_INSUFFICIENT_STORAGE*) info "AVD storage full: re-run with --wipe, or setup-emulator.sh --recreate." ;;
  esac
  die "adb install failed."
fi
if [ "$GRANT" = 1 ]; then info "Installed $PG_PKG (runtime permissions granted with -g)"; else info "Installed $PG_PKG"; fi
if [ "$GRANT" = 1 ]; then
  # "Display over other apps": the Pleos navigation app brings itself to the front when it gets addWaypoint (C-03).
  # With this app-op the app may bring itself back (Android blocks background activity starts otherwise).
  if adbs shell appops set --user "$(pg_current_user)" "$PG_PKG" SYSTEM_ALERT_WINDOW allow >/dev/null 2>&1; then
    info "Allowed display over other apps (returns to the front after C-03 adds a waypoint)"
  else
    warn "Could not allow SYSTEM_ALERT_WINDOW; after C-03 the navigation app may stay in front."
  fi
fi

# ---------------------------------------------------------------------------
step "Launch"
if [ "$FRESH_BOOT" = 1 ]; then
  info "Waiting for the launcher to settle (fresh boot: the Pleos home screen and navigation app start after boot)"
  printf '    '
  RC=0; pg_wait_launcher_settled 60 5 || RC=$?
  printf '\n'
  [ "$RC" = 0 ] || note "Launcher not detected within 60 s; launching anyway."
fi
if pg_launch_app_verified 3 3; then info "Started $PG_ACTIVITY (in the foreground)"; fi

adbs forward tcp:8088 tcp:8088 >/dev/null
SIZE="$(adbs shell wm size 2>/dev/null | tr -d '\r' | sed -n 's/.*size: //p' | tail -1 || true)"
DENSITY="$(adbs shell wm density 2>/dev/null | tr -d '\r' | sed -n 's/.*density: //p' | tail -1 || true)"
info "Screen: ${SIZE:-?} @ ${DENSITY:-?} dpi (UI designed for 1280x720 @ 160 dpi)"

cat <<EOF

    Virtual Console (Pleos image): http://127.0.0.1:8088/   (adb forward tcp:8088 tcp:8088 is set)
    Gear P/R/D, steering angle and brake drive the live recording.

    Next:
      apps/vehicle/scripts/demo.sh main --speed 1.5   # replay demo: C-02 card -> drive -> C-04 -> C-05
      apps/vehicle/scripts/demo.sh reset              # clear app data -> onboarding (C-11)
      apps/vehicle/scripts/screenshot.sh              # PNG into captures/
      apps/vehicle/scripts/record.sh                  # MP4 into captures/ (Enter to stop)
      apps/vehicle/scripts/logcat.sh                  # app logs
EOF
