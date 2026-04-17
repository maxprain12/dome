#!/bin/bash
# =============================================================================
# vps-audit-dashboard.sh — Dome Audit Dashboard Generator
#
# Generates a static HTML dashboard at /var/www/dome-audit/index.html
# by querying GitHub + local findings files.
#
# Run manually:
#   bash vps-audit-dashboard.sh
#
# Or add to crontab (every 15 min):
#   */15 * * * * bash /opt/dome-audit/vps-audit-dashboard.sh >> /var/log/dome-audit.log 2>&1
# =============================================================================

set -euo pipefail

REPO_SLUG="${REPO_SLUG:-maxprain12/dome}"
FINDINGS_DIR="${FINDINGS_DIR:-/var/log/dome-audit-findings}"
LOG_FILE="${LOG_FILE:-/var/log/dome-audit.log}"
OUTPUT_DIR="${OUTPUT_DIR:-/var/www/dome-audit}"
OUTPUT_FILE="$OUTPUT_DIR/index.html"
LOG_PREFIX="[dome-dashboard $(date '+%Y-%m-%d %H:%M')]"

# Milestones config + history (VPS clone of repo reads from scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MILESTONES_FILE="${MILESTONES_FILE:-$SCRIPT_DIR/audit-milestones.json}"
HISTORY_FILE="${HISTORY_FILE:-$FINDINGS_DIR/history.jsonl}"
HISTORY_MAX_LINES="${HISTORY_MAX_LINES:-5000}"

mkdir -p "$OUTPUT_DIR"
echo "$LOG_PREFIX Generating dashboard..."

# ── Collect data from GitHub ──────────────────────────────────────────────────

# Get all audit PRs (last 50), sorted by created date
AUDIT_PRS=$(gh pr list \
  --repo "$REPO_SLUG" \
  --state all \
  --limit 50 \
  --search "audit in:title" \
  --json number,title,state,createdAt,mergedAt,url,additions,deletions,changedFiles,reviews \
  2>/dev/null || echo "[]")

