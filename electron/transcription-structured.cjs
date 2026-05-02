/* eslint-disable no-console */
/**
 * Transcripción estructurada: diarización heurística, markdown para notas, normalización.
 */

/** @typedef {{ start: number, end: number, text: string }} WhisperLikeSegment */

function newSegmentId() {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @param {WhisperLikeSegment[]} raw
 * @param {{ pauseThresholdSec?: number, maxSpeakers?: number, speakerMode?: 'alternating' | 'single' }} opts
 *
 * - `single`: one speaker — use for mic-only or system-only capture (pause-based rotation is wrong for solo speech).
 * - `alternating` + `maxSpeakers`: rotate on long gaps between Whisper segments (heuristic “turns”).
 */
function applyAlternatingSpeakerHeuristic(raw, opts = {}) {
  const pauseThresholdSec = opts.pauseThresholdSec ?? 1.35;
  const maxSpeakers = Math.max(2, Math.min(12, opts.maxSpeakers ?? 8));
  const speakerMode = opts.speakerMode ?? 'alternating';

  if (!raw.length) {
    return { segments: [], speakers: {}, diarization: /** @type {const} */ ('none') };
  }

  if (speakerMode === 'single') {
    const segments = raw.map((seg) => ({
      id: newSegmentId(),
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text.trim(),
      speakerId: 'auto-0',
    }));
    return {
      segments,
      speakers: { 'auto-0': { label: 'Persona A' } },
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
    const speakerId = `auto-${speakerIdx}`;
    return {
      id: newSegmentId(),
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text.trim(),
      speakerId,
    };
  });

  const used = new Set(segments.map((s) => s.speakerId));
  /** @type {Record<string, { label: string }>} */
  const speakers = {};
  let letter = 65; // A
  for (const id of [...used].sort()) {
    speakers[id] = { label: `Persona ${String.fromCharCode(letter)}` };
    letter += 1;
    if (letter > 90) letter = 65;
  }

  return {
    segments,
    speakers,
    diarization: /** @type {const} */ ('heuristic'),
  };
}

function formatTimestampHMS(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0:00';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Texto plano continuo (legacy / búsqueda)
 * @param {Array<{ text: string }>} segments
 */
function segmentsToPlainText(segments) {
  return segments
    .map((s) => String(s.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/**
 * Markdown enriquecido para TipTap (encabezados por turno)
 * @param {Array<{ speakerId: string, speakerLabel?: string, startTime: number, endTime: number, text: string }>} segments
 * @param {Record<string, { label: string, isSelf?: boolean }>} speakers
 */
function structuredToMarkdownForNote(segments, speakers) {
  if (!segments.length) return '';

  const lines = [];
  let lastSpeaker = null;

  for (const seg of segments) {
    const t = String(seg.text || '').trim();
    if (!t) continue;

    const label =
      (seg.speakerLabel && seg.speakerLabel.trim()) ||
      (speakers && speakers[seg.speakerId]?.label) ||
      seg.speakerId;

    const ts = formatTimestampHMS(seg.startTime);

    if (label !== lastSpeaker) {
      lines.push('');
      lines.push(`### [${ts}] ${label}`);
      lines.push('');
      lastSpeaker = label;
    }
    lines.push(t);
    lines.push('');
  }

  return lines.join('\n').trim();
}

module.exports = {
  applyAlternatingSpeakerHeuristic,
  formatTimestampHMS,
  segmentsToPlainText,
  structuredToMarkdownForNote,
};
