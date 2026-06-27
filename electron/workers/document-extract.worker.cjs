/* eslint-disable no-console */
'use strict';

const { parentPort, workerData } = require('worker_threads');
const documentExtractor = require('../documents/document-extractor.cjs');

async function main() {
  const { filePath, kind, maxChars, mimeType } = workerData || {};
  let result = null;
  if (kind === 'chatAttachment') {
    result = await documentExtractor.extractChatAttachmentText(filePath, maxChars);
  } else if (kind === 'documentText') {
    result = await documentExtractor.extractDocumentText(filePath, mimeType);
  } else {
    throw new Error(`Unknown extract kind: ${kind}`);
  }
  parentPort.postMessage({ ok: true, result });
}

main().catch((err) => {
  parentPort.postMessage({ ok: false, error: err?.message || String(err) });
});
