'use strict';

const { z } = require('zod');

const empty = z.object({});
const target = {
  snapshotId: z.string().min(1).max(80).describe('snapshotId from the most recent browser snapshot'),
  elementId: z.string().min(1).max(20).describe('Exact element id from that snapshot; never invent IDs'),
};
const IMAGE_DATA_URL_RE =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

const definitions = [
  [
    'browser_read_page',
    'Read the controlled tab now. Returns capturedAt, viewportText (on screen), readableText (rendered document, possibly offscreen), tables, limitations and fresh element IDs. Includes accessible same-origin frames and open shadow roots. Read before acting; never treat an unchanged URL or notification badge as proof the view is unchanged. Vision models include a viewport screenshot by default to ground charts/canvas and inaccessible frames; set includeScreenshot=false for a text-only read. Screenshot failure is explicit and does not discard the DOM snapshot.',
    z.object({ includeScreenshot: z.boolean().optional() }),
  ],
  [
    'browser_screenshot',
    'Capture the controlled tab viewport as an image and return a fresh page snapshot with new element references. Use when text extraction missed layout, cards, or a profile section that is on screen.',
    empty,
  ],
  [
    'browser_navigate',
    'Navigate the controlled tab to an HTTP(S) URL, wait for load, and return a fresh page snapshot. The extension handles site access.',
    z.object({ url: z.string().url().max(4000) }),
  ],
  [
    'browser_go_back',
    'Go back in the controlled tab history and return a fresh page snapshot.',
    empty,
  ],
  [
    'browser_click',
    'Click a visible element from the latest page snapshot, then return a fresh snapshot. The user reviews clicks before execution.',
    z.object(target),
  ],
  [
    'browser_fill',
    'Replace a non-sensitive input value from the latest snapshot and return a fresh snapshot. Does not press Enter or submit; site input/change handlers may react. User reviews the value. Passwords, payment credentials and one-time codes are excluded.',
    z.object({ ...target, value: z.string().max(10000) }),
  ],
  [
    'browser_scroll',
    'Scroll the controlled page and return a fresh snapshot. For a nested dashboard panel, pass BOTH snapshotId and elementId of a scrollable element. Otherwise scrolls the window. Use headingText to jump to a section such as Experiencia or Educación. Lazy-loaded profiles only fill those sections after they are scrolled into view.',
    z.object({
      direction: z.enum(['up', 'down', 'top', 'bottom']).default('down'),
      headingText: z.string().min(1).max(200).optional(),
      snapshotId: target.snapshotId.optional(),
      elementId: target.elementId.optional(),
    }),
  ],
  [
    'browser_find',
    'Find literal text on the controlled page, scroll it into view, and return a fresh snapshot.',
    z.object({ text: z.string().min(1).max(200) }),
  ],
  [
    'browser_select',
    'Select one option in a native select from the latest snapshot. Use the exact options[].value. User reviews the option. Returns a fresh snapshot; change handlers may update the page. For custom dropdowns use browser_click on their observed controls.',
    z.object({ ...target, value: z.string().max(1000) }),
  ],
  [
    'browser_wait',
    'Wait up to timeoutMs for literal rendered page text after an asynchronous update, then return a fresh snapshot. Failure means the text was not observed within the bound; do not claim the requested state was reached.',
    z.object({ text: z.string().min(1).max(200), timeoutMs: z.number().int().min(250).max(10000).default(5000) }),
  ],
  [
    'browser_extract_contact',
    'Extract published profile facts from the current LinkedIn, GitHub, X, Instagram or Person page. Never infer missing facts. If experience/about/education are empty, scroll those headings and extract again before saving.',
    empty,
  ],
  [
    'dome_capture_page',
    'Save the current page and its readable text in the selected Dome project.',
    empty,
  ],
  [
    'dome_list_notes',
    'List notes in the selected Dome project.',
    empty,
  ],
  [
    'dome_read_note',
    'Read a note in the selected Dome project.',
    z.object({ noteId: z.string().min(1).max(120) }),
  ],
  [
    'dome_create_note',
    'Create a Markdown note in the selected project. Preserve citations from source pages.',
    z.object({ title: z.string().min(1).max(200), markdown: z.string().max(100000) }),
  ],
  [
    'dome_append_note',
    'Append Markdown to an existing project note, preserving its content and checking its revision.',
    z.object({
      noteId: z.string().min(1).max(120),
      markdown: z.string().min(1).max(100000),
    }),
  ],
  [
    'dome_save_contact',
    'Save the actual detected profile from the current page in Dome. Read browser_extract_contact first and only save when headline or experience/about is present. Optional notes must be factual.',
    z.object({ notes: z.string().max(4000).optional() }),
  ],
];

