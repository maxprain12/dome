'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { publicLabel, looksOpaque } = require('./refs.cjs');

/** Binary payload per chunk. Base64 + AES envelope must stay under 64KB. */
const CHUNK_BYTES = 28 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const VIEWABLE_KINDS = new Set([
  'pdf',
  'image',
  'note',
  'ppt',
  'docx',
  'excel',
  'audio',
  'video',
]);

const VIEWABLE_EXTS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'heif',
  'mp4',
  'mov',
  'm4a',
  'mp3',
  'wav',
  'txt',
  'md',
  'rtf',
  'pptx',
  'ppt',
  'docx',
  'xlsx',
  'csv',
]);

const MIME_BY_EXT = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
  rtf: 'application/rtf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

function mimeForExt(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

function extensionFor(kind, mime, filename) {
  const fromName = path.extname(String(filename || '')).replace(/^\./, '').toLowerCase();
  if (fromName && fromName.length <= 8 && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const lowerMime = String(mime || '').toLowerCase();
  if (lowerMime.includes('presentationml') || lowerMime.includes('ms-powerpoint')) return 'pptx';
  if (lowerMime.includes('pdf')) return 'pdf';
  if (lowerMime.includes('png')) return 'png';
  if (lowerMime.includes('jpeg') || lowerMime.includes('jpg')) return 'jpg';
  if (lowerMime.includes('webp')) return 'webp';
  if (lowerMime.includes('gif')) return 'gif';
  if (lowerMime.includes('spreadsheetml') || lowerMime.includes('ms-excel')) return 'xlsx';
  if (lowerMime.includes('wordprocessingml')) return 'docx';
  if (lowerMime.includes('markdown')) return 'md';
  if (lowerMime.startsWith('audio/')) return 'm4a';
  if (lowerMime.startsWith('video/')) return 'mp4';
  const k = String(kind || '').toLowerCase();
  if (k === 'ppt') return 'pptx';
  if (k === 'pdf') return 'pdf';
  if (k === 'note') return 'md';
  if (k === 'image') return 'jpg';
  if (k === 'docx') return 'docx';
  if (k === 'excel') return 'xlsx';
  if (k === 'audio') return 'm4a';
  if (k === 'video') return 'mp4';
  return 'bin';
}

function isViewable(kind, ext) {
  if (VIEWABLE_KINDS.has(String(kind || '').toLowerCase())) return true;
  return VIEWABLE_EXTS.has(String(ext || '').replace(/^\./, '').toLowerCase());
}

function safeFilename(title, ext) {
  let base = publicLabel(title, 'Documento');
  base = String(base || 'Documento')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!base || looksOpaque(base)) base = 'Documento';
  const e = String(ext || 'bin').replace(/^\./, '').toLowerCase() || 'bin';
  return `${base}.${e}`;
}

function chunkCountFor(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size <= 0) return 1;
  return Math.ceil(size / CHUNK_BYTES);
}

function buildFileChunk({ buffer, offset, name, mime, kind }) {
  const bytes = Buffer.isBuffer(buffer) ? buffer.length : 0;
  const viewable = isViewable(kind, path.extname(String(name || '')).slice(1));
  if (!viewable) {
    return {
      error: 'not_viewable',
      name,
      mime,
      kind,
      bytes,
      viewable: false,
    };
  }
  if (bytes > MAX_FILE_BYTES) {
    return {
      error: 'too_large',
      name,
      mime,
      kind,
      bytes,
      viewable: true,
    };
  }
  const chunkCount = chunkCountFor(bytes);
  const chunkIndex = Math.max(0, Math.floor(Number(offset) || 0));
  if (chunkIndex >= chunkCount) {
    return {
      error: 'bad_offset',
      name,
      mime,
      kind,
      bytes,
      viewable: true,
      chunkIndex,
      chunkCount,
    };
  }
  const start = chunkIndex * CHUNK_BYTES;
  const slice = buffer.subarray(start, start + CHUNK_BYTES);
  return {
    name,
    mime,
    kind,
    bytes,
    viewable: true,
    chunkIndex,
    chunkCount,
    data: slice.toString('base64'),
  };
}

function readSlice(filePath, start, len) {
  if (len <= 0) return Buffer.alloc(0);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, start);
    return n < len ? buf.subarray(0, n) : buf;
  } finally {
    fs.closeSync(fd);
  }
}

function resolveSource(database, row, kind) {
  if (row?.vault_path) {
    try {
      const vaultStore = require('../storage/vault-store.cjs');
      const fileStorage = require('../storage/file-storage.cjs');
      const fullPath = vaultStore.getResourceFilePath(row, database.getQueries(), fileStorage);
      if (fullPath && fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          const bytes = stat.size;
          return {
            bytes,
            read(start, len) {
              return readSlice(fullPath, start, len);
            },
          };
        }
      }
    } catch {
      /* fall through to in-memory note */
    }
  }
  if (kind === 'note') {
    const buf = Buffer.from(String(row?.content || ''), 'utf8');
    return {
      bytes: buf.length,
      read(start, len) {
        return buf.subarray(start, start + Math.max(0, len));
      },
    };
  }
  return null;
}

function exportPublicRefChunk(database, { resourceId, offset } = {}) {
  const id = String(resourceId || '').trim();
  if (!id) return null;
  const queries = database?.getQueries?.();
  const row = queries?.getResourceById?.get?.(id);
  if (!row) return null;
  const { resourceKind } = require('./preview.cjs');
  const title = publicLabel(row.title || row.original_filename, '');
  if (!title || looksOpaque(title)) return null;
  const kind = resourceKind(row.type);
  const ext = extensionFor(kind, row.file_mime_type, row.original_filename || row.vault_path);
  const name = safeFilename(title, ext);
  const mime = String(row.file_mime_type || mimeForExt(ext));
  if (!isViewable(kind, ext)) {
    return {
      error: 'not_viewable',
      name,
      mime,
      kind,
      viewable: false,
    };
  }
  const source = resolveSource(database, row, kind);
  if (!source) return null;
  if (source.bytes > MAX_FILE_BYTES) {
    return {
      error: 'too_large',
      name,
      mime,
      kind,
      bytes: source.bytes,
      viewable: true,
    };
  }
  const chunkCount = chunkCountFor(source.bytes);
  const chunkIndex = Math.max(0, Math.floor(Number(offset) || 0));
  if (chunkIndex >= chunkCount) {
    return {
      error: 'bad_offset',
      name,
      mime,
      kind,
      bytes: source.bytes,
      viewable: true,
      chunkIndex,
      chunkCount,
    };
  }
  const start = chunkIndex * CHUNK_BYTES;
  const len = Math.min(CHUNK_BYTES, Math.max(0, source.bytes - start));
  const slice = source.read(start, len);
  return {
    name,
    mime,
    kind,
    bytes: source.bytes,
    viewable: true,
    chunkIndex,
    chunkCount,
    data: slice.toString('base64'),
  };
}

module.exports = {
  CHUNK_BYTES,
  MAX_FILE_BYTES,
  mimeForExt,
  extensionFor,
  isViewable,
  safeFilename,
  chunkCountFor,
  buildFileChunk,
  exportPublicRefChunk,
};
