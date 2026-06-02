'use strict';

const { capToolResultString } = require('./tool-result-cap.cjs');
const { buildNativeContentBlocks, resolveModelCapabilities } = require('./message-multimodal.cjs');

/** Cap slide QA images per call — full deck base64 blows trim budget and empties history. */
const MAX_PPT_QA_SLIDES = 4;

/**
 * @param {unknown} result
 * @returns {Record<string, unknown> | null}
 */
function asObject(result) {
  if (result && typeof result === 'object' && !Array.isArray(result)) return result;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* not JSON */
    }
  }
  return null;
}

/**
 * Format tool output for the LLM — may return multimodal content blocks for vision tools.
 * @param {string} toolName
 * @param {unknown} rawResult
 * @param {{ provider?: string, modelId?: string }} [opts]
 * @returns {string | unknown[]}
 */
function formatToolResultForModel(toolName, rawResult, opts = {}) {
  const norm = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

  if (norm === 'ppt_get_slide_images') {
    const parsed = asObject(rawResult);
    if (parsed?.success && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
      const provider = String(opts.provider || 'openai').toLowerCase();
      const modelId = String(opts.modelId || '');
      const { supportsImage } = resolveModelCapabilities(provider, modelId);

      const slides = parsed.slides.slice(0, MAX_PPT_QA_SLIDES);
      const omitted = parsed.slides.length - slides.length;

      if (supportsImage) {
        const images = slides
          .map((slide) => {
            const b64 = slide?.image_base64 || slide?.imageBase64;
            if (!b64 || typeof b64 !== 'string') return null;
            return {
              dataUrl: b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`,
              name: `slide-${(slide.index ?? 0) + 1}`,
            };
          })
          .filter(Boolean);

        if (images.length > 0) {
          const textLines = [
            `Visual QA for presentation${parsed.resource_id ? ` (${parsed.resource_id})` : ''}: ${images.length} slide screenshot(s) attached.`,
            'Inspect each image for clipped text, overlap, low contrast, empty placeholders, and layout issues.',
          ];
          if (omitted > 0) {
            textLines.push(`(${omitted} additional slide(s) omitted — use ppt_get_slides for text-only QA if needed.)`);
          }
          return buildNativeContentBlocks({
            text: textLines.join('\n'),
            images,
            provider,
            modelId,
          });
        }
      }

      return JSON.stringify({
        success: true,
        resource_id: parsed.resource_id,
        slide_count: parsed.slides.length,
        note:
          'This model does not support vision. Use ppt_get_slides for text-based slide QA instead of image review.',
        slides: parsed.slides.map((s) => ({
          index: s.index,
          text_preview: typeof s.text === 'string' ? s.text.slice(0, 200) : undefined,
        })),
      });
    }
  }

  const text = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult ?? {});
  return capToolResultString(toolName, text);
}

/**
 * Compact tool result for UI streaming / logs (never ship full base64 blobs to the chat card).
 * @param {string} toolName
 * @param {unknown} rawResult
 * @returns {string}
 */
function summarizeToolResultForUi(toolName, rawResult) {
  const norm = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

  if (norm === 'ppt_get_slide_images') {
    const parsed = asObject(rawResult);
    if (parsed?.success && Array.isArray(parsed.slides)) {
      return JSON.stringify({
        success: true,
        resource_id: parsed.resource_id,
        slide_count: parsed.slides.length,
        slides: parsed.slides.map((s) => ({
          index: s.index,
          image_base64: `[${String(s.image_base64 || s.imageBase64 || '').length} chars — sent to model as vision]`,
        })),
        delivery: 'vision_blocks',
      });
    }
  }

  const text = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult ?? {});
  return capToolResultString(toolName, text);
}

/**
 * @param {string} toolName
 * @param {unknown} rawResult
 * @param {{ provider?: string, modelId?: string, onChunk?: Function, toolCallId?: string }} opts
 * @returns {string | unknown[]}
 */
function finalizeToolResult(toolName, rawResult, opts = {}) {
  const formatted = formatToolResultForModel(toolName, rawResult, opts);
  const uiText = summarizeToolResultForUi(toolName, rawResult);
  if (opts.onChunk && opts.toolCallId) {
    opts.onChunk({ type: 'tool_result', toolCallId: opts.toolCallId, result: uiText });
  }
  return formatted;
}

module.exports = {
  formatToolResultForModel,
  summarizeToolResultForUi,
  finalizeToolResult,
  MAX_PPT_QA_SLIDES,
};