TOTAL_PRS=$(echo "$AUDIT_PRS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
MERGED_PRS=$(echo "$AUDIT_PRS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for p in d if p['mergedAt']))" 2>/dev/null || echo "0")
TOTAL_ADDITIONS=$(echo "$AUDIT_PRS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(p.get('additions',0) for p in d))" 2>/dev/null || echo "0")
TOTAL_DELETIONS=$(echo "$AUDIT_PRS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(p.get('deletions',0) for p in d))" 2>/dev/null || echo "0")
TOTAL_FILES=$(echo "$AUDIT_PRS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(p.get('changedFiles',0) for p in d))" 2>/dev/null || echo "0")

# Last run info from log file
LAST_RUN="Never"
if [ -f "$LOG_FILE" ]; then
  LAST_RUN=$(grep "\[dome-audit" "$LOG_FILE" 2>/dev/null | tail -1 | grep -oE '\[dome-audit [^]]+\]' | tr -d '[]' | sed 's/dome-audit //' || echo "Unknown")
fi

# ── Collect findings data ─────────────────────────────────────────────────────
TOTAL_FINDINGS=0
declare -A FOCUS_FINDINGS
declare -A FOCUS_LAST_PR
declare -A FOCUS_LAST_RUN

FOCUS_TYPES=("security" "types" "i18n" "debt" "vulns" "react" "errors" "deps" "all")

for focus in "${FOCUS_TYPES[@]}"; do
  count=0
  json_file="$FINDINGS_DIR/${focus}.findings.json"
  legacy_file="$FINDINGS_DIR/${focus}.findings"
  if [ -f "$json_file" ]; then
    count=$(python3 -c "
import json
try:
    d = json.load(open('$json_file'))
    print(sum(1 for f in d if f.get('status') == 'open'))
except Exception:
    print(0)
" 2>/dev/null || echo 0)
  elif [ -f "$legacy_file" ]; then
    count=$(wc -l < "$legacy_file" | tr -d ' ')
  fi
  FOCUS_FINDINGS[$focus]=$count
  TOTAL_FINDINGS=$((TOTAL_FINDINGS + count))

  # Last PR for this focus
  last_pr=$(echo "$AUDIT_PRS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
focus = '$focus'
matches = [p for p in d if focus in p['title'].lower()]
if matches:
    p = matches[0]
    print(p['number'], p['state'], p['url'], p.get('mergedAt','') or '')
else:
    print('none none none none')
" 2>/dev/null || echo "none none none none")
  FOCUS_LAST_PR[$focus]="$last_pr"
done

# ── Compute code health score (0-100) ─────────────────────────────────────────
# Simple heuristic: starts at 100, deduct points for open findings
HEALTH_SCORE=100
HEALTH_DEDUCT=$((TOTAL_FINDINGS * 5))
if [ $HEALTH_DEDUCT -gt 60 ]; then HEALTH_DEDUCT=60; fi
HEALTH_SCORE=$((100 - HEALTH_DEDUCT))

if [ $HEALTH_SCORE -ge 80 ]; then
  HEALTH_COLOR="#22c55e"
  HEALTH_LABEL="Good"
elif [ $HEALTH_SCORE -ge 60 ]; then
  HEALTH_COLOR="#f59e0b"
  HEALTH_LABEL="Fair"
else
  HEALTH_COLOR="#ef4444"
  HEALTH_LABEL="Needs Work"
fi

# ── Append snapshot to history.jsonl (powers sparklines + milestone trends) ──
# Each run writes one line per focus + one "global" line with the health score.
# File is truncated to HISTORY_MAX_LINES from the tail to avoid unbounded growth.
FOCUS_COUNTS_JSON="{"
_first=1
for focus in "${FOCUS_TYPES[@]}"; do
  [ "$_first" -eq 1 ] || FOCUS_COUNTS_JSON+=","
  FOCUS_COUNTS_JSON+="\"${focus}\":${FOCUS_FINDINGS[$focus]:-0}"
  _first=0
done
FOCUS_COUNTS_JSON+="}"

export TOTAL_FINDINGS HEALTH_SCORE HISTORY_FILE HISTORY_MAX_LINES FOCUS_COUNTS_JSON

python3 - << 'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

history_file = Path(os.environ["HISTORY_FILE"])
max_lines = int(os.environ.get("HISTORY_MAX_LINES", "5000"))
health_score = int(os.environ["HEALTH_SCORE"])
total_findings = int(os.environ["TOTAL_FINDINGS"])
counts = json.loads(os.environ.get("FOCUS_COUNTS_JSON", "{}"))
now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

history_file.parent.mkdir(parents=True, exist_ok=True)

entries = [
    {"ts": now, "focus": focus, "open_count": int(count)}
    for focus, count in counts.items()
]
entries.append({"ts": now, "focus": "__global__", "health_score": health_score, "total_findings": total_findings})

with history_file.open("a") as f:
    for entry in entries:
        f.write(json.dumps(entry) + "\n")

# Trim to last max_lines
try:
    lines = history_file.read_text().splitlines()
    if len(lines) > max_lines:
        history_file.write_text("\n".join(lines[-max_lines:]) + "\n")
except Exception:
    pass
PY

# ── VPS status ────────────────────────────────────────────────────────────────
# Count AI review failures in last 24h from log file
# grep -c always prints the count (even 0), but exits 1 on no matches — so use
# `|| true` instead of `|| echo 0` to avoid appending a second "0" to stdout.
AI_REVIEW_FAILURES_24H=0
if [ -f "$LOG_FILE" ]; then
  AI_REVIEW_FAILURES_24H=$(grep -c "AI review.*fail\|Review pass failed\|API error" "$LOG_FILE" 2>/dev/null || true)
  [ -z "$AI_REVIEW_FAILURES_24H" ] && AI_REVIEW_FAILURES_24H=0
fi

# Count pending findings jobs
PENDING_COUNT=0
if [ -d "/var/log/dome-audit-findings/pending" ]; then
  PENDING_COUNT=$(find /var/log/dome-audit-findings/pending -name "*.pending" 2>/dev/null | wc -l | tr -d ' ')
fi

# ── Recent timeline (last 15 PRs) ────────────────────────────────────────────
RECENT_PRS_HTML=$(echo "$AUDIT_PRS" | python3 -c "
import sys, json, re
from datetime import datetime

def extract_focus(title):
    m = re.search(r'audit:\s*(\w+)\s+audit', title)
    return m.group(1) if m else 'all'

def format_date(s):
    if not s: return ''
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return dt.strftime('%b %d, %H:%M')
    except:
        return s[:10]

def ai_review_status(reviews):
    '''Parse reviews list to determine AI review status.'''
    if not reviews:
        return 'dot-gray', '—', 'No review'
    ai_reviews = [r for r in reviews if '🤖 AI Code Review' in (r.get('body') or '')]
    if not ai_reviews:
        return 'dot-gray', '?', 'No AI review'
    body = ai_reviews[-1].get('body', '')
    if 'All 3 passes completed' in body:
        return 'dot-green', '✓', 'All passes OK'
    if 'pass failed' in body or 'Review pass failed' in body or 'API error' in body.lower():
        # Count how many passes had errors
        fail_count = body.count('Review pass failed')
        if fail_count == 3:
            return 'dot-red', '✗', 'All passes failed'
        return 'dot-yellow', f'⚠ {fail_count}f', f'{fail_count} pass(es) failed'
    # Has a review but status line is ambiguous — assume ok
    return 'dot-green', '✓', 'Review posted'

focus_colors = {
    'security': '#ef4444', 'types': '#3b82f6', 'i18n': '#8b5cf6',
    'debt': '#f59e0b', 'vulns': '#dc2626', 'react': '#06b6d4',
    'errors': '#f97316', 'deps': '#10b981', 'all': '#6b7280'
}

focus_icons = {
    'security': '🔒', 'types': '📝', 'i18n': '🌍',
    'debt': '🧹', 'vulns': '🛡️', 'react': '⚛️',
    'errors': '🚨', 'deps': '📦', 'all': '🔍'
}

data = json.load(sys.stdin)[:15]
rows = []
for p in data:
    focus = extract_focus(p['title'].lower())
    state = p['state']
    color = focus_colors.get(focus, '#6b7280')
    icon = focus_icons.get(focus, '🔍')
    date_str = format_date(p.get('mergedAt') or p.get('createdAt', ''))
    badge_class = 'badge-merged' if state == 'MERGED' else ('badge-open' if state == 'OPEN' else 'badge-closed')
    badge_text = 'Merged' if state == 'MERGED' else ('Open' if state == 'OPEN' else 'Closed')
    additions = p.get('additions', 0)
    deletions = p.get('deletions', 0)
    files = p.get('changedFiles', 0)
    review_dot, review_short, review_tip = ai_review_status(p.get('reviews', []))
    rows.append(f'''
    <tr class=\"timeline-row\">
      <td><a href=\"{p['url']}\" target=\"_blank\" class=\"pr-link\">#{p['number']}</a></td>
      <td><span class=\"focus-badge\" style=\"background:{color}20;color:{color};border-color:{color}40\">{icon} {focus}</span></td>
      <td><span class=\"badge {badge_class}\">{badge_text}</span></td>
      <td class=\"stat-cell\"><span class=\"additions\">+{additions}</span> / <span class=\"deletions\">-{deletions}</span></td>
      <td class=\"stat-cell muted\">{files} files</td>
      <td class=\"stat-cell\" title=\"{review_tip}\"><span class=\"status-dot {review_dot}\"></span>{review_short}</td>
      <td class=\"stat-cell muted\">{date_str}</td>
    </tr>''')

print(''.join(rows))
" 2>/dev/null || echo "<tr><td colspan='7' class='muted'>No PR data available</td></tr>")

# ── Load history (powers sparklines) ──────────────────────────────────────────
export HISTORY_FILE MILESTONES_FILE

# ── Per-focus cards HTML ───────────────────────────────────────────────────────
FOCUS_CARDS_HTML=$(python3 -c "
import json, os, re

FOCUS_TYPES = [
    ('security', '🔒', 'Security', '#ef4444', '4x/day'),
    ('errors',   '🚨', 'Errors',   '#f97316', '4x/day'),
    ('types',    '📝', 'Types',    '#3b82f6', '4x/day'),
    ('react',    '⚛️',  'React',    '#06b6d4', '4x/day'),
    ('debt',     '🧹', 'Debt',     '#f59e0b', '2x/day'),
    ('i18n',     '🌍', 'i18n',     '#8b5cf6', '2x/day'),
    ('vulns',    '🛡️',  'Vulns',    '#dc2626', '2x/week'),
    ('deps',     '📦', 'Deps',     '#10b981', 'daily'),
    ('all',      '🔍', 'Full',     '#6b7280', 'weekly'),
]

findings_dir = '/var/log/dome-audit-findings'
audit_prs = json.loads('''${AUDIT_PRS}''')

# Load history for sparklines
history_file = os.environ.get('HISTORY_FILE', '')
history_by_focus = {}
if history_file and os.path.exists(history_file):
    try:
        with open(history_file) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                focus = rec.get('focus')
                if not focus:
                    continue
                history_by_focus.setdefault(focus, []).append(rec)
    except Exception:
        pass

def sparkline_svg(points, width=100, height=22, color='#7b76d0', fill=True):
    if not points or len(points) < 2:
        return ''
    pad = 1.5
    max_v = max(points)
    min_v = min(points)
    span = max(max_v - min_v, 1)
    n = len(points)
    step = (width - 2 * pad) / (n - 1) if n > 1 else 0
    xs = [pad + i * step for i in range(n)]
    ys = [height - pad - ((v - min_v) / span) * (height - 2 * pad) for v in points]
    line_pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in zip(xs, ys))
    poly = ''
    if fill:
        fill_pts = f'{xs[0]:.1f},{height} ' + line_pts + f' {xs[-1]:.1f},{height}'
        poly = f'<polygon points=\"{fill_pts}\" fill=\"{color}\" fill-opacity=\"0.12\" />'
    last_x, last_y = xs[-1], ys[-1]
    return (
        f'<svg class=\"sparkline\" viewBox=\"0 0 {width} {height}\" width=\"{width}\" height=\"{height}\" aria-hidden=\"true\">'
        f'{poly}'
        f'<polyline points=\"{line_pts}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"1.25\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />'
        f'<circle cx=\"{last_x:.1f}\" cy=\"{last_y:.1f}\" r=\"1.6\" fill=\"{color}\" />'
        '</svg>'
    )

def get_findings_count(focus):
    # Prefer structured JSON; fall back to legacy .findings text file
    json_path = f'{findings_dir}/{focus}.findings.json'
    try:
        with open(json_path) as f:
            d = json.load(f)
            return sum(1 for f in d if f.get('status') == 'open')
    except Exception:
        pass
    try:
        with open(f'{findings_dir}/{focus}.findings') as f:
            lines = [l for l in f.read().splitlines() if l.strip()]
            return len(lines)
    except Exception:
        return -1  # no data

def get_last_pr(focus):
    matches = [p for p in audit_prs if focus in p['title'].lower()]
    return matches[0] if matches else None

cards = []
for focus, icon, label, color, freq in FOCUS_TYPES:
    count = get_findings_count(focus)
    pr = get_last_pr(focus)

    # Sparkline from history (last 30 points)
    hist = history_by_focus.get(focus, [])[-30:]
    points = [rec.get('open_count', 0) for rec in hist]
    spark_html = sparkline_svg(points, width=90, height=20, color=color) if points else '<span class=\"sparkline-empty muted\">—</span>'

    if count < 0:
        status_html = '<span class=\"status-dot dot-gray\"></span> No data'
        findings_html = '<span class=\"muted\">Not run yet</span>'
    elif count == 0:
        status_html = '<span class=\"status-dot dot-green\"></span> Clean'
        findings_html = '<span class=\"clean-label\">✓ No open findings</span>'
    else:
        status_html = f'<span class=\"status-dot dot-red\"></span> {count} issue{\"s\" if count != 1 else \"\"}'
        findings_html = f'<span class=\"findings-count\">{count} finding{\"s\" if count != 1 else \"\"}</span>'

    pr_html = ''
    if pr:
        state = pr['state']
        num = pr['number']
        url = pr['url']
        badge = 'badge-merged' if state == 'MERGED' else ('badge-open' if state == 'OPEN' else 'badge-closed')
        badge_text = 'Merged' if state == 'MERGED' else ('Open' if state == 'OPEN' else 'Closed')
        pr_html = f'<a href=\"{url}\" target=\"_blank\" class=\"pr-mini-link\">PR #{num} <span class=\"badge {badge}\">{badge_text}</span></a>'
    else:
        pr_html = '<span class=\"muted\">No PRs yet</span>'

    cards.append(f'''
    <div class=\"focus-card\">
      <div class=\"focus-card-header\" style=\"border-left:3px solid {color}\">
        <span class=\"focus-icon\">{icon}</span>
        <div class=\"focus-card-info\">
          <span class=\"focus-card-name\">{label}</span>
          <span class=\"focus-freq muted\">{freq}</span>
        </div>
        <div class=\"focus-card-status\">{status_html}</div>
      </div>
      <div class=\"focus-card-body\">
        <div class=\"focus-card-row\">
          <div>{findings_html}</div>
          <div class=\"sparkline-wrap\">{spark_html}</div>
        </div>
        <div class=\"focus-card-pr\">{pr_html}</div>
      </div>
    </div>''')

print(''.join(cards))
" 2>/dev/null || echo "<p class='muted'>Focus data unavailable</p>")

# ── Milestones + global health sparkline ─────────────────────────────────────
MILESTONES_HTML=""
HEALTH_SPARKLINE_SVG=""
MILESTONES_BLOCK=$(python3 << 'PY'
import json
import os
from datetime import datetime, timezone, date
from pathlib import Path

milestones_file = Path(os.environ.get("MILESTONES_FILE", ""))
history_file = Path(os.environ.get("HISTORY_FILE", ""))

def sparkline_svg(points, width=260, height=36, color="#7b76d0", fill=True):
    if not points or len(points) < 2:
        return ""
    pad = 2
    max_v = max(points)
    min_v = min(points)
    span = max(max_v - min_v, 1)
    n = len(points)
    step = (width - 2 * pad) / (n - 1) if n > 1 else 0
    xs = [pad + i * step for i in range(n)]
    ys = [height - pad - ((v - min_v) / span) * (height - 2 * pad) for v in points]
    line_pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in zip(xs, ys))
    poly = ""
    if fill:
        fill_pts = f"{xs[0]:.1f},{height} " + line_pts + f" {xs[-1]:.1f},{height}"
        poly = f'<polygon points="{fill_pts}" fill="{color}" fill-opacity="0.14" />'
    return (
        f'<svg class="sparkline-lg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" aria-hidden="true">'
        f'{poly}'
        f'<polyline points="{line_pts}" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />'
        f'<circle cx="{xs[-1]:.1f}" cy="{ys[-1]:.1f}" r="2" fill="{color}" />'
        '</svg>'
    )

# Load history
history = {}
if history_file.exists():
    try:
        for line in history_file.read_text().splitlines():
            try:
                rec = json.loads(line)
            except Exception:
                continue
            focus = rec.get("focus")
            if not focus:
                continue
            history.setdefault(focus, []).append(rec)
    except Exception:
        pass

# Global health sparkline from __global__ entries (last 30)
global_hist = history.get("__global__", [])[-30:]
global_points = [rec.get("health_score", 0) for rec in global_hist]
global_spark = sparkline_svg(global_points, color="#7b76d0") if global_points else ""

# Milestones
milestones_cards = []
if milestones_file.exists():
    try:
        config = json.loads(milestones_file.read_text())
    except Exception:
        config = {}
else:
    config = {}

today = datetime.now(timezone.utc).date()

def days_until(deadline_str):
    try:
        d = datetime.strptime(deadline_str, "%Y-%m-%d").date()
        return (d - today).days
    except Exception:
        return None

def status_for(current, target, metric, days_left, slope):
    # For open_findings we want current <= target; for health_score we want current >= target.
    if metric == "health_score":
        met = current >= target
        gap = target - current
        progress = max(0.0, min(1.0, current / target if target > 0 else 1.0))
        # slope: positive slope = improving
        trending_wrong_way = slope < -0.3
    else:
        met = current <= target
        baseline = max(current, target + 1)
        gap = current - target
        progress = max(0.0, min(1.0, 1 - (gap / baseline) if baseline > 0 else 1.0))
        # slope: negative slope (fewer findings over time) = improving
        trending_wrong_way = slope > 0.3

    if met:
        return "on-track", progress, "Target met"
    if days_left is None:
        return "unknown", progress, "No deadline"
    if days_left < 0:
        return "overdue", progress, f"Overdue by {-days_left}d"
    if trending_wrong_way:
        return "at-risk", progress, f"{days_left}d — trending wrong way"
    if days_left <= 14 and progress < 0.7:
        return "at-risk", progress, f"{days_left}d — behind schedule"
    return "on-track", progress, f"{days_left}d remaining"

def slope_of(points):
    """Simple slope: avg(last 3) - avg(first 3), normalized by n."""
    if len(points) < 4:
        return 0.0
    head = sum(points[:3]) / 3
    tail = sum(points[-3:]) / 3
    return (tail - head) / len(points)

def render_card(label, metric, target, deadline, current, points, color):
    days_left = days_until(deadline)
    slope = slope_of(points)
    status, progress, status_text = status_for(current, target, metric, days_left, slope)
    status_class = {
        "on-track": "milestone-ok",
        "at-risk":  "milestone-warn",
        "overdue":  "milestone-bad",
        "unknown":  "milestone-muted",
    }.get(status, "milestone-muted")
    bar_color = {
        "on-track": "#3a9b6b",
        "at-risk":  "#b38019",
        "overdue":  "#d14d4d",
        "unknown":  "#858299",
    }.get(status, "#858299")
    progress_pct = int(progress * 100)
    if metric == "health_score":
        current_display = f"{current} / {target}"
    else:
        current_display = f"{current} open · target ≤ {target}"
    spark_html = sparkline_svg(points, width=220, height=30, color=bar_color) if points else '<span class="muted" style="font-size:11px">No history yet</span>'
    return (
        f'<div class="milestone-card {status_class}">'
        f'<div class="milestone-header">'
        f'<span class="milestone-label">{label}</span>'
        f'<span class="milestone-status">{status_text}</span>'
        f'</div>'
        f'<div class="milestone-value">{current_display}</div>'
        f'<div class="milestone-bar"><div class="milestone-bar-fill" style="width:{progress_pct}%;background:{bar_color}"></div></div>'
        f'<div class="milestone-spark">{spark_html}</div>'
        f'<div class="milestone-meta muted">Due {deadline}</div>'
        f'</div>'
    )

# Per-focus milestones
for m in config.get("per_focus", []):
    focus = m.get("focus")
    metric = m.get("metric", "open_findings")
    target = m.get("target", 0)
    deadline = m.get("deadline", "")
    label = m.get("label") or f"{focus}: ≤{target}"
    hist = history.get(focus, [])[-30:]
    points = [rec.get("open_count", 0) for rec in hist]
    current = points[-1] if points else 0
    milestones_cards.append(render_card(label, metric, target, deadline, current, points, "#7b76d0"))

# Global milestone
g = config.get("global")
if g:
    metric = g.get("metric", "health_score")
    target = g.get("target", 90)
    deadline = g.get("deadline", "")
    label = g.get("label", "Global health")
    hist = history.get("__global__", [])[-30:]
    if metric == "health_score":
        points = [rec.get("health_score", 0) for rec in hist]
    else:
        points = [rec.get("total_findings", 0) for rec in hist]
    current = points[-1] if points else 0
    milestones_cards.append(render_card(label, metric, target, deadline, current, points, "#7b76d0"))

milestones_html = "".join(milestones_cards) if milestones_cards else '<div class="empty-state muted">No milestones configured — edit scripts/audit-milestones.json</div>'

# Emit as shell-safe base64 so multi-line HTML survives $() round-trip
import base64
payload = {"milestones": milestones_html, "global_spark": global_spark}
print(base64.b64encode(json.dumps(payload).encode()).decode())
PY
)

# Decode payload
MILESTONES_HTML=$(echo "$MILESTONES_BLOCK" | python3 -c "import sys,base64,json; d=json.loads(base64.b64decode(sys.stdin.read().strip())); print(d['milestones'])" 2>/dev/null || echo '<div class="empty-state muted">Milestones unavailable</div>')
HEALTH_SPARKLINE_SVG=$(echo "$MILESTONES_BLOCK" | python3 -c "import sys,base64,json; d=json.loads(base64.b64decode(sys.stdin.read().strip())); print(d['global_spark'])" 2>/dev/null || echo '')

# ── Open findings detail ───────────────────────────────────────────────────────
OPEN_FINDINGS_HTML=$(python3 -c "
import html
import json
import os
from glob import glob

findings_dir = '$FINDINGS_DIR'
focus_order = ['security', 'errors', 'types', 'react', 'debt', 'i18n', 'vulns', 'deps', 'all']

groups = []
for focus in focus_order:
    json_path = os.path.join(findings_dir, f'{focus}.findings.json')
    items = []
    if os.path.exists(json_path):
        try:
            with open(json_path) as f:
                data = json.load(f)
            for item in data:
                if item.get('status') == 'open':
                    items.append(item)
        except Exception:
            pass
    else:
        # Legacy fallback
        legacy = os.path.join(findings_dir, f'{focus}.findings')
        if os.path.exists(legacy):
            try:
                with open(legacy) as f:
                    for line in f.read().splitlines():
                        if line.strip():
                            items.append({'body': line, 'severity': 'error' if line.startswith('❌') else 'warn'})
            except Exception:
                pass

    if not items:
        continue

    rows = []
    for item in items:
        sev = item.get('severity', 'warn')
        css = 'finding-error' if sev == 'error' else 'finding-warn'
        body = html.escape(item.get('body', ''))
        first_pr = item.get('first_seen_pr')
        extra = ''
        if first_pr:
            extra = f' <span class=\"finding-pr-ref\">(PR #{first_pr})</span>'
        rows.append(f'<div class=\"finding-item {css}\">{body}{extra}</div>')

    groups.append(
        f'<div class=\"finding-group\">'
        f'<h4 class=\"finding-focus-title\">{focus.upper()} ({len(items)})</h4>'
        + ''.join(rows)
        + '</div>'
    )

if groups:
    print(''.join(groups))
else:
    print('<div class=\"empty-state\">✓ No open findings — codebase is clean</div>')
" 2>/dev/null || echo "<div class='empty-state'>✓ No open findings — codebase is clean</div>")

# ── Pending jobs ──────────────────────────────────────────────────────────────
PENDING_HTML=""
if [ -d "/var/log/dome-audit-findings/pending" ]; then
  for pf in /var/log/dome-audit-findings/pending/*.pending; do
    [ -f "$pf" ] || continue
    read -r pfocus pnum prepo < "$pf"
    PENDING_HTML+="<div class='pending-item'>⏳ PR #${pnum} (${pfocus}) — waiting for AI review</div>"
  done
fi
[ -z "$PENDING_HTML" ] && PENDING_HTML="<span class='muted'>Queue empty</span>"

# ── Write HTML ────────────────────────────────────────────────────────────────
GENERATED_AT=$(date '+%Y-%m-%d %H:%M:%S')

cat > "$OUTPUT_FILE" << HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="300" />
  <title>Dome — Audit Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #fbfbfe;
      --bg2: #ffffff;
      --bg3: #f2f2f9;
      --border: #e6e6f0;
      --border-strong: #d4d4e3;
      --text: #040316;
      --text2: #4a4766;
      --text3: #858299;
      --accent: #7b76d0;
      --accent-soft: #eceaf9;
      --green: #3a9b6b;
      --green-soft: #e7f4ec;
      --red: #d14d4d;
      --red-soft: #f8e8e8;
      --yellow: #b38019;
      --yellow-soft: #f6efdc;
      --blue: #4a7bc7;
      --blue-soft: #e6edf8;
    }

    html, body { background: var(--bg); }
    body {
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      font-feature-settings: 'cv11', 'ss01';
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .muted { color: var(--text3); }

    /* ── Header ── */
    .header {
      padding: 24px 40px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg2);
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-mark {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: 10px;
      font-size: 18px;
      font-weight: 600;
    }
    .header-title { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
    .header-sub { color: var(--text3); font-size: 12px; margin-top: 2px; }
    .header-meta { font-size: 12px; color: var(--text3); text-align: right; line-height: 1.7; }
    .header-meta strong { color: var(--text2); font-weight: 500; }
    .refresh-note { font-size: 11px; color: var(--text3); }

    /* ── Layout ── */
    .container { max-width: 1240px; margin: 0 auto; padding: 32px 40px 48px; }
    .section { margin-bottom: 44px; }
    .section-title {
      font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--text3);
      margin-bottom: 16px;
    }
    .section-title .count {
      margin-left: 8px;
      color: var(--text3);
      font-weight: 500;
      letter-spacing: 0;
    }

    /* ── Summary cards ── */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .summary-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      transition: border-color 150ms ease;
    }
    .summary-card:hover { border-color: var(--border-strong); }
    .summary-card .label {
      font-size: 11px; color: var(--text3);
      letter-spacing: 0.04em; text-transform: uppercase;
      font-weight: 500;
      margin-bottom: 10px;
    }
    .summary-card .value {
      font-size: 26px; font-weight: 600;
      line-height: 1.1; letter-spacing: -0.02em;
    }
    .summary-card .sub { font-size: 12px; color: var(--text3); margin-top: 4px; }

    /* ── Health ring ── */
    .health-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .health-ring {
      width: 56px; height: 56px;
      border-radius: 50%;
      border: 4px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 600;
      flex-shrink: 0;
      letter-spacing: -0.02em;
    }
    .health-info .label {
      font-size: 11px; color: var(--text3);
      letter-spacing: 0.04em; text-transform: uppercase;
      font-weight: 500;
      margin-bottom: 6px;
    }
    .health-info .value { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
    .health-info .sub { font-size: 12px; color: var(--text3); margin-top: 2px; }

    /* ── Focus grid ── */
    .focus-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 12px;
    }
    .focus-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 150ms ease;
    }
    .focus-card:hover { border-color: var(--border-strong); }
    .focus-card-header {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .focus-icon { font-size: 16px; width: 22px; text-align: center; flex-shrink: 0; }
    .focus-card-info { flex: 1; min-width: 0; }
    .focus-card-name {
      font-weight: 600; font-size: 13px;
      display: block; letter-spacing: -0.01em;
    }
    .focus-freq { font-size: 11px; color: var(--text3); }
    .focus-card-status { font-size: 12px; white-space: nowrap; color: var(--text2); }
    .focus-card-body {
      padding: 12px 16px 14px;
      display: flex; flex-direction: column; gap: 6px;
      border-top: 1px solid var(--border);
    }
    .focus-card-pr { font-size: 12px; }
    .pr-mini-link { display: inline-flex; align-items: center; gap: 6px; color: var(--text3); }
    .pr-mini-link:hover { color: var(--text2); }

    /* ── Status dots ── */
    .status-dot {
      display: inline-block; width: 7px; height: 7px;
      border-radius: 50%; margin-right: 6px;
      vertical-align: baseline;
    }
    .dot-green { background: var(--green); }
    .dot-red { background: var(--red); }
    .dot-yellow { background: var(--yellow); }
    .dot-gray { background: var(--text3); }
    .clean-label { color: var(--green); font-size: 12px; font-weight: 500; }
    .findings-count { color: var(--yellow); font-size: 12px; font-weight: 600; }

    /* ── Badges ── */
    .badge {
      display: inline-flex; align-items: center;
      padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 500;
      letter-spacing: 0.01em;
    }
    .badge-merged { background: var(--green-soft); color: var(--green); }
    .badge-open    { background: var(--blue-soft);  color: var(--blue); }
    .badge-closed  { background: var(--bg3);        color: var(--text3); }

    .focus-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      border: 1px solid;
    }

    /* ── Timeline table ── */
    .table-wrapper {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .timeline-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .timeline-table thead th {
      text-align: left;
      padding: 12px 16px;
      font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--text3);
      border-bottom: 1px solid var(--border);
      background: var(--bg3);
    }
    .timeline-row td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .timeline-row:last-child td { border-bottom: none; }
    .timeline-row:hover { background: var(--bg3); }
    .pr-link { font-weight: 600; color: var(--accent); }
    .stat-cell { font-size: 12px; white-space: nowrap; color: var(--text2); }
    .additions { color: var(--green); font-weight: 500; }
    .deletions { color: var(--red); font-weight: 500; }

    /* ── Findings ── */
    .findings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 12px;
    }
    .finding-group {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .finding-focus-title {
      padding: 11px 16px;
      font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--text2);
      border-bottom: 1px solid var(--border);
      background: var(--bg3);
    }
    .finding-item {
      padding: 10px 16px;
      font-size: 12px; line-height: 1.55;
      color: var(--text2);
      border-bottom: 1px solid var(--border);
    }
    .finding-item:last-child { border-bottom: none; }
    .finding-error { border-left: 3px solid var(--red); }
    .finding-warn  { border-left: 3px solid var(--yellow); }
    .finding-pr-ref {
      color: var(--text3);
      font-size: 11px;
      margin-left: 6px;
    }
    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--green);
      font-size: 14px;
      font-weight: 500;
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
    }

    /* ── Sparklines ── */
    .sparkline { display: block; }
    .sparkline-lg { display: block; }
    .sparkline-empty { font-size: 11px; }
    .sparkline-wrap { line-height: 0; flex-shrink: 0; }
    .focus-card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .health-spark-row {
      margin-top: 6px;
      line-height: 0;
    }

    /* ── Milestones ── */
    .milestones-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }
    .milestone-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .milestone-card.milestone-ok    { border-left: 3px solid var(--green); }
    .milestone-card.milestone-warn  { border-left: 3px solid var(--yellow); }
    .milestone-card.milestone-bad   { border-left: 3px solid var(--red); }
    .milestone-card.milestone-muted { border-left: 3px solid var(--text3); }
    .milestone-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .milestone-label {
      font-size: 13px; font-weight: 600;
      letter-spacing: -0.01em;
    }
    .milestone-status {
      font-size: 11px;
      color: var(--text3);
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    .milestone-ok    .milestone-status { color: var(--green); }
    .milestone-warn  .milestone-status { color: var(--yellow); }
    .milestone-bad   .milestone-status { color: var(--red); }
    .milestone-value {
      font-size: 12px;
      color: var(--text2);
    }
    .milestone-bar {
      height: 6px;
      background: var(--bg3);
      border-radius: 3px;
      overflow: hidden;
    }
    .milestone-bar-fill {
      height: 100%;
      transition: width 200ms ease;
    }
    .milestone-spark { line-height: 0; }
    .milestone-meta { font-size: 11px; }

    /* ── Pending queue ── */
    .pending-box {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 8px 16px;
    }
    .pending-item {
      padding: 10px 0;
      font-size: 13px;
      color: var(--text2);
      border-bottom: 1px solid var(--border);
    }
    .pending-item:last-child { border-bottom: none; }
    .pending-box .muted { padding: 8px 0; display: inline-block; }
  </style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="header-mark">⬡</div>
    <div>
      <div class="header-title">Dome Audit</div>
      <div class="header-sub">Automated code health monitoring</div>
    </div>
  </div>
  <div class="header-meta">
    <div>Generated <strong>${GENERATED_AT}</strong></div>
    <div><a href="https://github.com/${REPO_SLUG}" target="_blank">${REPO_SLUG}</a></div>
    <div class="refresh-note">Auto-refresh every 5 min</div>
  </div>
</div>

<div class="container">

  <!-- Summary -->
  <div class="section">
    <div class="section-title">Overview</div>
    <div class="summary-grid">

      <div class="health-card" style="grid-column: span 1">
        <div class="health-ring" style="border-color: ${HEALTH_COLOR}; color: ${HEALTH_COLOR}">
          ${HEALTH_SCORE}
        </div>
        <div class="health-info">
          <div class="label">Code Health Score</div>
          <div class="value" style="color:${HEALTH_COLOR}">${HEALTH_LABEL}</div>
          <div class="sub">${TOTAL_FINDINGS} open findings</div>
          <div class="health-spark-row">${HEALTH_SPARKLINE_SVG}</div>
        </div>
      </div>

      <div class="summary-card">
        <div class="label">Total Audit PRs</div>
        <div class="value">${TOTAL_PRS}</div>
        <div class="sub">${MERGED_PRS} merged</div>
      </div>

      <div class="summary-card">
        <div class="label">Lines Improved</div>
        <div class="value" style="color: var(--red)">−${TOTAL_DELETIONS}</div>
        <div class="sub" style="color: var(--green)">+${TOTAL_ADDITIONS} added</div>
      </div>

      <div class="summary-card">
        <div class="label">Files Touched</div>
        <div class="value">${TOTAL_FILES}</div>
        <div class="sub">across all audits</div>
      </div>

      <div class="summary-card">
        <div class="label">Last Audit Run</div>
        <div class="value" style="font-size:16px">${LAST_RUN:-Never}</div>
        <div class="sub">from VPS log</div>
      </div>

      <div class="summary-card">
        <div class="label">AI Review Errors (log)</div>
        <div class="value" style="color: $([ "${AI_REVIEW_FAILURES_24H:-0}" -gt 0 ] && echo 'var(--red)' || echo 'var(--green)')">${AI_REVIEW_FAILURES_24H:-0}</div>
        <div class="sub">API/post failures in log</div>
      </div>

      <div class="summary-card">
        <div class="label">Pending Queue</div>
        <div class="value" style="color: $([ "${PENDING_COUNT:-0}" -gt 0 ] && echo 'var(--yellow)' || echo 'var(--green)')">${PENDING_COUNT:-0}</div>
        <div class="sub">reviews awaiting extract</div>
      </div>

    </div>
  </div>

  <!-- Milestones -->
  <div class="section">
    <div class="section-title">Milestones</div>
    <div class="milestones-grid">
${MILESTONES_HTML}
    </div>
  </div>

  <!-- Focus status -->
  <div class="section">
    <div class="section-title">Audit Foci</div>
    <div class="focus-grid">
${FOCUS_CARDS_HTML}
    </div>
  </div>

  <!-- Open findings -->
  <div class="section">
    <div class="section-title">Open Findings<span class="count">${TOTAL_FINDINGS} total</span></div>
    <div class="findings-grid">
${OPEN_FINDINGS_HTML}
    </div>
  </div>

  <!-- Recent PRs timeline -->
  <div class="section">
    <div class="section-title">Recent Audit PRs</div>
    <div class="table-wrapper">
      <table class="timeline-table">
        <thead>
          <tr>
            <th>PR</th>
            <th>Focus</th>
            <th>Status</th>
            <th>Changes</th>
            <th>Files</th>
            <th title="AI Code Review status (✓ all passes OK / ⚠ partial / ✗ all failed / — no review)">AI Review</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
${RECENT_PRS_HTML}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Pending queue -->
  <div class="section">
    <div class="section-title">Findings Queue</div>
    <div class="pending-box">
${PENDING_HTML}
    </div>
  </div>

</div>
</body>
</html>
HTML

echo "$LOG_PREFIX Dashboard written to $OUTPUT_FILE"

# ── Serve if not already running ─────────────────────────────────────────────
if ! pgrep -f "python3 -m http.server 8080" > /dev/null 2>&1; then
  cd "$OUTPUT_DIR"
  nohup python3 -m http.server 8080 > /var/log/dome-dashboard-server.log 2>&1 &
  echo "$LOG_PREFIX HTTP server started on port 8080 (PID: $!)"
fi
