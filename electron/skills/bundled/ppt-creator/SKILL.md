---
name: ppt-creator
description: "Create professional PowerPoint presentations (.pptx) with PptxGenJS scripts, visual QA via slide screenshots, and import only after quality is confirmed."
when_to_use: "User asks to create a presentation, slides, PPT, PPTX, or 'haz una presentación sobre X', from any source: topic, text, folder documents, or library search."
paths:
  - "ppt"
  - "presentation"
  - "slides"
  - "powerpoint"
  - "presentación"
allowed-tools:
  - ppt_create
  - ppt_get_slide_images
  - ppt_get_slides
  - resource_get_library_overview
  - resource_list
  - resource_get
  - resource_hybrid_search
---

# Presentation Designer

You create professional `.pptx` files using the `ppt_create → ppt_get_slide_images` quality loop.
**`ppt_create` stages the file in a secure sandbox, validates its integrity, and only then imports it to the library.** Your job is to also do a visual QA pass before telling the user the presentation is ready.

---

## PHASE 1 — Gather content

**A. Topic / text provided by user**
Extract key concepts, definitions, facts, and structure directly from what the user gives you.

**B. From a Dome folder**
1. `resource_get_library_overview` → get folder ID by name.
2. `resource_list` with `folder_id` → list files.
3. `resource_get` (`include_content: true`, `max_content_length: 60000`) for each PDF/note.
4. Extract chapter titles, key terms, data, quotes, examples — **never use placeholder text**.

**C. From the whole library**
Use `resource_hybrid_search` to retrieve the most relevant passages for the topic.

**Rule**: every bullet point on every slide must contain real extracted content, not filler.

---

## PHASE 2 — Plan the deck (do this before calling ppt_create)

Draft the slide outline in your thinking:

| Slide | Purpose | Main content |
|-------|---------|-------------|
| 1 | Cover | Title + subtitle / author |
| 2 | Agenda | 3–5 section names |
| 3–N | Body | One idea per slide, ≤ 6 bullets |
| N+1 | Data | If metrics exist, add a chart |
| Last | Closing | 3 takeaways + call to action |

Typical deck: 8–14 slides. Never fewer than 6. Never more than 20 unless explicitly requested.

---

## PHASE 3 — Choose mode

| Mode | When |
|------|------|
| `script` (PptxGenJS) | **Always preferred** — use for any deck the user will share |
| `spec` (JSON) | Only for instant, disposable draft with no design |

Default to `script` for any deck that matters.

---

## PHASE 4 — Write the PptxGenJS script

### Mandatory rules

0. **Script size: keep under 10 KB** (~10,000 characters). Scripts larger than this frequently get truncated mid-generation and cause `SyntaxError: Unexpected end of input`. To stay under the limit:
   - Extract repeated elements into helper functions (`bar(slide)`, `title(slide, text)`, `bullets(slide, items)`).
   - Write 8–12 slides maximum unless explicitly asked for more.
   - Prefer concise bullet arrays over multi-line `addText` chains.
   - Mentally validate before calling `ppt_create`: does the script end with `await pres.writeFile(...)`? Are all `{` balanced with `}`? If the script feels long, cut a slide.
1. `const pptxgen = require('pptxgenjs'); const pres = new pptxgen();`
2. `pres.layout = 'LAYOUT_16x9';` — all coordinates in inches (canvas: 10 × 5.625).
3. Set `slide.background = { color: 'RRGGBB' }` on **every** slide (no `#`).
4. Add a **repeating accent bar** on every slide — thin left-edge rect for brand consistency:
   ```javascript
   slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 5.625, fill: { color: ACCENT } });
   ```
5. Alternate dark and light backgrounds across slides (cover + closing = dark; body slides = light or dark alternating).
6. **Never** repeat the same visual layout on consecutive slides.
7. End every script with: `await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });`
8. Use `require` not `import`. Python/python-pptx is not supported — it will fail.

### Contrast (WCAG AA — non-negotiable)

| Background | Text colors |
|------------|-------------|
| Dark (< 50% brightness): `0D1B2A`, `1A1A1A`, `022C22`, `0F1419` | `FFFFFF`, `E0E1DD`, `F5F5F5`, `CADCFC` |
| Light: `FFFFFF`, `F5F7FA`, `F8FAFC`, `ECFDF5` | `0D1B2A`, `1A1A1A`, `2D3748`, `36454F` |

Never put light text on a light background or dark text on a dark background.

### Choose a palette for the topic

| Topic | Dark BG | Accent | Light BG | Body on dark |
|-------|---------|--------|----------|--------------|
| Business / corporate | `0D1B2A` | `415A77` | `F5F7FA` | `E0E1DD` |
| Technology / data | `0F1419` | `58A6FF` | `EFF6FF` | `E6EDF3` |
| Sustainability | `1A2F1A` | `4CAF50` | `E8F5E9` | `C8E6C9` |
| Marketing / creative | `2D1B0E` | `E07C5C` | `FFFFFF` | `FFE4C4` |
| Academic / research | `1E293B` | `4472C4` | `F8FAFC` | `CBD5E1` |
| Finance / investment | `022C22` | `10B981` | `ECFDF5` | `A7F3D0` |
| Healthcare | `0A1628` | `38BDF8` | `F0FAFF` | `BAE6FD` |

### Typography

- Slide title: 28–40 pt, bold.
- Body text / bullets: 13–18 pt, regular.
- Caption / label: 10–12 pt.
- Maximum 6 bullet points per slide. One idea per slide.

### Script starter template

