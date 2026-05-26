'use strict';

/**
 * @typedef {{ text: string, char_start: number, char_end: number }} TextChunk
 */

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', ' '];

/** @type {import('@langchain/textsplitters').RecursiveCharacterTextSplitter | null} */
let _splitterCtor = null;

/**
 * @returns {Promise<typeof import('@langchain/textsplitters').RecursiveCharacterTextSplitter>}
 */
async function getRecursiveSplitterCtor() {
  if (_splitterCtor) return _splitterCtor;
  try {
    const mod = await import('@langchain/textsplitters');
    _splitterCtor = mod.RecursiveCharacterTextSplitter;
    return _splitterCtor;
  } catch (err) {
    console.warn('[chunking] @langchain/textsplitters unavailable, using local splitter', err?.message || err);
    return null;
  }
}

/**
 * @param {string} full
 * @param {string[]} parts
 * @returns {TextChunk[]}
 */
function mapPartsToChunks(full, parts) {
  /** @type {TextChunk[]} */
  const chunks = [];
  let searchFrom = 0;
  for (const part of parts) {
    const trimmed = String(part ?? '');
    if (!trimmed.trim()) continue;
    let idx = full.indexOf(trimmed, searchFrom);
    if (idx < 0) idx = full.indexOf(trimmed);
    if (idx < 0) {
      chunks.push({ text: trimmed, char_start: searchFrom, char_end: searchFrom + trimmed.length });
      searchFrom += trimmed.length;
      continue;
    }
    chunks.push({ text: trimmed, char_start: idx, char_end: idx + trimmed.length });
    searchFrom = idx + trimmed.length;
  }
  return chunks;
}

/**
 * Adaptive embedding chunks sized to model context window.
 * @param {string} text
 * @param {{ contextTokens?: number, charsPerToken?: number, safetyFactor?: number, overlapRatio?: number }} [opts]
 * @returns {Promise<TextChunk[]>}
 */
async function chunkTextForEmbeddings(text, opts = {}) {
  const contextTokens = typeof opts.contextTokens === 'number' && opts.contextTokens > 0 ? opts.contextTokens : 384;
  const charsPerToken = typeof opts.charsPerToken === 'number' ? opts.charsPerToken : 3.3;
  const safetyFactor = typeof opts.safetyFactor === 'number' ? opts.safetyFactor : 0.8;
  const overlapRatio = typeof opts.overlapRatio === 'number' ? opts.overlapRatio : 0.12;

  const maxChars = Math.max(256, Math.floor(contextTokens * charsPerToken * safetyFactor));
  const overlapChars = Math.max(32, Math.floor(maxChars * overlapRatio));

  const full = String(text ?? '');
  if (!full.trim()) return [];

  const Splitter = await getRecursiveSplitterCtor();
  if (Splitter) {
    const splitter = new Splitter({
      chunkSize: maxChars,
      chunkOverlap: overlapChars,
      separators: DEFAULT_SEPARATORS,
    });
    const parts = await splitter.splitText(full);
    return mapPartsToChunks(full, parts);
  }

  return chunkText(full, { maxChars, overlapChars, separators: DEFAULT_SEPARATORS });
}

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
  chunkTextForEmbeddings,
  assignPageNumbersFromMarkers,
};