function parseScreenshot(value) {
  if (typeof value !== 'string') return null;
  const match = IMAGE_DATA_URL_RE.exec(value);
  if (!match) return null;
  return { mimeType: match[1], data: match[2].replace(/\s/g, '') };
}

function splitScreenshot(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { payload: result, image: null };
  }
  const payload = { ...result };
  let dataUrl = typeof payload.screenshot === 'string' ? payload.screenshot : null;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    payload.data = { ...payload.data };
    if (typeof payload.data.screenshot === 'string') {
      dataUrl = payload.data.screenshot;
      delete payload.data.screenshot;
      payload.data.screenshotIncluded = true;
    }
  }
  if (typeof payload.screenshot === 'string') delete payload.screenshot;
  return { payload, image: parseScreenshot(dataUrl) };
}

// Preserve valid JSON and target IDs even when a large dashboard exceeds the text budget.
function serializeResult(payload) {
  const bounded = JSON.parse(JSON.stringify(payload ?? null));
  let text = JSON.stringify(bounded);
  const data = bounded?.data;
  if (text.length > 100000 && data && typeof data === 'object') {
    data.truncated = true;
    for (const field of ['readableText', 'viewportText']) {
      if (typeof data[field] === 'string') data[field] = data[field].slice(0, 12000);
    }
    text = JSON.stringify(bounded);
    for (const field of ['sections', 'tables', 'headings', 'elements']) {
      while (Array.isArray(data[field]) && data[field].length > 0 && text.length > 95000) {
        data[field].pop();
        text = JSON.stringify(bounded);
      }
    }
    text = JSON.stringify(bounded);
  }
  if (text.length <= 100000) return text;
  return JSON.stringify({ success: bounded?.success !== false, truncated: true, preview: text.slice(0, 20000) });
}

function createBrowserTools(request, opts = {}) {
  const supportsVision = Boolean(opts.supportsVision);
  return definitions
    .filter(([name]) => supportsVision || name !== 'browser_screenshot')
    .map(([name, description, schema]) => ({
      name,
      label: name,
      description,
      parameters: z.toJSONSchema(schema),
      async execute(_toolCallId, args, signal) {
        const checked = {
          ...schema.parse(args && typeof args === 'object' ? args : {}),
        };
        if (name === 'browser_read_page') {
          checked.includeScreenshot = supportsVision && checked.includeScreenshot !== false;
        }
        if (name === 'browser_screenshot' && supportsVision === false) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Current model has no vision. Use browser_read_page.',
              }),
            }],
            details: { browserTool: name },
          };
        }
        const result = await request(name, checked, signal);
        const { payload, image } = splitScreenshot(result);
        const content = [{
          type: 'text',
          text: serializeResult(payload),
        }];
        if (supportsVision && image) {
          content.push({ type: 'image', mimeType: image.mimeType, data: image.data });
        }
        return { content, isError: payload?.success === false, details: { browserTool: name } };
      },
    }));
}

module.exports = { createBrowserTools, parseScreenshot, splitScreenshot, serializeResult };
