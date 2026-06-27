/* eslint-disable no-console */
'use strict';

const database = require('../core/database.cjs');
const { runDocumentExtract, runDbReadTask } = require('./worker-pool.cjs');

/**
 * Extract document/chat attachment text off the main thread when possible.
 */
async function extractInWorker(kind, filePath, maxChars, mimeType) {
  if (!filePath) return null;
  try {
    return await runDocumentExtract({
      kind,
      filePath,
      maxChars,
      mimeType,
      timeoutMs: 120_000,
    });
  } catch (err) {
    console.warn('[document-extract-service] worker failed, falling back inline:', err?.message || err);
    const documentExtractor = require('../documents/document-extractor.cjs');
    if (kind === 'chatAttachment') {
      return documentExtractor.extractChatAttachmentText(filePath, maxChars);
    }
    return documentExtractor.extractDocumentText(filePath, mimeType);
  }
}

async function searchResourcesFtsInWorker(query, limit = 25) {
  const dbPath = database.getDbPath();
  return runDbReadTask('searchResourcesFts', { query, limit }, { dbPath });
}

async function listProjectResourceIdsInWorker(projectId) {
  const dbPath = database.getDbPath();
  return runDbReadTask('listProjectResourceIds', { projectId }, { dbPath });
}

module.exports = {
  extractInWorker,
  searchResourcesFtsInWorker,
  listProjectResourceIdsInWorker,
};
