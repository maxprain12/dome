import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import type { TFunction } from 'i18next';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

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
      <InputGroup className="flex-1">
        <InputGroupAddon><HugeiconsIcon icon={Search01Icon} /></InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('media.transcript_search_placeholder')}
          aria-label={t('media.transcript_search_placeholder')}
          autoComplete="off"
        />
      </InputGroup>
      {query.trim() ? (
        <span className="text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">
          {matchCount === 0
            ? t('media.transcript_search_no_results')
            : t('media.transcript_search_summary', { count: matchCount, total: totalSegments })}
        </span>
      ) : null}
    </div>
  );
}
