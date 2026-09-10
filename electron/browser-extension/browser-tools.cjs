'use strict';

const { z } = require('zod');
const empty = z.object({});
const target = { snapshotId: z.string().max(80), elementId: z.string().max(20) };
const definitions = [
  ['browser_read_page', 'Read the controlled browser tab and obtain fresh visible element IDs before interacting.', empty],
  ['browser_navigate', 'Navigate the controlled tab to an HTTP(S) URL. The extension handles site access.', z.object({ url: z.string().url().max(4000) })],
  ['browser_go_back', 'Go back in the controlled tab history.', empty],
  ['browser_click', 'Click a visible element from the latest page snapshot. The user reviews clicks before execution.', z.object(target)],
  ['browser_fill', 'Fill a non-sensitive input from the latest snapshot. Does not submit the form. User reviews the value.', z.object({ ...target, value: z.string().max(10000) })],
  ['browser_scroll', 'Scroll the controlled page.', z.object({ direction: z.enum(['up', 'down', 'top']) })],
  ['browser_find', 'Find and select literal text on the controlled page.', z.object({ text: z.string().min(1).max(200) })],
  ['browser_extract_contact', 'Extract published profile facts from the current LinkedIn, GitHub, X, Instagram or Person page. Never infer missing facts.', empty],
  ['dome_capture_page', 'Save the current page and its readable text in the selected Dome project.', empty],
  ['dome_list_notes', 'List notes in the selected Dome project.', empty],
  ['dome_read_note', 'Read a note in the selected Dome project.', z.object({ noteId: z.string().min(1).max(120) })],
  ['dome_create_note', 'Create a Markdown note in the selected project. Preserve citations from source pages.', z.object({ title: z.string().min(1).max(200), markdown: z.string().max(100000) })],
  ['dome_append_note', 'Append Markdown to an existing project note, preserving its content and checking its revision.', z.object({ noteId: z.string().min(1).max(120), markdown: z.string().min(1).max(100000) })],
  ['dome_save_contact', 'Save the actual detected profile from the current page in Dome. Read browser_extract_contact first. Optional notes must be factual.', z.object({ notes: z.string().max(4000).optional() })],
];

function createBrowserTools(request) {
  return definitions.map(([name, description, schema]) => ({
    name, label: name, description,
    parameters: z.toJSONSchema(schema),
    async execute(_toolCallId, args, signal) {
      const checked = schema.parse(args);
      const result = await request(name, checked, signal);
      return { content: [{ type: 'text', text: JSON.stringify(result).slice(0, 100000) }], details: { browserTool: name } };
    },
  }));
}
module.exports = { createBrowserTools };
