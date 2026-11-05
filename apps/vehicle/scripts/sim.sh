#!/usr/bin/env bash
# 주차각 시뮬레이션 루틴 14가지 — 에뮬레이터에서 앱이 혼자 굴러가는 걸 보며 확인하는 UI 흐름 테스트.
#
#   sim.sh list            루틴 목록
#   sim.sh 1               루틴 하나 (1~14)
#   sim.sh 2 4             여러 개
#   sim.sh all [--open]    전부 (×2 배속 약 23분) → captures/sim-<시각>/report.html
#
# 옵션: --speed X  --pause S  --step  --keep-data  --record  --open  --serial ID   (자세히: sim.sh -h)
# 본체: scripts/sim/sim_routines.py (Python 3.8+, 표준 라이브러리만)
set -euo pipefail
PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "python3 가 필요해요 (macOS: xcode-select --install)" >&2; exit 1; }
exec "$PY" "$(dirname "$0")/sim/sim_routines.py" "$@"
