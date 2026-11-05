#!/usr/bin/env bash
# Drive the 주차각 demo on a running emulator.
#
#   demo.sh [main|parallel|angled|flat] [--speed X] [--no-dest]   replay a recorded drive (ScenarioGenerator)
#   demo.sh reset            clear app data -> onboarding (C-11) shows again (+ 13 example records on first launch)
#   demo.sh seed             put the example records back (fresh dates, real records kept) — docs/run-locally.md 6-2
#   demo.sh stop             force-stop the app (ends a running replay)
#   demo.sh list             list scenarios
#   demo.sh live-speed off   stop reading vehicle speed -> app assumes 1.4 m/s creep in D/R (Virtual Console recording)
#   demo.sh live-speed on    read vehicle speed again (default after install)
#   demo.sh vhal speed 1.4 | vhal gear D    inject a VHAL value through car_service (unverified on the Pleos image)
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") [SCENARIO] [--speed X] [--no-dest]   Start a replay demo (default scenario: main)
  $(basename "$0") reset [--no-launch]                  pm clear -> onboarding (C-11) on next launch
  $(basename "$0") seed                                 Example records again (C-01/C-09 full, dates relative to now)
  $(basename "$0") stop                                 Force-stop the app
  $(basename "$0") list                                 List scenarios
  $(basename "$0") live-speed on|off                    Grant / revoke android.car.permission.CAR_SPEED
  $(basename "$0") vhal speed <m/s> | vhal gear P|R|N|D Inject a VHAL property (needs car_service shell access)

Scenarios (ids accepted by ScenarioGenerator.byId; MainActivity also maps "main"):
  main      pangyo-department-store  underground, 2-turn spiral ramp to B2, 2 reverses, ~1m40s at x1
  parallel  parallel-parking         on-street parallel parking, 1 reverse
  angled    angled-parking           angled bay, forward in, no reverse
  flat      flat-lot-simple          flat lot, forward into a bay, no ramp
  split     split-level              1.5-turn ramp -> floor unclear (LOW): C-05 asks the floor, saves without one after 8 s

UI test routines that drive these scenarios and check each screen: scripts/sim.sh (docs/run-locally.md 6-1)

Options:
  --speed X     Replay speed factor 0.25..8 (default 1). 1.5 ~= 67 s for main, 2 ~= 50 s
  --no-dest     Skip the destination card (C-02) and start driving immediately
  --serial ID   adb serial of the emulator (default: the running Automotive emulator)
  --sdk DIR     Android SDK location
EOF
}

CMD="play"; SCENARIO="main"; SPEED="1"; DEST=1; SERIAL_ARG=""; SDK_ARG=""; LAUNCH=1; ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --speed) SPEED="${2:?--speed needs a number}"; shift ;;
    --no-dest) DEST=0 ;;
    --serial) SERIAL_ARG="${2:?--serial needs an id}"; shift ;;
    --sdk) SDK_ARG="${2:?--sdk needs a directory}"; shift ;;
    --no-launch) LAUNCH=0 ;;
    -h|--help) usage; exit 0 ;;
    -*) usage >&2; die "Unknown option: $1" ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done
if [ ${#ARGS[@]} -gt 0 ]; then
  case "${ARGS[0]}" in
    reset|stop|seed|list|live-speed|vhal) CMD="${ARGS[0]}" ;;
    *) SCENARIO="${ARGS[0]}" ;;
  esac
fi

scenario_id() {
  case "$1" in
    main|pangyo|pangyo-department-store) echo "pangyo-department-store" ;;
    parallel|parallel-parking) echo "parallel-parking" ;;
    angled|angled-parking) echo "angled-parking" ;;
    flat|flat-lot|flat-lot-simple) echo "flat-lot-simple" ;;
    split|split-level) echo "split-level" ;;
    *) echo "" ;;
  esac
}

if [ "$CMD" = list ]; then usage | sed -n '/^Scenarios/,/^$/p'; exit 0; fi

pg_require_sdk "$SDK_ARG"
pg_require_device "$SERIAL_ARG" "$(pg_pick_avd "" 0)"
pg_app_installed || die "$PG_PKG is not installed on $PG_SERIAL. Run apps/vehicle/scripts/run-app.sh first."

app_running() { [ -n "$(adbs shell pidof "$PG_PKG" 2>/dev/null | tr -d '\r')" ]; }

# pg_launch_app_verified: relaunch if another app (e.g. the Pleos navigation app right after boot) has the foreground
restart_app() { adbs shell am force-stop "$PG_PKG"; pg_launch_app_verified || true; }

