---
name: ppt-from-folder
description: "Create a PowerPoint from documents in a Dome folder or from an Excel resource — covers source extraction (folder docs OR .xlsx sheets) and then delegates to ppt-creator for the full PptxGenJS script + QA loop."
when_to_use: "User asks to create a presentation from documents in a folder, from an Excel file, or 'presentación con los documentos de [carpeta]' or 'PPT con datos de este Excel'."
paths:
  - "ppt"
  - "presentation"
  - "excel"
  - "presentación"
allowed-tools:
  - resource_get_library_overview
  - resource_list
  - resource_get
  - excel_get
  - excel_get_file_path
  - artifact_link_resource
  - ppt_create
  - ppt_get_slide_images
  - ppt_get_slides
---

# PPT from Folder / Excel

**MANDATORY FIRST STEP:** Call `load_skill('ppt-creator')` before doing anything else. That skill contains the full PptxGenJS script template, palette table, WCAG contrast rules, and visual QA loop you MUST follow. This skill adds only the source-extraction guidance on top.

---

## PHASE 0 — Detect source type

| Source | Detection | Tool |
|--------|-----------|------|
| **Dome folder** | User mentions a folder name or provides a folder link | `resource_get_library_overview` → `resource_list(folder_id)` → `resource_get(include_content: true)` |
| **Excel (.xlsx)** | User says "este Excel", "este archivo", provides a resource link to a spreadsheet | `excel_get(resource_id)` for each relevant sheet |
| **Mixed** | Both | Combine: folder docs + Excel sheets |

---

## PHASE 1A — Extracting content from a Dome folder

1. `resource_get_library_overview` — get the folder ID by name.
2. `resource_list(folder_id)` — list all files in the folder.
3. For each file: `resource_get(resource_id, include_content: true, max_content_length: 60_000)`.
4. Extract chapter titles, key terms, data points, quotes, and examples. **Never use placeholder text.**

---

## PHASE 1B — Extracting content from an Excel resource

1. `excel_get(resource_id)` **without** `sheet_name` first — this returns the list of all sheet names.
2. `excel_get(resource_id, sheet_name)` for each sheet that looks relevant (config/summary/main data sheets).
3. From each sheet extract:
   - **KPIs** — numeric totals, rates, percentages in named columns/rows.
   - **Categories** — distinct values in categorical columns (regions, levels, product names).
   - **Trends** — if there are time-series columns, note min/max/current.
4. Map to slides:

| Slide | Content from Excel |
|-------|-------------------|
| 2 | Top KPIs (3–6 metrics with values + units) |
| 3 | Category breakdown (table or bar chart description) |
| 4–N | Deep dives per category or region |
| N+1 | Insight / conclusions drawn from the numbers |

---

## PHASE 2 → PHASE 6

After extracting content from the folder or Excel, follow **ppt-creator** exactly:
- PHASE 2: Plan the slide outline.
- PHASE 3: Choose script mode (always prefer `script` with PptxGenJS).
- PHASE 4: Write the PptxGenJS script with real extracted content — no placeholders.
- PHASE 5: `ppt_create(title, script, sync: true)` → `ppt_get_slide_images` visual QA.
- PHASE 6: Report `dome://resource/RESOURCE_ID/ppt` link to the user.

---

## Hard constraints

- ❌ Never call `ppt_create` without first loading `ppt-creator` skill.
- ❌ Never call `ppt_create` without a `script` (PptxGenJS) or a `spec` with non-empty `slides` — it will return an error.
- ❌ Never use placeholder text on any slide.
- ❌ Never skip the `ppt_get_slide_images` QA step.
