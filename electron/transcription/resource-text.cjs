'use strict';

const TITLE_MAX = 60;

function parseMetadata(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Title from the first words of the transcript; falls back to a locale-formatted timestamp. */
function deriveTitle(text, now = new Date()) {
  const cleaned = String(text || '').replaceAll(/\s+/g, ' ').trim();
  if (!cleaned) return now.toLocaleString();
  const slice = cleaned.slice(0, TITLE_MAX);
  return slice + (cleaned.length > TITLE_MAX ? '…' : '');
}

module.exports = { parseMetadata, deriveTitle };
