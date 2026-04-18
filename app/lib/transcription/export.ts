/**
 * Export structured transcripts to common formats (client-side).
 */

export type TranscriptSegment = {
  id?: string;
  speakerId?: string;
  startTime?: number;
  endTime?: number;
  text?: string;
};

export type TranscriptStructured = {
  segments?: TranscriptSegment[];
  speakers?: Record<string, { label?: string; isSelf?: boolean }>;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatSrtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, '0')}`;
}

export function structuredToSrt(structured: TranscriptStructured | null | undefined): string {
  const segments = structured?.segments || [];
  const speakers = structured?.speakers || {};
  const lines: string[] = [];
  let idx = 1;
  for (const seg of segments) {
    const t = String(seg.text || '').trim();
    if (!t) continue;
    const start = typeof seg.startTime === 'number' ? seg.startTime : 0;
    const end = typeof seg.endTime === 'number' ? Math.max(seg.endTime, start + 0.5) : start + 1;
    const label =
      (seg.speakerId && speakers[seg.speakerId]?.label) || seg.speakerId || '';
    lines.push(String(idx++));
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    lines.push(label ? `${label}: ${t}` : t);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function structuredToMarkdown(structured: TranscriptStructured | null | undefined): string {
  const segments = structured?.segments || [];
  const speakers = structured?.speakers || {};
  const lines: string[] = [];
  let lastSp = '';
  for (const seg of segments) {
    const t = String(seg.text || '').trim();
    if (!t) continue;
    const sid = seg.speakerId || '';
    const label = (sid && speakers[sid]?.label) || sid || 'Speaker';
    const start = typeof seg.startTime === 'number' ? seg.startTime : 0;
    const mm = Math.floor(start / 60);
    const ss = Math.floor(start % 60);
    const ts = `${mm}:${pad2(ss)}`;
    if (label !== lastSp) {
      lines.push('');
      lines.push(`### [${ts}] ${label}`);
      lines.push('');
      lastSp = label;
    }
    lines.push(t);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
