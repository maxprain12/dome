#!/bin/bash
# Record Dome PDF + artifact demo (calibrated navigation)
set -euo pipefail
export DISPLAY=:1
OUT="${1:-/opt/cursor/artifacts/dome-pdf-artifact-demo.mp4}"
mkdir -p "$(dirname "$OUT")"

WID=$(xdotool search --name "Dome" | head -1)
focus() { xdotool windowactivate --sync "$WID"; sleep 0.4; }
focus

click() { focus; xdotool mousemove --window "$WID" "$1" "$2"; xdotool click 1; sleep "${3:-1.5}"; }

ffmpeg -y -f x11grab -video_size 1920x1080 -framerate 24 -i :1.0 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OUT" &
REC=$!
sleep 2

# Fuentes folder in sidebar
click 120 385 1.5
# PDF in folder list (center)
click 550 330 2.5
sleep 2
focus
xdotool key --window "$WID" Page_Down; sleep 1
xdotool key --window "$WID" Page_Down; sleep 1.5

# Many: ask about PDF
click 1150 900 0.5
xdotool type --delay 25 "Resume las ideas clave de este informe sobre IA en investigacion"
sleep 0.8
click 1320 900 1
sleep 6

# Artifact from sidebar
click 140 410 2
sleep 2
# Artifact from center list
click 550 280 2.5
sleep 2
click 500 200 1
sleep 2

kill -INT $REC 2>/dev/null || true
wait $REC 2>/dev/null || true
ls -lh "$OUT"
echo "Saved: $OUT"
