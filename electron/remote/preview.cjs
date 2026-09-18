'use strict';

const { publicLabel, looksOpaque } = require('./refs.cjs');

const MAX_EXCERPT = 1200;
const MAX_SLIDE_EXCERPT = 160;
const MAX_SLIDES = 12;
const MAX_TITLE = 72;

function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function resourceKind(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'ppt' || normalized === 'pptx' || normalized === 'presentation') return 'ppt';
  if (normalized === 'note' || normalized === 'md' || normalized === 'markdown') return 'note';
  if (normalized === 'pdf') return 'pdf';
  if (['image', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'photo'].includes(normalized)) return 'image';
  if (['audio', 'mp3', 'm4a', 'wav'].includes(normalized)) return 'audio';
  if (['video', 'mp4', 'mov'].includes(normalized)) return 'video';
  if (['excel', 'xlsx', 'xls', 'csv', 'sheet', 'spreadsheet'].includes(normalized)) return 'excel';
  if (normalized === 'docx' || normalized === 'doc') return 'docx';
  return 'resource';
}

function linesFromSlideText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function formatPptSlides(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_SLIDES).map((row, index) => {
    const n = index + 1;
    const explicit = publicLabel(row?.title || row?.heading || row?.name, '');
    const lines = linesFromSlideText(row?.text || row?.content || row?.body || '');
    let title = explicit;
    let bodyLines = lines;
    if (!title && lines[0] && lines[0].length <= MAX_TITLE) {
      title = publicLabel(lines[0], '');
      bodyLines = lines.slice(1);
    }
    if (!title) title = `Diapositiva ${n}`;
    return {
      index: n,
      title,
      excerpt: clip(bodyLines.join(' '), MAX_SLIDE_EXCERPT),
    };
  });
}

async function previewPublicRef(database, resourceId) {
  const id = String(resourceId || '').trim();
  if (!id) return null;
  const queries = database?.getQueries?.();
  const row = queries?.getResourceById?.get?.(id);
  if (!row) return null;
  const title = publicLabel(row.title || row.original_filename, '');
  if (!title || looksOpaque(title)) return null;
  const type = String(row.type || 'resource').toLowerCase();
  const kind = resourceKind(type);
  const { isViewable, extensionFor } = require('./export.cjs');
  const ext = extensionFor(kind, row.file_mime_type, row.original_filename || row.vault_path);
  const preview = {
    title,
    type,
    kind,
    excerpt: '',
    slides: [],
    viewable: isViewable(kind, ext),
  };
  if (kind !== 'ppt') {
    preview.excerpt = clip(row.content || row.extracted_text || '', MAX_EXCERPT);
    return preview;
  }
  try {
    const { pptGetSlides } = require('../tools/ppt-tools-handler.cjs');
    const result = await pptGetSlides(id);
    if (result?.success && Array.isArray(result.slides)) {
      preview.slides = formatPptSlides(result.slides);
    }
  } catch {
    /* keep metadata-only preview */
  }
  if (preview.slides.length === 0) {
    preview.excerpt = clip(row.content || row.extracted_text || '', MAX_EXCERPT);
  }
  return preview;
}

function parseResourceHref(href) {
  const raw = String(href || '').trim();
  const match = raw.match(/^(?:dome:\/\/resource\/|resource:\/\/|\/resource\/)([^/?#]+)/i);
  if (!match) return null;
  const id = decodeURIComponent(match[1] || '').trim();
  return id || null;
}

module.exports = {
  previewPublicRef,
  parseResourceHref,
  resourceKind,
  formatPptSlides,
};
