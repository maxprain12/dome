#!/bin/bash
# Demo navigation script for Dome product videos
set -euo pipefail
export DISPLAY=:1

WID=$(xdotool search --name "Dome" | head -1)
xdotool windowactivate --sync "$WID"
sleep 1

click() { xdotool mousemove --sync "$1" "$2" click 1; sleep "$3"; }

# Close DevTools if open
xdotool key --window "$WID" f12 2>/dev/null || true
sleep 0.5

# 1. Open Projects
click 95 195 1.5

# 2. Scroll down to see Investigación IA project (if below fold)
xdotool click --clearmodifiers 4  # scroll down
sleep 0.8
xdotool click --clearmodifiers 4
sleep 0.8

# Click Investigación IA project card (approximate position after scroll)
click 700 520 2

# 3. Open library / workspace - click project in sidebar dropdown area to switch
# Use sidebar workspace: click "Dome" dropdown at top of sidebar
click 95 52 1
sleep 0.5
# Try clicking second project in dropdown
click 200 120 2

# 4. Expand Fuentes folder in sidebar
click 95 380 1
sleep 1

# 5. Open PDF resource
click 120 420 2

# 6. Focus Many panel - click summarize suggestion
click 1550 380 1
sleep 1

# 7. Open artifact from sidebar
click 120 460 2
sleep 2

# Interact with artifact tabs
click 900 350 1
sleep 1
click 1050 350 1
sleep 1
click 750 450 1
sleep 1

echo "Demo navigation complete"
