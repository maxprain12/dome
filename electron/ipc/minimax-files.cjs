/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { MINIMAX_BASE_URL } = require('../minimax-config.cjs');
const database = require('../database.cjs');

const MiniMaxUploadSchema = z.object({
  filePath: z.string().min(1),
  purpose: z.string().optional(),
});

/**
 * @param {string} apiKey
 * @param {string} filePath
 * @param {string} purpose
 * @returns {Promise<{ success: boolean, fileId?: string, error?: string }>}
 */
async function uploadMiniMaxFile(apiKey, filePath, purpose = 'video_understanding') {
  const resolved = path.resolve(String(filePath || ''));
  if (!fs.existsSync(resolved)) {
    return { success: false, error: 'File not found' };
  }
  const buffer = fs.readFileSync(resolved);
  const filename = path.basename(resolved);
  const ext = path.extname(filename).toLowerCase();
  const mime =
    ext === '.mp4'
      ? 'video/mp4'
      : ext === '.mov'
        ? 'video/quicktime'
        : ext === '.avi'
          ? 'video/x-msvideo'
          : ext === '.mkv'
            ? 'video/x-matroska'
            : 'application/octet-stream';

  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([buffer], { type: mime }), filename);

  const res = await fetch(`${MINIMAX_BASE_URL}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `MiniMax upload failed (${res.status}): ${text.slice(0, 500)}` };
  }

  const json = await res.json();
  const statusCode = json?.base_resp?.status_code;
  if (statusCode != null && Number(statusCode) !== 0) {
    return {
      success: false,
      error: json?.base_resp?.status_msg || `MiniMax upload error (${statusCode})`,
    };
  }
  const fileId = json?.file?.file_id;
  if (fileId == null) {
    return { success: false, error: 'MiniMax upload: missing file_id' };
  }
  return { success: true, fileId: String(fileId) };
}

/**
 * @param {{ ipcMain: import('electron').IpcMain, validateSender: (e: import('electron').IpcMainInvokeEvent) => boolean }} deps
 */
function register({ ipcMain, validateSender }) {
  ipcMain.handle('minimax:files:upload', async (event, args) => {
    if (!validateSender(event)) return { success: false, error: 'Unauthorized' };
    try {
      const parsed = MiniMaxUploadSchema.safeParse(args);
      if (!parsed.success) {
        return { success: false, error: parsed.error.message };
      }
      const { filePath, purpose = 'video_understanding' } = parsed.data;
      const queries = database.getQueries?.();
      const provider = String(queries?.getSetting?.get?.('ai_provider')?.value || '').toLowerCase();
      if (provider !== 'minimax') {
        return { success: false, error: 'MiniMax Files API requires MiniMax as active provider' };
      }
      const apiKey = queries?.getSetting?.get?.('ai_api_key')?.value;
      if (!apiKey || !String(apiKey).trim()) {
        return { success: false, error: 'MiniMax API key not configured' };
      }
      return await uploadMiniMaxFile(String(apiKey).trim(), filePath, purpose);
    } catch (err) {
      console.error('[MiniMax Files] upload error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { register, uploadMiniMaxFile };
