'use strict';

const { z } = require('zod');

const empty = z.object({});
const target = { snapshotId: z.string().max(80), elementId: z.string().max(20) };
const IMAGE_DATA_URL_RE =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

const definitions = [
  [
    'browser_read_page',
    'Read the controlled tab: visible text, headings, profile sections, and element IDs. Call this before acting. After scroll/find/click the other browser tools already return a fresh snapshot. Set includeScreenshot when you need the current viewport as an image.',
    z.object({ includeScreenshot: z.boolean().optional() }),
  ],
  [
    'browser_screenshot',
    'Capture the visible tab viewport as an image. Use when text extraction missed layout, cards, or a profile section that is on screen.',
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
    'Fill a non-sensitive input from the latest snapshot. Does not submit the form. User reviews the value.',
    z.object({ ...target, value: z.string().max(10000) }),
  ],
  [
    'browser_scroll',
    'Scroll the controlled page and return a fresh snapshot (text + headings + extracted profile). Use headingText to jump to a section such as Experiencia or Educación. Lazy-loaded profiles only fill those sections after they are scrolled into view.',
    z.object({
      direction: z.enum(['up', 'down', 'top']).default('down'),
      headingText: z.string().min(1).max(200).optional(),
    }),
  ],
  [
    'browser_find',
    'Find literal text on the controlled page, scroll it into view, and return a fresh snapshot.',
    z.object({ text: z.string().min(1).max(200) }),
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
        if (name === 'browser_read_page' && supportsVision === false) {
          checked.includeScreenshot = false;
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
          text: JSON.stringify(payload).slice(0, 100000),
        }];
        if (supportsVision && image) {
          content.push({ type: 'image', mimeType: image.mimeType, data: image.data });
        }
        return { content, details: { browserTool: name } };
      },
    }));
}

module.exports = { createBrowserTools, parseScreenshot, splitScreenshot };
