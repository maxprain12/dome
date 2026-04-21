'use strict';

/**
 * @typedef {{ text: string, char_start: number, char_end: number }} TextChunk
 */

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', ' '];

/**
 * Character splitter with overlap (iterative, no deep recursion).
 * @param {string} text
 * @param {{ maxChars?: number, overlapChars?: number, separators?: string[] }} [opts]
 * @returns {TextChunk[]}
 */
function chunkText(text, opts = {}) {
  const maxChars = typeof opts.maxChars === 'number' ? opts.maxChars : 1800;
  const overlapChars = typeof opts.overlapChars === 'number' ? opts.overlapChars : 200;
  const separators = Array.isArray(opts.separators) ? opts.separators : DEFAULT_SEPARATORS;

  const full = String(text ?? '');
  if (!full.trim()) {
    return [];
  }

  /** @type {TextChunk[]} */
  const chunks = [];

  /**
   * @param {number} absStart inclusive index in `full`
   * @param {number} absEnd exclusive index in `full`
   */
  function pushSlice(absStart, absEnd) {
    const s = Math.max(0, absStart);
    const e = Math.min(full.length, absEnd);
    if (e <= s) return;
    const slice = full.slice(s, e);
    if (!slice.trim()) return;
    chunks.push({ text: slice, char_start: s, char_end: e });
  }

  let rs = 0;
  const re = full.length;
  let sepIdx = 0;
  const minProgress = Math.min(maxChars, overlapChars + 1);

  while (rs < re) {
    if (re - rs <= maxChars) {
      pushSlice(rs, re);
      break;
    }

    const sep = separators[sepIdx] ?? ' ';
    const winEnd = Math.min(rs + maxChars, re);
    const window = full.slice(rs, winEnd);

    let cut = -1;
    let pos = window.length;
    while (pos > 0) {
      const idx = window.lastIndexOf(sep, pos - 1);
      if (idx < 0) break;
      const absCut = rs + idx + sep.length;
      if (absCut > re) {
        pos = idx - 1;
        continue;
      }
      if (absCut - rs <= maxChars && absCut > rs) {
        if (absCut - rs >= minProgress) {
          cut = absCut;
          break;
        }
        pos = idx;
        continue;
      }
      pos = idx;
    }

    if (cut > rs) {
      pushSlice(rs, cut);
      rs = Math.max(cut - overlapChars, rs + 1);
      sepIdx = 0;
      continue;
    }

    if (sepIdx + 1 < separators.length) {
      sepIdx += 1;
      continue;
    }

    while (rs < re) {
      const end = Math.min(rs + maxChars, re);
      pushSlice(rs, end);
      rs = Math.max(end - overlapChars, rs + 1);
    }
    break;
  }

  return chunks;
}

/**
 * Assign page_number to each chunk from `<!-- page:N -->` markers in the full document (PDF Gemma transcripts).
 * @param {string} fullText
 * @param {{ text: string, char_start: number, char_end: number, page_number?: number | null }[]} chunks
 */
function assignPageNumbersFromMarkers(fullText, chunks) {
  const full = String(fullText ?? '');
  const re = /<!--\s*page:(\d+)\s*-->/g;
  /** @type {{ page: number, index: number }[]} */
  const markers = [];
  let m;
  while ((m = re.exec(full)) !== null) {
    markers.push({ page: parseInt(m[1], 10), index: m.index });
  }
  for (const ch of chunks) {
    let page = null;
    const start = typeof ch.char_start === 'number' ? ch.char_start : 0;
    for (let i = markers.length - 1; i >= 0; i--) {
      if (markers[i].index <= start) {
        page = markers[i].page;
        break;
      }
    }
    ch.page_number = page;
  }
  return chunks;
}

module.exports = {
  chunkText,
  assignPageNumbersFromMarkers,
};
