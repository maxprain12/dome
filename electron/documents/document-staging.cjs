/* eslint-disable no-console */
/**
 * Document Staging Layer — Main Process
 *
 * Buffers generated document files in userData/dome-staging/ before promoting
 * them to the canonical dome-files/ store. This ensures that a failed
 * validation or DB write never leaves orphaned files or partial rows in the
 * library.
 *
 * Flow:
 *   stageBuffer()         — write to staging, return stagingId
 *   validateStaging()     — open file with the type-appropriate lib and check integrity
 *   promoteToLibrary()    — rename from staging → dome-files/documents/<hash>.<ext>
 *   discardStaging()      — delete staging file on any error
 *   cleanupStaleStagings()— remove files older than maxAgeMs (run on app startup)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const fileStorage = require('../storage/file-storage.cjs');

const STAGING_DIR_NAME = 'dome-staging';
const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000; // 24 h

function getStagingDir() {
  return path.join(app.getPath('userData'), STAGING_DIR_NAME);
}

function ensureStagingDir() {
  const dir = getStagingDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Write a buffer to the staging area.
 * @param {Buffer} buffer
 * @param {string} filename  — original file name (e.g. "Report.xlsx")
 * @returns {{ stagingId: string, stagingPath: string, hash: string, size: number }}
 */
function stageBuffer(buffer, filename) {
  const dir = ensureStagingDir();
  const stagingId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const stagingPath = path.join(dir, `${stagingId}__${safe}`);
  fs.writeFileSync(stagingPath, buffer);
  const hash = fileStorage.calculateHash(buffer);
  return { stagingId, stagingPath, hash, size: buffer.length };
}

/**
 * Validate a staged file without touching the canonical store.
 * @param {string} stagingId
 * @param {'excel'|'document'|'ppt'} type
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function validateStaging(stagingId, type) {
  const stagingPath = findStagingPath(stagingId);
  if (!stagingPath) return { ok: false, error: 'Staging file not found' };

  try {
    if (type === 'excel') {
      const { ExcelJS } = require('../tools/exceljs-helpers.cjs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(stagingPath);
      if (wb.worksheets.length === 0) {
        return { ok: false, error: 'Excel file has no worksheets' };
      }
      return { ok: true };
    }

    if (type === 'document' || type === 'ppt') {
      // Both DOCX and PPTX are ZIP-based OOXML. Verify the archive is intact
      // and contains the expected root entry.
      const JSZip = require('jszip');
      const buf = fs.readFileSync(stagingPath);
      const zip = await JSZip.loadAsync(buf);
      const files = Object.keys(zip.files);

      if (type === 'document') {
        const hasRoot = files.some((f) => f === 'word/document.xml' || f.startsWith('word/'));
        if (!hasRoot) return { ok: false, error: 'DOCX file is missing word/ entries' };
      }
      if (type === 'ppt') {
        const hasRoot = files.some((f) => f === 'ppt/presentation.xml' || f.startsWith('ppt/'));
        if (!hasRoot) return { ok: false, error: 'PPTX file is missing ppt/ entries' };
        const { validatePptxBuffer } = require('./pptx-validate.cjs');
        const pptCheck = await validatePptxBuffer(buf, { minSlides: 1 });
        if (!pptCheck.ok) return { ok: false, error: pptCheck.error };
      }
      return { ok: true };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Validation failed' };
  }
}

/**
 * Promote a staged file to the canonical dome-files store.
 * Returns the same shape as fileStorage.importFromBuffer so callers can swap
 * this in place without changing subsequent DB writes.
 * @param {string} stagingId
 * @param {'excel'|'document'|'ppt'} type
 * @returns {{ internalPath: string, hash: string, size: number, mimeType: string, originalName: string }}
 */
function promoteToLibrary(stagingId, type) {
  const stagingPath = findStagingPath(stagingId);
  if (!stagingPath) throw new Error('Staging file not found: ' + stagingId);

  const filename = path.basename(stagingPath).replace(/^[^_]+__/, '');
  const ext = path.extname(filename).toLowerCase();
  const typeDir = fileStorage.getTypeDir(type);
  const buffer = fs.readFileSync(stagingPath);
  const hash = fileStorage.calculateHash(buffer);
  const internalPath = `${typeDir}/${hash}${ext}`;
  const fullPath = path.join(fileStorage.getStorageDir(), internalPath);

  // Ensure target directory exists
  const targetDir = path.dirname(fullPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Atomic rename (same filesystem — userData); fall back to copy+delete.
  try {
    if (!fs.existsSync(fullPath)) {
      fs.renameSync(stagingPath, fullPath);
    } else {
      // Deduplication: same hash already in store; just discard staging.
      fs.unlinkSync(stagingPath);
    }
  } catch {
    // Cross-device or rename failure → copy then delete
    if (!fs.existsSync(fullPath)) {
      fs.copyFileSync(stagingPath, fullPath);
    }
    try { fs.unlinkSync(stagingPath); } catch {}
  }

  return {
    internalPath,
    hash,
    size: buffer.length,
    mimeType: fileStorage.getMimeType(ext),
    originalName: filename,
  };
}

/**
 * Delete a staging file (called on any error before promotion).
 * @param {string} stagingId
 */
function discardStaging(stagingId) {
  const stagingPath = findStagingPath(stagingId);
  if (stagingPath) {
    try { fs.unlinkSync(stagingPath); } catch {}
  }
}

/**
 * Remove staging files older than maxAgeMs. Call on app startup.
 * @param {number} [maxAgeMs]
 */
function cleanupStaleStagings(maxAgeMs = DEFAULT_STALE_MS) {
  try {
    const dir = getStagingDir();
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(full);
          console.log('[DocStaging] Cleaned stale staging file:', name);
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[DocStaging] cleanupStaleStagings error:', err?.message);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findStagingPath(stagingId) {
  const dir = getStagingDir();
  if (!fs.existsSync(dir)) return null;
  const prefix = `${stagingId}__`;
  const entry = fs.readdirSync(dir).find((f) => f.startsWith(prefix));
  return entry ? path.join(dir, entry) : null;
}

module.exports = {
  getStagingDir,
  stageBuffer,
  validateStaging,
  promoteToLibrary,
  discardStaging,
  cleanupStaleStagings,
};
