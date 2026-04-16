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

mkdir -p "$OUTPUT_DIR"
echo "$LOG_PREFIX Generating dashboard..."

# ── Collect data from GitHub ──────────────────────────────────────────────────

# Get all audit PRs (last 50), sorted by created date
AUDIT_PRS=$(gh pr list \
  --repo "$REPO_SLUG" \
  --state all \
  --limit 50 \
  --search "audit in:title" \
  --json number,title,state,createdAt,mergedAt,url,additions,deletions,changedFiles \
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

FOCUS_TYPES=("security" "types" "i18n" "debt" "vulns" "react" "errors" "all")

for focus in "${FOCUS_TYPES[@]}"; do
  count=0
  if [ -f "$FINDINGS_DIR/${focus}.findings" ]; then
    count=$(wc -l < "$FINDINGS_DIR/${focus}.findings" | tr -d ' ')
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

# ── Recent timeline (last 10 PRs) ────────────────────────────────────────────
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

focus_colors = {
    'security': '#ef4444', 'types': '#3b82f6', 'i18n': '#8b5cf6',
    'debt': '#f59e0b', 'vulns': '#dc2626', 'react': '#06b6d4',
    'errors': '#f97316', 'all': '#6b7280'
}

focus_icons = {
    'security': '🔒', 'types': '📝', 'i18n': '🌍',
    'debt': '🧹', 'vulns': '🛡️', 'react': '⚛️',
    'errors': '🚨', 'all': '🔍'
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
    rows.append(f'''
    <tr class=\"timeline-row\">
      <td><a href=\"{p['url']}\" target=\"_blank\" class=\"pr-link\">#{p['number']}</a></td>
      <td><span class=\"focus-badge\" style=\"background:{color}20;color:{color};border-color:{color}40\">{icon} {focus}</span></td>
      <td><span class=\"badge {badge_class}\">{badge_text}</span></td>
      <td class=\"stat-cell\"><span class=\"additions\">+{additions}</span> / <span class=\"deletions\">-{deletions}</span></td>
      <td class=\"stat-cell muted\">{files} files</td>
      <td class=\"stat-cell muted\">{date_str}</td>
    </tr>''')

print(''.join(rows))
" 2>/dev/null || echo "<tr><td colspan='6' class='muted'>No PR data available</td></tr>")

# ── Per-focus cards HTML ───────────────────────────────────────────────────────
FOCUS_CARDS_HTML=$(python3 -c "
import json, subprocess, re

FOCUS_TYPES = [
    ('security', '🔒', 'Security', '#ef4444', '4x/day'),
    ('errors',   '🚨', 'Errors',   '#f97316', '4x/day'),
    ('types',    '📝', 'Types',    '#3b82f6', '4x/day'),
    ('react',    '⚛️',  'React',    '#06b6d4', '4x/day'),
    ('debt',     '🧹', 'Debt',     '#f59e0b', '2x/day'),
    ('i18n',     '🌍', 'i18n',     '#8b5cf6', '2x/day'),
    ('vulns',    '🛡️',  'Vulns',    '#dc2626', '2x/week'),
    ('all',      '🔍', 'Full',     '#6b7280', 'weekly'),
]

findings_dir = '/var/log/dome-audit-findings'
audit_prs = json.loads('''${AUDIT_PRS}''')

def get_findings_count(focus):
    try:
        with open(f'{findings_dir}/{focus}.findings') as f:
            lines = [l for l in f.read().splitlines() if l.strip()]
            return len(lines)
    except:
        return -1  # no data

def get_last_pr(focus):
    matches = [p for p in audit_prs if focus in p['title'].lower()]
    return matches[0] if matches else None

cards = []
for focus, icon, label, color, freq in FOCUS_TYPES:
    count = get_findings_count(focus)
    pr = get_last_pr(focus)

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
        <div>{findings_html}</div>
        <div class=\"focus-card-pr\">{pr_html}</div>
      </div>
    </div>''')

print(''.join(cards))
" 2>/dev/null || echo "<p class='muted'>Focus data unavailable</p>")

# ── Open findings detail ───────────────────────────────────────────────────────
OPEN_FINDINGS_HTML=""
for focus in "${FOCUS_TYPES[@]}"; do
  file="$FINDINGS_DIR/${focus}.findings"
  [ -f "$file" ] || continue
  [ -s "$file" ] || continue
  content=$(cat "$file")
  [ -z "$content" ] && continue

  OPEN_FINDINGS_HTML+="<div class='finding-group'>"
  OPEN_FINDINGS_HTML+="<h4 class='finding-focus-title'>$(echo "$focus" | tr '[:lower:]' '[:upper:]')</h4>"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # Determine icon
    if [[ "$line" == ❌* ]]; then
      OPEN_FINDINGS_HTML+="<div class='finding-item finding-error'>$line</div>"
    else
      OPEN_FINDINGS_HTML+="<div class='finding-item finding-warn'>$line</div>"
    fi
  done <<< "$content"
  OPEN_FINDINGS_HTML+="</div>"
done

if [ -z "$OPEN_FINDINGS_HTML" ]; then
  OPEN_FINDINGS_HTML="<div class='empty-state'>✓ No open findings — codebase is clean</div>"
fi

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
      --bg: #0f0f13;
      --bg2: #18181f;
      --bg3: #22222c;
      --border: #2e2e3a;
      --text: #e4e4f0;
      --text2: #9191a8;
      --accent: #7b76d0;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #f59e0b;
      --blue: #3b82f6;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .muted { color: var(--text2); }

    /* ── Header ── */
    .header {
      padding: 20px 32px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg2);
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo { font-size: 22px; font-weight: 700; }
    .header-sub { color: var(--text2); font-size: 13px; }
    .header-meta { font-size: 12px; color: var(--text2); text-align: right; }
    .refresh-note { font-size: 11px; }

    /* ── Layout ── */
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 32px; }
    .section { margin-bottom: 36px; }
    .section-title {
      font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--text2);
      margin-bottom: 16px; padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    /* ── Summary cards ── */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
    }
    .summary-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
    }
    .summary-card .label { font-size: 12px; color: var(--text2); margin-bottom: 8px; }
    .summary-card .value { font-size: 28px; font-weight: 700; line-height: 1; }
    .summary-card .sub { font-size: 12px; color: var(--text2); margin-top: 4px; }

    /* ── Health ring ── */
    .health-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .health-ring {
      width: 60px; height: 60px;
      border-radius: 50%;
      border: 5px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700;
      flex-shrink: 0;
    }
    .health-info .label { font-size: 12px; color: var(--text2); margin-bottom: 4px; }
    .health-info .value { font-size: 20px; font-weight: 700; }
    .health-info .sub { font-size: 12px; color: var(--text2); margin-top: 2px; }

    /* ── Focus grid ── */
    .focus-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .focus-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .focus-card-header {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border);
    }
    .focus-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
    .focus-card-info { flex: 1; min-width: 0; }
    .focus-card-name { font-weight: 600; font-size: 14px; display: block; }
    .focus-freq { font-size: 11px; }
    .focus-card-status { font-size: 12px; white-space: nowrap; }
    .focus-card-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
    .focus-card-pr { font-size: 12px; }
    .pr-mini-link { display: flex; align-items: center; gap: 6px; color: var(--text2); }
    .pr-mini-link:hover { color: var(--text); }

    /* ── Status dots ── */
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
    .dot-green { background: var(--green); box-shadow: 0 0 6px var(--green); }
    .dot-red { background: var(--red); }
    .dot-gray { background: var(--text2); }
    .clean-label { color: var(--green); font-size: 13px; }
    .findings-count { color: var(--yellow); font-size: 13px; font-weight: 600; }

    /* ── Badges ── */
    .badge {
      display: inline-flex; align-items: center;
      padding: 2px 7px; border-radius: 4px;
      font-size: 11px; font-weight: 500;
    }
    .badge-merged { background: #14532d40; color: #4ade80; border: 1px solid #14532d80; }
    .badge-open { background: #1e3a5f40; color: #60a5fa; border: 1px solid #1e3a5f80; }
    .badge-closed { background: #3f3f4640; color: #9ca3af; border: 1px solid #3f3f4680; }

    .focus-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      border: 1px solid;
    }

    /* ── Timeline table ── */
    .timeline-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .timeline-table thead th {
      text-align: left;
      padding: 8px 12px;
      font-size: 11px; font-weight: 600; letter-spacing: 0.05em;
      text-transform: uppercase; color: var(--text2);
      border-bottom: 1px solid var(--border);
    }
    .timeline-row td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .timeline-row:last-child td { border-bottom: none; }
    .timeline-row:hover { background: var(--bg3); }
    .pr-link { font-weight: 600; }
    .stat-cell { font-size: 12px; white-space: nowrap; }
    .additions { color: var(--green); }
    .deletions { color: var(--red); }
    .table-wrapper {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }

    /* ── Findings ── */
    .findings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
    .finding-group {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .finding-focus-title {
      padding: 10px 14px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--text2);
      border-bottom: 1px solid var(--border);
      background: var(--bg3);
    }
    .finding-item {
      padding: 8px 14px;
      font-size: 12px; line-height: 1.5;
      border-bottom: 1px solid var(--border);
    }
    .finding-item:last-child { border-bottom: none; }
    .finding-error { border-left: 3px solid var(--red); }
    .finding-warn { border-left: 3px solid var(--yellow); }
    .empty-state {
      padding: 32px;
      text-align: center;
      color: var(--green);
      font-size: 15px;
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
    }

    /* ── Pending queue ── */
    .pending-box {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }
    .pending-item {
      padding: 6px 0;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    .pending-item:last-child { border-bottom: none; }
  </style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="header-logo">⬡ Dome</div>
    <div>
      <div style="font-weight:600">Audit Dashboard</div>
      <div class="header-sub">Automated code health monitoring</div>
    </div>
  </div>
  <div class="header-meta">
    <div>Generated: <strong>${GENERATED_AT}</strong></div>
    <div>Repo: <a href="https://github.com/${REPO_SLUG}" target="_blank">${REPO_SLUG}</a></div>
    <div class="refresh-note muted">Auto-refreshes every 5 min</div>
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
    <div class="section-title">Open Findings (${TOTAL_FINDINGS} total)</div>
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
