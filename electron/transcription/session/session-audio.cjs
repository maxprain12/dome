'use strict';

/**
 * ffmpeg work for a session: WebM chunks → per-track MP3 → merged MP3.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadFfmpeg } = require('../ffmpeg.cjs');

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function encodeMp3(command, outputMp3) {
  return new Promise((resolve, reject) => {
    command
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioBitrate('64k')
      .on('end', () => resolve())
      .on('error', reject)
      .save(outputMp3);
  });
}

/**
 * MediaRecorder WebM chunks: usually only chunk 0 is a full container; the rest
 * are bitstream continuations. Raw byte-cat into one .webm and decode once; if
 * the output looks truncated, try per-file decode + concat filter, then the
 * concat demuxer (some Electron builds emit self-contained slices).
 */
async function concatFilesToMp3(sortedFiles, outputMp3) {
  const ff = loadFfmpeg();
  const existing = (sortedFiles || []).filter((p) => p && fs.existsSync(p));
  if (!ff || existing.length === 0) throw new Error('ffmpeg or input files missing');
  if (existing.length === 1) return encodeMp3(ff(existing[0]), outputMp3);

  const webmBytes = existing.reduce((sum, p) => sum + fs.statSync(p).size, 0);
  const assertNotTruncated = () => {
    if (webmBytes < 40000) return;
    const size = fs.existsSync(outputMp3) ? fs.statSync(outputMp3).size : 0;
    if (size < webmBytes * 0.045) {
      safeUnlink(outputMp3);
      throw new Error('concat produced a truncated MP3');
    }
  };

  const byteCat = async () => {
    const combined = `${outputMp3}.combined.webm`;
    try {
      const fd = fs.openSync(combined, 'w');
      try {
        for (const p of existing) fs.writeSync(fd, fs.readFileSync(p));
      } finally {
        fs.closeSync(fd);
      }
      await encodeMp3(ff(combined), outputMp3);
    } finally {
      safeUnlink(combined);
    }
    assertNotTruncated();
  };

  const filterConcat = async () => {
    let cmd = ff();
    for (const p of existing) cmd = cmd.input(p);
    const labels = existing.map((_, i) => `[${i}:a]`).join('');
    cmd = cmd.complexFilter([`${labels}concat=n=${existing.length}:v=0:a=1[aout]`]).outputOptions(['-map', '[aout]']);
    await encodeMp3(cmd, outputMp3);
    assertNotTruncated();
  };

  const demuxer = async () => {
    const listPath = `${outputMp3}.concat.txt`;
    fs.writeFileSync(listPath, existing.map((p) => `file '${p.replaceAll("'", String.raw`'\''`)}'`).join('\n'));
    try {
      await encodeMp3(ff().input(listPath).inputOptions(['-f', 'concat', '-safe', '0']), outputMp3);
    } finally {
      safeUnlink(listPath);
    }
    assertNotTruncated();
  };

  let lastError;
  for (const strategy of [byteCat, filterConcat, demuxer]) {
    safeUnlink(outputMp3);
    try {
      await strategy();
      return undefined;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function mixTwoMp3sToMp3(micMp3, sysMp3, outputMp3) {
  const ff = loadFfmpeg();
  if (!ff) return Promise.reject(new Error('ffmpeg unavailable'));
  const cmd = ff()
    .input(micMp3)
    .input(sysMp3)
    .complexFilter(['[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2[a]'])
    .outputOptions(['-map', '[a]']);
  return encodeMp3(cmd, outputMp3);
}

/** @returns {Promise<number|null>} duration in seconds */
function probeFormatDurationSec(filePath) {
  const ff = loadFfmpeg();
  if (!ff || !filePath || !fs.existsSync(filePath)) return Promise.resolve(null);
  return new Promise((resolve) => {
    ff.ffprobe(filePath, (err, metadata) => {
      const d = Number(metadata?.format?.duration);
      resolve(!err && Number.isFinite(d) && d > 0 ? d : null);
    });
  });
}

/**
 * Loopback/system WebM sometimes decodes to a few seconds; if the mix is far
 * shorter (or smaller) than the mic take, keep the full mic take instead.
 */
async function pickMixOrMic(micMp3, mergedMp3) {
  const micDur = await probeFormatDurationSec(micMp3);
  const mixDur = await probeFormatDurationSec(mergedMp3);
  if (micDur != null && mixDur != null && micDur >= 4 && mixDur < micDur * 0.85) return micMp3;
  try {
    const micSize = fs.statSync(micMp3).size;
    const mixSize = fs.statSync(mergedMp3).size;
    if (micSize > 12000 && mixSize > 0 && mixSize < micSize * 0.25) return micMp3;
  } catch {
    /* keep the mix */
  }
  return mergedMp3;
}

/**
 * @param {string} sessionDir
 * @param {{ mic: Array<{ file_path: string }>, system: Array<{ file_path: string }> }} byTrack sorted chunks
 * @returns {Promise<string>} merged MP3 path
 */
async function mergeSessionAudio(sessionDir, byTrack) {
  const trackMp3 = {};
  for (const track of ['mic', 'system']) {
    if (!byTrack[track].length) continue;
    const out = path.join(sessionDir, `${track}.mp3`);
    await concatFilesToMp3(byTrack[track].map((c) => c.file_path), out);
    trackMp3[track] = out;
  }
  let merged = trackMp3.mic || trackMp3.system;
  if (trackMp3.mic && trackMp3.system) {
    const mixed = path.join(sessionDir, 'merged.mp3');
    await mixTwoMp3sToMp3(trackMp3.mic, trackMp3.system, mixed);
    merged = await pickMixOrMic(trackMp3.mic, mixed);
  }
  if (!merged || !fs.existsSync(merged)) throw new Error('ffmpeg merge produced no output');
  return merged;
}

module.exports = {
  safeUnlink,
  concatFilesToMp3,
  mixTwoMp3sToMp3,
  probeFormatDurationSec,
  mergeSessionAudio,
};
