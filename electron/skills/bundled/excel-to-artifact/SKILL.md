---
name: excel-to-artifact
description: "Build a persisted interactive dashboard artifact from an Excel resource. Rows are loaded dynamically from DOME_DATA — never inlined as static HTML strings. Links the Excel so data refreshes automatically."
when_to_use: "User asks for a dashboard, panel, artefacto interactivo, or interactive artifact from an .xlsx or spreadsheet resource."
paths:
  - "artifact"
  - "dashboard"
  - "excel"
  - "panel"
  - "artefacto"
allowed-tools:
  - excel_get
  - artifact_create
  - artifact_link_resource
  - artifact_merge_data
  - dome_load_doc
---

# Excel → Interactive Artifact

Build a self-contained dashboard artifact whose data comes from an Excel resource and persists cleanly across sessions.

---

## PHASE 1 — Load design docs (MANDATORY)

Call **both** docs before creating anything:

1. `dome_load_doc('artifact_design')` — Dome design system: CSS variable tokens, SVG-only icon rules, and the decision between `artifact_design` tool vs custom HTML.
2. `dome_load_doc('artifact_persisted')` — iframe contract (`window.DOME_DATA`, `__dome_updateState`) and the `artifact_link_resource` pattern.

Then decide the design path based on what the user needs:

| Artifact kind | Design path |
|---|---|
| **Structured summary** (KPI cards, text sections, tables-only, multi-tab report from Excel) | Call `artifact_design` tool with a `spec` → use the returned `html` + `data` in `artifact_create`. |
| **Interactive dashboard** (filterable table, chart with controls, editable form) | Write custom HTML that reads `window.DOME_DATA.rows` + calls `__dome_updateState`, using only Dome CSS variables and inline SVG icons. |

When in doubt, prefer the **interactive** path for Excel data — users typically want to filter and explore rows.

---

## PHASE 2 — Read the Excel schema

```
excel_get(resource_id)                         // no sheet_name → returns all sheet names
excel_get(resource_id, sheet_name)             // for each relevant sheet
```

From each sheet, extract:
- **Column names** (first row, typically the header).
- **Top 50 rows** of actual data (for `state.data` seed — not for inlining in HTML).
- **KPI values** — numeric totals, averages, rates visible in summary rows or dedicated columns.
- **Categories** — distinct values in categorical columns (use first sheet if none stands out).

Repeat for up to 3 sheets. If there are more, ask the user which sheets matter most.

---

## PHASE 3 — Create the artifact

### HTML template rules

- Keep the HTML compact (< 150 lines). **Never paste thousands of rows as static strings.**
- Read data from `window.DOME_DATA` (injected before your script runs); render it in a `<table>` or Chart.js `<canvas>`.
- After every user change (filter input, toggle, etc.) call `window.__dome_updateState({ ...window.DOME_DATA, yourKey: value })`.
- Use Dome CSS variables (`--bg`, `--bg-secondary`, `--primary-text`, `--accent`, `--border`) for all colors — no hardcoded hex.
- No remote assets, no `fetch`, no `localStorage` (Dome injects a shim but don't rely on it for real data).

### Minimal starter template

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Excel Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: sans-serif; font-size: 13px; background: var(--bg); color: var(--primary-text); padding: 16px; }
  h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--primary-text); }
  .kpis { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .kpi { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; min-width: 120px; }
  .kpi-label { font-size: 11px; color: var(--secondary-text); margin-bottom: 4px; }
  .kpi-value { font-size: 22px; font-weight: 700; color: var(--accent); }
  .filter-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
  input.filter { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-tertiary); color: var(--primary-text); font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px; background: var(--bg-secondary); border-bottom: 2px solid var(--border); font-size: 12px; font-weight: 600; }
  td { padding: 7px 8px; border-bottom: 1px solid var(--border); font-size: 12px; }
  tr:hover td { background: var(--bg-hover); }
</style>
</head>
<body>
<h2 id="title">Dashboard</h2>
<div class="kpis" id="kpi-row"></div>
<div class="filter-row">
  <input class="filter" id="filter-input" placeholder="Filter rows…" oninput="applyFilter()">
</div>
<table><thead id="thead"></thead><tbody id="tbody"></tbody></table>

<script>
// Dome injects window.DOME_DATA before this script runs.
const D = window.DOME_DATA || { rows: [], columns: [], kpis: {}, filter: '' };

function init() {
  document.getElementById('title').textContent = D.title || 'Dashboard';
  document.getElementById('filter-input').value = D.filter || '';

  // KPI cards
  const kpiRow = document.getElementById('kpi-row');
  Object.entries(D.kpis || {}).forEach(([label, value]) => {
    kpiRow.innerHTML += `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`;
  });

  // Table header
  const cols = D.columns || (D.rows[0] ? Object.keys(D.rows[0]) : []);
  document.getElementById('thead').innerHTML =
    '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';

  applyFilter();
}

function applyFilter() {
  const q = (document.getElementById('filter-input').value || '').toLowerCase();
  const cols = D.columns || (D.rows[0] ? Object.keys(D.rows[0]) : []);
  const filtered = q
    ? (D.rows || []).filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)))
    : (D.rows || []);

  document.getElementById('tbody').innerHTML = filtered
    .map(r => '<tr>' + cols.map(c => `<td>${r[c] ?? ''}</td>`).join('') + '</tr>')
    .join('');

  // Persist filter across sessions
  if (window.__dome_updateState) {
    window.__dome_updateState({ ...D, filter: document.getElementById('filter-input').value });
  }
}

init();
</script>
</body>
</html>
```

### Call `artifact_create`

```json
{
  "artifact_type": "custom",
  "html": "<the template above with your column/KPI values>",
  "data": {
    "title": "Your Dashboard Title",
    "columns": ["Col A", "Col B", "Col C"],
    "rows": [ ...first 50 rows from excel_get... ],
    "kpis": { "Total": "1,234", "Average": "56.7" },
    "filter": ""
  }
}
```

`title` is optional — Dome derives it from the HTML `<title>` tag if omitted.

---

## PHASE 4 — Link the Excel resource

```
artifact_link_resource(artifactResourceId, excelResourceId)
```

This binds the Excel to the artifact. On every open, Dome populates `state.linkedData` with the current spreadsheet data so the artifact stays fresh without re-running any tool. Use `linkedData` for read-only display; use `state.data` for user edits and filters.

---

## PHASE 5 — Report

Include the clickable link:

```
✅ Artifact created: **[Dashboard Title](dome://resource/RESOURCE_ID/custom)**
Linked to Excel — data refreshes automatically when the spreadsheet is updated.
```

---

## Hard constraints

- ❌ Never inline thousands of rows as static HTML strings — use `data.rows` + JS rendering.
- ❌ Never use `fetch`, remote CDNs, or `localStorage` for persistence.
- ❌ Never skip `artifact_link_resource` when an Excel is the source.
- ❌ Never call `artifact_create` without first calling `dome_load_doc('artifact_persisted')`.
