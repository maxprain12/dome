/* eslint-disable no-console */
/**
 * Docling client for Dome Desktop.
 *
 * Async flow:
 *   1. POST /api/v1/documents/convert  → { job_id }  (returns in ~3s)
 *   2. Poll GET /api/v1/documents/jobs/{job_id}  every 5s until status=completed|failed
 *   3. GET /api/v1/documents/jobs/{job_id}/result  → DoclingConversionResult
 */

const domeOauth = require('./dome-oauth.cjs');
const { PROVIDER_BASE_URL } = require('./dome-oauth.cjs');

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 12 * 60 * 1000; // 12 minutes

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Convert a document file buffer to Markdown via dome-provider → Docling Serve.
 *
 * @param {Buffer} fileBuffer - Raw file bytes
 * @param {string} filename - Original filename (e.g. "paper.pdf")
 * @param {object} database - Dome database instance (for session lookup)
 * @param {object} [options]
 * @param {boolean} [options.doOcr=true] - Enable OCR
 * @param {(status: string, progress: number) => void} [options.onProgress]
 * @returns {Promise<import('./types').DoclingConversionResult>}
 */
async function convertDocument(fileBuffer, filename, database, { doOcr = true, onProgress } = {}) {
  const session = await domeOauth.getOrRefreshSession(database);
  if (!session.connected) {
    const err = new Error('Not connected to Dome Provider. Please sign in via Settings → Cloud.');
    err.code = 'not_connected';
    throw err;
  }

  const accessToken = session.accessToken;
  if (!accessToken) {
    const err = new Error('Dome Provider session has no access token. Please reconnect in Settings → Cloud.');
    err.code = 'not_connected';
    throw err;
  }

  // ── Step 1: Submit ──────────────────────────────────────────────────────────
  onProgress?.('submitting', 5);

  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'application/octet-stream' }), filename);
  form.append('do_ocr', String(doOcr));

  let submitResponse;
  try {
    submitResponse = await fetch(`${PROVIDER_BASE_URL}/api/v1/documents/convert`, {
      method: 'POST',
      headers: getAuthHeaders(accessToken),
      body: form,
    });
  } catch (fetchErr) {
    const err = new Error(`Could not reach Dome Provider: ${fetchErr.message}`);
    err.code = 'network_error';
    throw err;
  }

  const submitData = await submitResponse.json().catch(() => ({}));

  if (!submitResponse.ok) {
    let errMsg = submitData.reason || submitData.error || `HTTP ${submitResponse.status}`;
    if (submitData.hint) errMsg += ` (${submitData.hint})`;
    const err = new Error(errMsg);
    err.code = submitData.error || 'submit_failed';
    throw err;
  }

  const jobId = submitData.job_id;
  if (!jobId) {
    const err = new Error('Dome Provider did not return a job_id');
    err.code = 'submit_failed';
    throw err;
  }

  console.log(`[DoclingClient] Job submitted: ${jobId}`);
  onProgress?.('converting', 10);

  // ── Step 2: Poll status ─────────────────────────────────────────────────────
  const startMs = Date.now();
  let progressTick = 10;

  while (Date.now() - startMs < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);

    // Advance progress indicator: 10% → 45% over the polling period
    progressTick = Math.min(progressTick + 2, 45);
    onProgress?.('converting', progressTick);

    let statusData;
    try {
      const statusRes = await fetch(
        `${PROVIDER_BASE_URL}/api/v1/documents/jobs/${jobId}`,
        { headers: getAuthHeaders(accessToken) },
      );
      statusData = await statusRes.json().catch(() => ({}));

      if (!statusRes.ok) {
        console.warn(`[DoclingClient] Status poll error: HTTP ${statusRes.status}`);
        continue;
      }
    } catch (pollErr) {
      console.warn(`[DoclingClient] Status poll network error: ${pollErr.message}`);
      continue;
    }

    const status = statusData.status;
    console.log(`[DoclingClient] Job ${jobId} status: ${status}`);

    if (status === 'completed') {
      break;
    }

    if (status === 'failed') {
      const err = new Error(statusData.error || 'Docling conversion failed');
      err.code = 'conversion_failed';
      throw err;
    }

    // status === 'pending' → keep polling
  }

  if (Date.now() - startMs >= MAX_WAIT_MS) {
    const err = new Error('Docling conversion timed out after 12 minutes');
    err.code = 'timeout';
    throw err;
  }

  // ── Step 3: Fetch result ────────────────────────────────────────────────────
  onProgress?.('fetching_result', 48);

  let resultResponse;
  try {
    resultResponse = await fetch(
      `${PROVIDER_BASE_URL}/api/v1/documents/jobs/${jobId}/result`,
      { headers: getAuthHeaders(accessToken) },
    );
  } catch (fetchErr) {
    const err = new Error(`Could not fetch result: ${fetchErr.message}`);
    err.code = 'network_error';
    throw err;
  }

  const resultData = await resultResponse.json().catch(() => ({}));

  if (!resultResponse.ok) {
    const errMsg = resultData.error || `HTTP ${resultResponse.status}`;
    const err = new Error(errMsg);
    err.code = resultData.error || 'result_failed';
    throw err;
  }

  return resultData;
}

module.exports = { convertDocument };
