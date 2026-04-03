import { Search } from 'lucide-react';
import type { TFunction } from 'i18next';

interface TranscriptSearchBarProps {
  t: TFunction;
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  totalSegments: number;
}

export default function TranscriptSearchBar({
  t,
  query,
  onQueryChange,
  matchCount,
  totalSegments,
}: TranscriptSearchBarProps) {
  return (
    <div className="flex flex-1 items-center gap-3 min-w-[200px] max-w-md">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('media.transcript_search_placeholder')}
          className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-[var(--dome-accent)]"
          style={{
            borderColor: 'var(--dome-border)',
            background: 'var(--dome-bg)',
            color: 'var(--dome-text)',
          }}
          autoComplete="off"
        />
      </div>
      {query.trim() ? (
        <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: 'var(--dome-text-muted)' }}>
          {matchCount === 0
            ? t('media.transcript_search_no_results')
            : t('media.transcript_search_summary', { count: matchCount, total: totalSegments })}
        </span>
      ) : null}
    </div>
  );
}
