/* eslint-disable no-console */
'use strict';

const crypto = require('crypto');
const database = require('../database.cjs');
const cloudLlm = require('../services/cloud-llm.service.cjs');

/**
 * @param {{ ipcMain: import('electron').IpcMain, windowManager: { broadcast: (c: string, d: unknown) => void, isAuthorized: (id: number) => boolean }, validateSender: (e: any, wm: any) => void }} ctx
 */
function register({ ipcMain, windowManager, validateSender }) {
  ipcMain.handle('cloud:llm:pdf-region-stream', async (event, payload) => {
    try {
      validateSender(event, windowManager);
      const streamId = payload?.streamId || crypto.randomUUID();
      const imageDataUrl = payload?.imageDataUrl;
      const question = String(payload?.question || '').trim();
      if (!imageDataUrl || !question) {
        return { success: false, error: 'imageDataUrl and question required' };
      }
      if (!cloudLlm.isCloudLlmAvailable(() => database.getQueries())) {
        return { success: false, error: 'cloud_unavailable' };
      }

      const onChunk = (c) => {
        try {
          if (c?.type === 'text' && c.text) {
            windowManager.broadcast('cloud:llm:stream-chunk', { streamId, text: c.text });
          }
        } catch {
          /* */
        }
      };

      void (async () => {
        let errMsg = null;
        try {
          await cloudLlm.streamGenerate({
            getQueries: () => database.getQueries(),
            system:
              'Eres un asistente que responde sobre la imagen (recorte de PDF). Sé conciso; cita texto visible entre comillas.',
            user: question,
            imageDataUrls: [imageDataUrl],
            onChunk,
            maxTokens: Math.min(2048, Number(payload?.maxNewTokens) || 1024),
            task: 'pdf_qa_stream',
            windowManager,
          });
        } catch (e) {
          errMsg = e instanceof Error ? e.message : String(e);
        }
        try {
          windowManager.broadcast('cloud:llm:stream-done', { streamId, error: errMsg || undefined });
        } catch {
          /* */
        }
      })();

      return { success: true, data: { streamId } };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  });
}

module.exports = { register };
