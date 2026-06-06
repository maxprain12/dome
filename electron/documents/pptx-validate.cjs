'use strict';
/**
 * PPTX integrity helpers — slide counts and minimum validation.
 */
const JSZip = require('jszip');

const SLIDE_PATH = /^ppt\/slides\/slide\d+\.xml$/i;

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<number>}
 */
async function countSlidesInBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files).filter((p) => SLIDE_PATH.test(p)).length;
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} buffer
 * @param {{ minSlides?: number }} [opts]
 * @returns {Promise<{ ok: boolean; slideCount: number; error?: string }>}
 */
async function validatePptxBuffer(buffer, opts = {}) {
  const minSlides = opts.minSlides ?? 1;
  let slideCount = 0;
  try {
    slideCount = await countSlidesInBuffer(buffer);
  } catch (err) {
    return {
      ok: false,
      slideCount: 0,
      error: err?.message || 'Invalid PPTX archive',
    };
  }

  if (slideCount < minSlides) {
    return {
      ok: false,
      slideCount,
      error:
        slideCount === 0
          ? 'PPTX has no slides (empty presentation). The agent script must call addSlide() for each slide and write to PPTX_OUTPUT_PATH.'
          : `PPTX has ${slideCount} slide(s); expected at least ${minSlides}.`,
    };
  }

  return { ok: true, slideCount };
}

module.exports = { countSlidesInBuffer, validatePptxBuffer };
