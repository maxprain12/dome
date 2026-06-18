#!/bin/bash
# Record Dome demo: PDF open + Many chat with seeded prompt/response + interactive artifact
set -euo pipefail
export DISPLAY=:1
OUT="${1:-/opt/cursor/artifacts/dome-many-pdf-demo.mp4}"
mkdir -p "$(dirname "$OUT")"

WID=$(xdotool search --name "Dome" | head -1)
focus() { xdotool windowactivate --sync "$WID"; sleep 0.5; }
click() { focus; xdotool mousemove --window "$WID" "$1" "$2"; xdotool click 1; sleep "${3:-1.2}"; }

focus
xdotool key --window "$WID" f12 2>/dev/null || true
sleep 0.3
# Dismiss stray modals (e.g. Calendar "New event")
xdotool key --window "$WID" Escape
sleep 0.4
xdotool key --window "$WID" Escape
sleep 0.4

ffmpeg -y -f x11grab -video_size 1920x1080 -framerate 24 -i :1.0 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OUT" &
REC=$!
sleep 2

# Projects → Investigación IA
click 95 195 1.2
xdotool click --clearmodifiers 4
sleep 0.5
xdotool click --clearmodifiers 4
sleep 0.5
click 700 520 2

# Fuentes → PDF
click 120 385 1.2
click 550 330 2.5
sleep 2
focus
xdotool key --window "$WID" Page_Down
sleep 0.8
xdotool key --window "$WID" Page_Down
sleep 1.2

# Many panel: conversation is auto-loaded from JSONL seed
sleep 2
click 1480 500 0.8
sleep 0.5
xdotool click --window "$WID" --clearmodifiers 5
sleep 0.4
xdotool click --window "$WID" --clearmodifiers 5
sleep 0.4
xdotool click --window "$WID" --clearmodifiers 5
sleep 1.5

# Expand inline pdf_summary artifact in chat (approx. card body)
click 1480 620 1
sleep 1.5

# Open persisted interactive artifact from sidebar
click 140 410 1.5
click 550 280 2.5
sleep 2

# Interact with artifact section tabs
click 620 200 1
sleep 0.8
click 760 200 1
sleep 0.8
click 900 200 1
sleep 0.8
click 620 320 1.2
sleep 1

kill -INT $REC 2>/dev/null || true
wait $REC 2>/dev/null || true
ls -lh "$OUT"
echo "Saved: $OUT"