case "$CMD" in
  play)
    ID="$(scenario_id "$SCENARIO")"
    [ -n "$ID" ] || die "Unknown scenario '$SCENARIO'. Try: $(basename "$0") list"
    printf '%s' "$SPEED" | grep -Eq '^[0-9]+(\.[0-9]+)?$' || die "--speed must be a number (0.25..8)"
    # Bring the app to the foreground first and only then send the demo intent with SINGLE_TOP|CLEAR_TOP, so it
    # arrives through onNewIntent. (A cold-start bug where the initial "no destination" value closed the C-02 card
    # is fixed in MainActivity; launching first is kept as a harmless safety net.)
    if ! app_running; then
      info "Starting the app first"
      pg_launch_app_verified || true
    else
      pg_launch_app
    fi
    EXTRAS=(--es demo "$ID" --ef speed "$SPEED")
    [ "$DEST" = 0 ] && EXTRAS+=(--ez dest false)
    adbs shell am start --activity-single-top --activity-clear-top -n "$PG_ACTIVITY" "${EXTRAS[@]}" >/dev/null
    info "Demo '$ID' x$SPEED on $PG_SERIAL$( [ "$DEST" = 0 ] && echo " (no destination card)" || true)"
    if [ "$DEST" = 1 ]; then
      info "C-02 card shows first: tap '괜찮아요' to drive, or '더 쉬운 곳 보기' -> '경유지로 안내' (C-03)."
    fi
    info "Then: C-04 banner -> '주차 기록 중' -> P -> C-05. The replay switches back to live signals when it ends."
    ;;
  reset)
    PG_USER="$(pg_current_user)"
    adbs shell pm clear --user "$PG_USER" "$PG_PKG" >/dev/null
    # pm clear also resets runtime permissions; grant them again so no dialog interrupts the demo (best effort)
    adbs shell pm grant --user "$PG_USER" "$PG_PKG" android.car.permission.CAR_SPEED >/dev/null 2>&1 || true
    adbs shell pm grant --user "$PG_USER" "$PG_PKG" pleos.car.permission.FUSED_LOCATION >/dev/null 2>&1 || true
    adbs shell appops set --user "$PG_USER" "$PG_PKG" SYSTEM_ALERT_WINDOW allow >/dev/null 2>&1 || true
    info "App data cleared (records, settings). Onboarding C-11 shows on next launch."
    if [ "$LAUNCH" = 1 ] && pg_launch_app_verified; then info "Launched."; fi
    ;;
  stop)
    adbs shell am force-stop "$PG_PKG"
    info "Stopped $PG_PKG."
    ;;
  seed)
    app_running || pg_launch_app_verified || true
    adbs shell am start --activity-single-top -n "$PG_ACTIVITY" --ez seedDemo true >/dev/null
    info "Example records put back (ids seed-…, never uploaded). Remove them in C-10 Settings > 기록 모두 지우기."
    ;;
  live-speed)
    MODE="${ARGS[1]:-}"
    PERM="android.car.permission.CAR_SPEED"
    PG_USER="$(pg_current_user)"
    case "$MODE" in
      off)
        adbs shell pm revoke --user "$PG_USER" "$PG_PKG" "$PERM" >/dev/null 2>&1 || true
        # user-fixed = "don't ask again", so the app's permission request returns at once without a dialog (Android 12+)
        adbs shell pm set-permission-flags --user "$PG_USER" "$PG_PKG" "$PERM" user-fixed >/dev/null 2>&1 \
          || warn "Could not set user-fixed; the app may show a permission dialog — choose 'Don't allow'."
        restart_app
        info "Speed signal off: with gear D/R and brake released the app assumes 1.4 m/s (LiveSignalSource creep fallback)."
        ;;
      on)
        adbs shell pm clear-permission-flags --user "$PG_USER" "$PG_PKG" "$PERM" user-fixed >/dev/null 2>&1 || true
        adbs shell pm grant --user "$PG_USER" "$PG_PKG" "$PERM"
        restart_app
        info "Speed signal on (PERF_VEHICLE_SPEED)."
        ;;
      *) die "Usage: $(basename "$0") live-speed on|off" ;;
    esac
    ;;
  vhal)
    WHAT="${ARGS[1]:-}"; VAL="${ARGS[2]:-}"
    case "$WHAT" in
      speed) PROP="0x11600207"   # PERF_VEHICLE_SPEED, float m/s
             printf '%s' "$VAL" | grep -Eq '^[0-9]+(\.[0-9]+)?$' || die "Usage: vhal speed <m/s>, e.g. 1.4" ;;
      gear)  PROP="0x11400400"   # GEAR_SELECTION: N=1 R=2 P=4 D=8
             case "$VAL" in N|n) VAL=1 ;; R|r) VAL=2 ;; P|p) VAL=4 ;; D|d) VAL=8 ;; *) die "Usage: vhal gear P|R|N|D" ;; esac ;;
      *) die "Usage: $(basename "$0") vhal speed <m/s> | vhal gear P|R|N|D" ;;
    esac
    OUT="$(adbs shell cmd car_service inject-vhal-event "$PROP" "$VAL" 2>&1 | tr -d '\r' || true)"
    case "$OUT" in
      *rror*|*xception*|*ermission*|*nknown*|*"not found"*)
        OUT2="$(adbs shell dumpsys activity service com.android.car inject-vhal-event "$PROP" "$VAL" 2>&1 | tr -d '\r' || true)"
        info "car_service: $OUT"
        info "dumpsys:     ${OUT2:-ok}"
        note "If both fail, try 'adb -s $PG_SERIAL root' first (userdebug images only)."
        ;;
      *) info "Injected $PROP = $VAL ${OUT:+($OUT)}" ;;
    esac
    note "Gear/steering in this app come from the Pleos Vehicle SDK; whether VHAL injection reaches it is unverified."
    ;;
esac
