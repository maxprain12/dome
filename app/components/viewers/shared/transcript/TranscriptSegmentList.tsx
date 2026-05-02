import type { RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { StructuredTranscriptPayload, TranscriptionSegment } from '@/types';
import { resolveSpeakerLabel } from '@/lib/utils/resource-metadata';
import { escapeRegExp, formatMediaTime, getSpeakerColor } from './transcriptUtils';

interface TranscriptSegmentListProps {
  t: TFunction;
  segments: TranscriptionSegment[];
  speakersMap: StructuredTranscriptPayload['speakers'];
  currentTime: number;
  onSeek: (sec: number) => void;
  activeSegmentId: string | null;
  searchQuery: string;
  rowRefs: RefObject<Map<string, HTMLButtonElement | null>>;
  speakerOrder: Map<string, number>;
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

function setRef(rowRefs: RefObject<Map<string, HTMLButtonElement | null>>, id: string) {
  return (el: HTMLButtonElement | null) => {
    const m = rowRefs.current;
    if (!m) return;
    if (el) m.set(id, el);
    else m.delete(id);
  };
}

export default function TranscriptSegmentList({
  t,
  segments,
  speakersMap,
  onSeek,
  activeSegmentId,
  searchQuery,
  rowRefs,
  speakerOrder,
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

  // ── Flat filtered view (searching) ──────────────────────────────────────
  if (q) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-0.5">
        {visible.map((seg) => {
          const isActive = seg.id === activeSegmentId;
          const speakerLabel = resolveSpeakerLabel(seg, speakersMap);
          const colors = getSpeakerColor(speakerOrder.get(seg.speakerId) ?? 0);
          return (
            <button
              key={seg.id}
              type="button"
              ref={setRef(rowRefs, seg.id)}
              onClick={() => onSeek(seg.startTime)}
              className="group relative w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-[var(--dome-bg-hover)]"
              style={{
                background: isActive ? colors.activeBg : 'transparent',
                color: 'var(--dome-text)',
              }}
            >
              {isActive && (
                <div
                  className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full"
                  style={{ background: colors.activeBorder }}
                />
              )}
              <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                <span
                  className="font-mono tabular-nums font-medium opacity-70 transition-opacity group-hover:opacity-100"
                  style={{ color: colors.label }}
                >
                  {formatMediaTime(seg.startTime)}
                </span>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: colors.dot }} />
                <span className="font-semibold uppercase tracking-wider" style={{ color: colors.label }}>
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

  // ── Grouped view (normal) ────────────────────────────────────────────────
  // Build consecutive same-speaker groups
  const groups: Array<{ speakerId: string; segs: TranscriptionSegment[] }> = [];
  for (const seg of visible) {
    const last = groups[groups.length - 1];
    if (last && last.speakerId === seg.speakerId) {
      last.segs.push(seg);
    } else {
      groups.push({ speakerId: seg.speakerId, segs: [seg] });
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {groups.map((group, gi) => {
        const colors = getSpeakerColor(speakerOrder.get(group.speakerId) ?? 0);
        const speakerLabel = resolveSpeakerLabel(group.segs[0], speakersMap);
        return (
          <div key={`${gi}-${group.speakerId}-${group.segs[0].id}`} className="flex flex-col">
            {/* Speaker header */}
            <div className="mb-1.5 flex items-center gap-2 px-4 text-[11px]">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: colors.dot }}
                aria-hidden
              />
              <span className="font-semibold uppercase tracking-wider" style={{ color: colors.label }}>
                {speakerLabel}
              </span>
            </div>

            {/* Segments under this speaker turn */}
            {group.segs.map((seg) => {
              const isActive = seg.id === activeSegmentId;
              return (
                <button
                  key={seg.id}
                  type="button"
                  ref={setRef(rowRefs, seg.id)}
                  onClick={() => onSeek(seg.startTime)}
                  className="group relative w-full rounded-xl px-4 py-2 text-left transition-colors hover:bg-[var(--dome-bg-hover)]"
                  style={{
                    background: isActive ? colors.activeBg : 'transparent',
                    color: 'var(--dome-text)',
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute left-1.5 top-2.5 bottom-2.5 w-0.5 rounded-full"
                      style={{ background: colors.activeBorder }}
                    />
                  )}
                  <div className="flex items-baseline gap-3 pl-2">
                    <span
                      className="font-mono text-[10px] tabular-nums shrink-0 opacity-50 transition-opacity group-hover:opacity-80"
                      style={{ color: colors.label }}
                    >
                      {formatMediaTime(seg.startTime)}
                    </span>
                    <p className="text-[15px] leading-relaxed" style={{ opacity: isActive ? 1 : 0.9 }}>
                      <HighlightedText text={seg.text} query={searchQuery} />
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
