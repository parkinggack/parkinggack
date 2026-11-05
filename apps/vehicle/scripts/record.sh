#!/usr/bin/env bash
# Record the emulator screen to MP4 (adb shell screenrecord) for the 1-2 min demo video.
#
#   apps/vehicle/scripts/record.sh                  # start now, press Enter to stop -> captures/pg-demo-<time>.mp4
#   apps/vehicle/scripts/record.sh start            # start in the background (e.g. then run demo.sh)
#   apps/vehicle/scripts/record.sh stop [FILE.mp4]  # stop and pull the file into captures/
#
# screenrecord stops by itself after --time-limit seconds (max 180 = 3 min).
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

usage() {
  cat <<EOF
Usage: $(basename "$0") [start|stop] [FILE.mp4] [--time-limit SEC] [--bit-rate MBPS] [--size WxH] [--serial ID]
  (no subcommand)   start, wait for Enter, stop, pull
  --time-limit SEC  default 180 (screenrecord maximum)
  --bit-rate MBPS   default 8
  --size WxH        default: device resolution
EOF
}

CMD="interactive"; FILE=""; LIMIT=180; RATE=8; SIZE=""; SERIAL_ARG=""; SDK_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    start|stop) CMD="$1" ;;
    --time-limit) LIMIT="${2:?}"; shift ;;
    --bit-rate) RATE="${2:?}"; shift ;;
    --size) SIZE="${2:?}"; shift ;;
    --serial) SERIAL_ARG="${2:?}"; shift ;;
    --sdk) SDK_ARG="${2:?}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) usage >&2; die "Unknown option: $1" ;;
    *) FILE="$1" ;;
  esac
  shift
done

pg_require_sdk "$SDK_ARG"
pg_require_device "$SERIAL_ARG" "$(pg_pick_avd "" 0)"

REMOTE="/sdcard/pg-demo.mp4"
STATE="$PG_OUT_DIR/record-$PG_SERIAL.pid"
CAPTURES="$PG_REPO_DIR/captures"

start_rec() {
  if [ -n "$(adbs shell pidof screenrecord 2>/dev/null | tr -d '\r')" ]; then
    die "screenrecord is already running on $PG_SERIAL — run: $(basename "$0") stop"
  fi
  mkdir -p "$PG_OUT_DIR"
  local args=(--time-limit "$LIMIT" --bit-rate "$((RATE * 1000000))")
  [ -n "$SIZE" ] && args+=(--size "$SIZE")
  adbs shell rm -f "$REMOTE" >/dev/null 2>&1 || true
  nohup "$PG_ADB" -s "$PG_SERIAL" shell screenrecord "${args[@]}" "$REMOTE" >"$PG_OUT_DIR/record.log" 2>&1 &
  echo $! > "$STATE"
  sleep 1
  [ -n "$(adbs shell pidof screenrecord 2>/dev/null | tr -d '\r')" ] || { cat "$PG_OUT_DIR/record.log" >&2; die "screenrecord did not start."; }
  info "Recording $PG_SERIAL (max ${LIMIT}s, ${RATE} Mbps) -> $REMOTE"
}

stop_rec() {
  local pid="" _
  [ -f "$STATE" ] && pid="$(cat "$STATE")"
  # SIGINT lets screenrecord finish the MP4 properly (moov atom). Single quotes: expanded by the device shell.
  # shellcheck disable=SC2016
  adbs shell 'pkill -INT screenrecord 2>/dev/null || kill -INT $(pidof screenrecord) 2>/dev/null' >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ -n "$(adbs shell pidof screenrecord 2>/dev/null | tr -d '\r')" ] || break
    sleep 1
  done
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  rm -f "$STATE"
  sleep 1
  [ -n "$FILE" ] || FILE="pg-demo-$(date +%Y%m%d-%H%M%S).mp4"
  case "$FILE" in /*) ;; *) FILE="$CAPTURES/$FILE" ;; esac
  case "$FILE" in *.mp4) ;; *) FILE="$FILE.mp4" ;; esac
  mkdir -p "$(dirname "$FILE")"
  adbs pull "$REMOTE" "$FILE" >/dev/null || die "Could not pull $REMOTE (was anything recorded?)"
  adbs shell rm -f "$REMOTE" >/dev/null 2>&1 || true
  info "Saved $FILE"
}

case "$CMD" in
  start) start_rec; info "Stop with: apps/vehicle/scripts/record.sh stop" ;;
  stop) stop_rec ;;
  interactive)
    start_rec
    read -r -p "    Press Enter to stop recording... " _ || true
    stop_rec
    ;;
esac
