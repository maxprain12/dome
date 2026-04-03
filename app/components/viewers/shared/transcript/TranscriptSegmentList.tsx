import type { RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { StructuredTranscriptPayload, TranscriptionSegment } from '@/types';
import { resolveSpeakerLabel } from '@/lib/utils/resource-metadata';
import { escapeRegExp, formatMediaTime } from './transcriptUtils';

interface TranscriptSegmentListProps {
  t: TFunction;
  segments: TranscriptionSegment[];
  speakersMap: StructuredTranscriptPayload['speakers'];
  currentTime: number;
  onSeek: (sec: number) => void;
  activeSegmentId: string | null;
  searchQuery: string;
  rowRefs: RefObject<Map<string, HTMLButtonElement | null>>;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const re = new RegExp(`(${escapeRegExp(q)})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded px-0.5"
            style={{ background: 'color-mix(in srgb, var(--dome-accent) 35%, transparent)' }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function TranscriptSegmentList({
  t,
  segments,
  speakersMap,
  currentTime,
  onSeek,
  activeSegmentId,
  searchQuery,
  rowRefs,
}: TranscriptSegmentListProps) {
  const q = searchQuery.trim().toLowerCase();

  const visible = q
    ? segments.filter((seg) => String(seg.text || '').toLowerCase().includes(q))
    : segments;

  if (!visible.length) {
    if (segments.length && q) {
      return (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--dome-text-muted)' }}>
          {t('media.transcript_search_no_results')}
        </p>
      );
    }
    return null;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-0.5">
      {visible.map((seg) => {
        const isActive = seg.id === activeSegmentId;
        const speakerLabel = resolveSpeakerLabel(seg, speakersMap);
        return (
          <button
            key={seg.id}
            type="button"
            ref={(el) => {
              const m = rowRefs.current;
              if (!m) return;
              if (el) m.set(seg.id, el);
              else m.delete(seg.id);
            }}
            onClick={() => onSeek(seg.startTime)}
            className="group relative w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-[var(--dome-bg-hover)]"
            style={{
              background: isActive ? 'var(--dome-bg-hover)' : 'transparent',
              color: 'var(--dome-text)',
            }}
          >
            {isActive && (
              <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-[var(--dome-accent)]" />
            )}
            <div className="mb-1.5 flex items-center gap-2.5 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
              <span className="font-mono tabular-nums font-medium text-[var(--dome-accent)] opacity-70 transition-opacity group-hover:opacity-100">
                {formatMediaTime(seg.startTime)}
              </span>
              <span className="font-semibold uppercase tracking-wider">
                {speakerLabel}
              </span>
            </div>
            <p className="text-[15px] leading-relaxed" style={{ opacity: isActive ? 1 : 0.9 }}>
              <HighlightedText text={seg.text} query={searchQuery} />
            </p>
          </button>
        );
      })}
    </div>
  );
}
