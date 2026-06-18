#!/bin/bash
# Record Dome product overview demo video
set -euo pipefail
export DISPLAY=:1
OUT="${1:-/opt/cursor/artifacts/dome-overview-demo.mp4}"
mkdir -p "$(dirname "$OUT")"

WID=$(xdotool search --name "Dome" | head -1)
focus() { xdotool windowactivate --sync "$WID"; sleep 0.3; }
focus

click() {
  local rx=$1 ry=$2 delay=${3:-1.2}
  focus
  xdotool mousemove --window "$WID" "$rx" "$ry"
  xdotool click 1
  sleep "$delay"
}

ffmpeg -y -f x11grab -video_size 1920x1080 -framerate 24 -i :1.0 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OUT" &
REC=$!
sleep 2

sleep 3
click 70 195 2      # Projects
click 70 160 2      # Home
click 70 195 2      # Projects
click 450 520 2     # Investigación IA
click 750 520 1.5   # Dome
click 450 520 2     # Investigación IA
click 70 230 1.5    # Calendar
click 70 260 1.5    # Agents
click 1200 350 1    # Many suggestion
click 1150 420 1
click 70 195 2      # Projects
sleep 2

kill -INT $REC 2>/dev/null || true
wait $REC 2>/dev/null || true
ls -lh "$OUT"
echo "Saved: $OUT"
