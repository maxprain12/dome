'use strict';

/**
 * Structured transcript: heuristic speaker turns over Whisper-like segments.
 *
 * Speaker labels stay empty; the renderer names speakers from `ordinal` in the
 * user's language (resolveSpeakerLabel). Users can rename them later.
 */

/** @typedef {{ start: number, end: number, text: string }} WhisperLikeSegment */

function newSegmentId() {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function toSegment(seg, speakerId) {
  return {
    id: newSegmentId(),
    startTime: seg.start,
    endTime: seg.end,
    text: seg.text.trim(),
    speakerId,
  };
}

/** Speaker map keyed by id, ordered as given, with empty labels + ordinal. */
function speakersFor(ids) {
  /** @type {Record<string, { label: string, ordinal: number }>} */
  const speakers = {};
  ids.forEach((id, ordinal) => {
    speakers[id] = { label: '', ordinal };
  });
  return speakers;
}

/**
 * @param {WhisperLikeSegment[]} raw
 * @param {{ pauseThresholdSec?: number, maxSpeakers?: number, speakerMode?: 'alternating' | 'single' }} opts
 *
 * - `single`: one speaker — mic-only or system-only capture.
 * - `alternating` + `maxSpeakers`: rotate on long gaps between segments (heuristic turns).
 */
function applyAlternatingSpeakerHeuristic(raw, opts = {}) {
  const pauseThresholdSec = opts.pauseThresholdSec ?? 1.35;
  const maxSpeakers = Math.max(2, Math.min(12, opts.maxSpeakers ?? 8));
  const speakerMode = opts.speakerMode ?? 'alternating';

  if (!raw.length) {
    return { segments: [], speakers: {}, diarization: /** @type {const} */ ('none') };
  }

  if (speakerMode === 'single') {
    return {
      segments: raw.map((seg) => toSegment(seg, 'auto-0')),
      speakers: speakersFor(['auto-0']),
      diarization: /** @type {const} */ ('heuristic'),
    };
  }

  let speakerIdx = 0;
  let lastEnd = raw[0].start;
  const segments = raw.map((seg, i) => {
    if (i > 0 && seg.start - lastEnd > pauseThresholdSec) {
      speakerIdx = (speakerIdx + 1) % maxSpeakers;
    }
    lastEnd = seg.end;
    return toSegment(seg, `auto-${speakerIdx}`);
  });

  const used = [...new Set(segments.map((s) => s.speakerId))].sort((a, b) => a.localeCompare(b));
  return { segments, speakers: speakersFor(used), diarization: /** @type {const} */ ('heuristic') };
}

/** Segments from a diarizing model (speaker labels come from the API). */
function fromDiarizedSegments(raw) {
  const segments = raw.map((seg) => toSegment(seg, seg.speaker));
  const ids = [...new Set(segments.map((s) => s.speakerId))].sort((a, b) => a.localeCompare(b));
  return { segments, speakers: speakersFor(ids), diarization: /** @type {const} */ ('real') };
}

/** Plain continuous text (search / legacy). */
function segmentsToPlainText(segments) {
  return segments
    .map((s) => String(s.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

module.exports = {
  applyAlternatingSpeakerHeuristic,
  fromDiarizedSegments,
  segmentsToPlainText,
};