```javascript
const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.title = 'TITLE';

// Palette
const C = {
  bg:      '0D1B2A',  // dark background
  bgLight: 'F5F7FA',  // light background
  accent:  '415A77',  // accent bar + shapes
  title:   'FFFFFF',  // text on dark
  body:    'E0E1DD',  // body text on dark
  dark:    '0D1B2A',  // text on light
};

function bar(slide, color) {
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: 5.625,
    fill: { color: color || C.accent },
  });
}

// SLIDE 1: Cover
const s1 = pres.addSlide();
s1.background = { color: C.bg };
bar(s1);
s1.addText('PRESENTATION TITLE', {
  x: 0.4, y: 1.7, w: 9.2, h: 1.3, fontSize: 40, bold: true, color: C.title,
});
s1.addText('Subtitle · Author · Date', {
  x: 0.4, y: 3.1, w: 9.2, h: 0.7, fontSize: 18, color: C.body,
});

// SLIDE 2: Agenda
const s2 = pres.addSlide();
s2.background = { color: C.bgLight };
bar(s2);
s2.addText('Agenda', {
  x: 0.4, y: 0.25, w: 9, h: 0.8, fontSize: 32, bold: true, color: C.dark,
});
s2.addText(
  ['Section A', 'Section B', 'Section C'].map(t => ({
    text: t,
    options: { bullet: { type: 'number' }, breakLine: true },
  })),
  { x: 0.6, y: 1.3, w: 8.8, h: 3.5, fontSize: 18, color: C.dark },
);

// SLIDE 3: Content (dark variant)
const s3 = pres.addSlide();
s3.background = { color: C.bg };
bar(s3);
s3.addText('Key concept', {
  x: 0.4, y: 0.25, w: 9, h: 0.8, fontSize: 32, bold: true, color: C.title,
});
s3.addText(
  [
    { text: 'Point from source A', options: { bullet: true, breakLine: true } },
    { text: 'Point from source B', options: { bullet: true, breakLine: true } },
    { text: 'Point from source C', options: { bullet: true } },
  ],
  { x: 0.6, y: 1.3, w: 8.8, h: 3.8, fontSize: 16, color: C.body },
);

// ... build all planned slides with real content ...

// LAST SLIDE: Closing
const sN = pres.addSlide();
sN.background = { color: C.bg };
bar(sN);
sN.addText('Thank you', {
  x: 0.4, y: 2.0, w: 9.2, h: 1.0, fontSize: 40, bold: true, color: C.title,
});
sN.addText('Key takeaway or contact info', {
  x: 0.4, y: 3.2, w: 9.2, h: 0.7, fontSize: 18, color: C.body,
});

await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });
```

---

## PHASE 5 — Create with sync and run visual QA

```
ppt_create(title, script=<your script>, sync=true, project_id, folder_id?)
```

- `sync: true` blocks until the file is generated.
- On `success: true`: **immediately call `ppt_get_slide_images(resource_id)`**.
- The file is already in the library — your visual review decides whether to keep it or create a corrected version.

### What to inspect in each slide image

| Issue | Severity | Fix |
|-------|----------|-----|
| Text clipped / cut off at edges | 🔴 Critical | Reduce `w`/`h` area or font size |
| Overlapping text/shapes | 🔴 Critical | Adjust `x`/`y` or `h` |
| Empty slide (no visible content) | 🔴 Critical | Recheck script: inject real content |
| Text unreadable (contrast failure) | 🔴 Critical | Fix colors per WCAG rules above |
| Placeholder / `[...]` text visible | 🔴 Critical | Replace with extracted content |
| All slides look identical | 🟡 High | Vary background dark/light, adjust composition |
| Slide too dense (wall of text) | 🟡 High | Split into two slides |
| Missing accent bar | 🟠 Medium | Add `bar(slide)` call |
| Font too small (< 13pt for body) | 🟠 Medium | Increase font size |

**If ≥ 1 🔴 issue found**: fix the script and call `ppt_create` again (this creates a new resource; the user can discard the first). Max 2 correction rounds.

**If only 🟡/🟠 issues**: use judgment — fix if easy, otherwise report the minor issue to the user.

**If all slides pass QA**: proceed to Phase 6.

---

## PHASE 6 — Report to user

```
✅ Presentation ready: **[Presentation Title](dome://resource/RESOURCE_ID/ppt)**
- 12 slides · Technology / data theme
- Covers: Introduction, Key Findings, Data Analysis, Conclusions
```

If a correction round was needed: "One visual revision was applied to fix [specific issue]."

If `ppt_create` returned `status: "generating"` (async mode): "Your presentation is being generated in the background (1–4 min). You'll be notified when it's ready — do not re-submit."

---

## Error handling

| Error | Action |
|-------|--------|
| `folder_id invalid or not a folder` | Retry without `folder_id`; tell user to move it manually |
| Script syntax / runtime error | Fix the JavaScript and retry once |
| `ppt_get_slide_images` fails | Use `ppt_get_slides` for text-based QA instead |
| Python/python-pptx detected | Rewrite entirely using `require('pptxgenjs')` |
| Empty `result.buffer` | The spec has no slides — build at least one slide and retry |

---

## Hard constraints — never break these

- ❌ Never call `ppt_create` more than once without a confirmed `success: false` on the previous call.
- ❌ Never use `resource_create` for presentations — always `ppt_create`.
- ❌ Never leave any slide with empty title, blank bullets, or placeholder text.
- ❌ Never use `import` syntax in the script (CommonJS only: `require`).
- ❌ Never hardcode the output path — always `process.env.PPTX_OUTPUT_PATH`.
- ❌ Never skip the `ppt_get_slide_images` visual QA step when `sync: true` was used.
