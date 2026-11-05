#!/usr/bin/env bash
# Show 주차각 logs.  Default: our tags (MainActivity, AppController, CarSignals, VehicleGateway, NaviGateway) + crashes.
#
#   apps/vehicle/scripts/logcat.sh            # our tags
#   apps/vehicle/scripts/logcat.sh --all      # everything from the app process (incl. Pleos SDK internals)
#   apps/vehicle/scripts/logcat.sh --clear    # clear the log buffer first
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

MODE="tags"; CLEAR=0; SERIAL_ARG=""; SDK_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --all|--pid) MODE="pid" ;;
    --clear) CLEAR=1 ;;
    --serial) SERIAL_ARG="${2:?}"; shift ;;
    --sdk) SDK_ARG="${2:?}"; shift ;;
    -h|--help) echo "Usage: $(basename "$0") [--all] [--clear] [--serial ID]"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

pg_require_sdk "$SDK_ARG"
pg_require_device "$SERIAL_ARG" "$(pg_pick_avd "" 0)"
[ "$CLEAR" = 1 ] && adbs logcat -c

if [ "$MODE" = pid ]; then
  PID="$(adbs shell pidof "$PG_PKG" 2>/dev/null | tr -d '\r')"
  [ -n "$PID" ] || die "$PG_PKG is not running."
  exec "$PG_ADB" -s "$PG_SERIAL" logcat -v time --pid="$PID"
fi
FILTERS=()
for t in $PG_LOG_TAGS; do FILTERS+=("$t:V"); done
exec "$PG_ADB" -s "$PG_SERIAL" logcat -v time -s "${FILTERS[@]}" AndroidRuntime:E
