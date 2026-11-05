#!/usr/bin/env bash
# Save a PNG of the emulator screen.  Default: captures/pg-YYYYmmdd-HHMMSS.png (captures/ is gitignored)
#
#   apps/vehicle/scripts/screenshot.sh                 # captures/pg-20261104-101500.png
#   apps/vehicle/scripts/screenshot.sh c02-card.png    # relative names go into captures/
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

SERIAL_ARG=""; SDK_ARG=""; FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --serial) SERIAL_ARG="${2:?--serial needs an id}"; shift ;;
    --sdk) SDK_ARG="${2:?--sdk needs a directory}"; shift ;;
    -h|--help) echo "Usage: $(basename "$0") [FILE.png] [--serial ID]"; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *) FILE="$1" ;;
  esac
  shift
done

pg_require_sdk "$SDK_ARG"
pg_require_device "$SERIAL_ARG" "$(pg_pick_avd "" 0)"

CAPTURES="$PG_REPO_DIR/captures"
[ -n "$FILE" ] || FILE="pg-$(date +%Y%m%d-%H%M%S).png"
case "$FILE" in /*) ;; *) FILE="$CAPTURES/$FILE" ;; esac
case "$FILE" in *.png) ;; *) FILE="$FILE.png" ;; esac
mkdir -p "$(dirname "$FILE")"

adbs exec-out screencap -p > "$FILE"
# a valid PNG starts with \x89PNG
if [ "$(head -c 4 "$FILE" | od -An -c | tr -d ' ')" != "211PNG" ]; then
  rm -f "$FILE"; die "screencap returned no PNG (is the screen on? try: adb -s $PG_SERIAL shell input keyevent WAKEUP)"
fi
info "Saved $FILE ($(adbs shell wm size 2>/dev/null | tr -d '\r' | sed -n 's/.*size: //p' | tail -1 || true))"
