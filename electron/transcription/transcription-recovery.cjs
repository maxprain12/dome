/* eslint-disable no-console */
/**
 * Transcription Recovery — finalize stale sessions on app startup.
 *
 * If the app crashes mid-recording, transcription_sessions rows remain in
 * 'recording', 'paused' or 'transcribing' state with their chunks safely on
 * disk. This module runs once during init and either finalizes them into a
 * proper resource or marks them as 'error' / 'cancelled' so the user sees
 * something explicit instead of silent data loss.
 */

const fs = require('fs');
const transcriptionSession = require('./transcription-session.cjs');

/**
 * @param {Object} deps - { database, fileStorage, windowManager, thumbnail, initModule, ollamaService }
 */
async function runOnStartup(deps) {
  const queries = deps.database.getQueries();
  let stale;
  try {
    stale = queries.getStaleTranscriptionSessions.all();
  } catch (e) {
    console.warn('[TranscriptionRecovery] query failed:', e?.message);
    return;
  }
  if (!stale || stale.length === 0) return;

  console.log(`[TranscriptionRecovery] finalizing ${stale.length} stale session(s)`);
  for (const row of stale) {
    const sessionId = row.id;
    const now = Date.now();
    try {
      const dirExists = row.session_dir && fs.existsSync(row.session_dir);
      const chunkCount = queries.listSessionChunks.all(sessionId).length;
      if (!dirExists || chunkCount === 0) {
        queries.updateTranscriptionSessionStatus.run('cancelled', now, 'no audio recovered', sessionId);
        console.log(`[TranscriptionRecovery] ${sessionId} -> cancelled (empty)`);
        continue;
      }
      // Reuse the same finalization path that 'stop' uses.
      const result = await transcriptionSession.finalizeSession(deps, sessionId);
      console.log(`[TranscriptionRecovery] ${sessionId} -> done (resource ${result.resourceId})`);
    } catch (err) {
      console.error(`[TranscriptionRecovery] ${sessionId} failed:`, err?.message);
      try {
        queries.updateTranscriptionSessionStatus.run('error', Date.now(), String(err?.message || err), sessionId);
      } catch { /* ignore */ }
    }
  }
}

module.exports = { runOnStartup };
