// 8 perceptually distinct hues — legible in light and dark modes
const SPEAKER_HUES = [252, 190, 24, 150, 330, 60, 210, 0] as const;

export function getSpeakerColor(index: number) {
  const h = SPEAKER_HUES[index % SPEAKER_HUES.length];
  const dot = `hsl(${h} 65% 58%)`;
  return {
    dot,
    label: dot,
    activeBg: `hsl(${h} 65% 58% / 0.12)`,
    activeBorder: dot,
    chipBg: `hsl(${h} 65% 58% / 0.10)`,
  };
}

/** Build a stable speakerId → appearance-order index map from a segment list */
export function buildSpeakerOrder(segments: { speakerId: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const seg of segments) {
    if (!map.has(seg.speakerId)) map.set(seg.speakerId, map.size);
  }
  return map;
}

/** Escape string for safe use inside RegExp */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Count case-insensitive non-overlapping occurrences of query in text */
export function countOccurrences(text: string, query: string): number {
  const q = query.trim();
  if (!q) return 0;
  const re = new RegExp(escapeRegExp(q), 'gi');
  const m = text.match(re);
  return m ? m.length : 0;
}
