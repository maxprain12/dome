'use strict';

let cached;

/** fluent-ffmpeg bound to the spawn-safe bundled binary, or null when missing. */
function loadFfmpeg() {
  if (cached !== undefined) return cached;
  try {
    const fluent = require('fluent-ffmpeg');
    const { configureFluentFfmpeg } = require('../media/ffmpeg-paths.cjs');
    if (!configureFluentFfmpeg(fluent)) throw new Error('ffmpeg binary not found');
    cached = fluent;
  } catch (e) {
    console.warn('[Transcription] ffmpeg unavailable:', e?.message);
    cached = null;
  }
  return cached;
}

module.exports = { loadFfmpeg };
