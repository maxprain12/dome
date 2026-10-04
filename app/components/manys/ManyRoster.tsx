import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Alert02Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CloudMany, ManyCloudRuntime, ManyDetail } from '@/lib/manys/api';
import ManyCreateForm from './ManyCreateForm';
import ManyOptionsMenu from './ManyOptionsMenu';
import ManyMark, { manyMarkVariant } from './ManyMark';
import { STATUS_DOT, statusLabelKey, summarizeMany, type ManySummary } from './manyStatus';

const ATTENTION_STATUSES = ['waiting_approval', 'waiting_input', 'failed'];

/** What a Many needs from the person right now: reviews, answers and conflicts. */
export function pendingCount(summary: ManySummary): number {
  return summary.decisions.length + summary.conflicts.length + summary.questions.length;
}

interface ManyRosterProps {
  manys: CloudMany[];
  details: Record<string, ManyDetail | undefined>;
  loaded: boolean;
  selected: string;
  busy: boolean;
  newOpen: boolean;
  presetName: string;
  onNewOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onOpenLocal: () => void;
  onDelete: (many: CloudMany) => void;
  onCreate: (input: { name: string; runtime: ManyCloudRuntime }) => Promise<boolean>;
}

/** Left column of Many’s A: search, team, "needs you" group, rest, and the new-Many popover. */
export default function ManyRoster({ manys, details, loaded, selected, busy, newOpen, presetName, onNewOpenChange, onSelect, onOpenLocal, onDelete, onCreate }: ManyRosterProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const rows = manys
    .filter((many) => many.name.toLowerCase().includes(query.trim().toLowerCase()))
    .map((many) => {
      const detail = details[many.id];
      return { many, summary: detail ? summarizeMany(detail) : null };
    });
  const attention = rows.filter((row) => row.summary && ATTENTION_STATUSES.includes(row.summary.status));
  const rest = rows.filter((row) => !attention.includes(row));

  const renderRow = ({ many, summary }: (typeof rows)[number]) => {
    const status = summary?.status ?? 'idle';
    const pending = summary ? pendingCount(summary) : 0;
    return (
      <div key={many.id} className="group relative">
        <button
          type="button"
          aria-label={many.name}
          aria-pressed={selected === many.id}
          onClick={() => onSelect(many.id)}
          className="dome-rowbtn"
        >
          <ManyMark variant={manyMarkVariant(many.id)} />
          <span aria-hidden="true" className="flex min-w-0 grow flex-col">
            <span className="truncate text-sm font-medium">{many.name}</span>
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className={cn('size-[7px] shrink-0 rounded-full', STATUS_DOT[status])} />
              {t(statusLabelKey(status))}
            </span>
          </span>
          {pending > 0 && <Badge variant="warn" aria-hidden="true" className="group-hover:invisible group-focus-within:invisible">{pending}</Badge>}
          {pending === 0 && status === 'failed' && (
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0 text-destructive group-hover:invisible group-focus-within:invisible" aria-hidden />
          )}
        </button>
        <ManyOptionsMenu
          many={many}
          onDelete={onDelete}
          className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100"
        />
      </div>
    );
  };

  return (
    <aside className="flex max-h-[42vh] min-h-0 w-full shrink-0 flex-col border-b border-border md:h-full md:max-h-none md:w-[264px] md:border-r md:border-b-0">
      <div className="flex items-center justify-between gap-2 pt-4 pr-3 pb-2 pl-4">
        <h1 className="text-base font-semibold tracking-tight">{t('manys.title')}</h1>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenLocal}>
          {t('manys.local')}
        </Button>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <HugeiconsIcon icon={Search01Icon} className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            aria-label={t('manys.search')}
            placeholder={t('manys.search')}
            className="h-7 rounded-[10px] pl-6.5 text-xs"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <nav aria-label={t('manys.title')} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 pb-2">
        <button
          type="button"
          aria-pressed={!selected}
          onClick={() => onSelect('')}
          className="dome-rowbtn text-sm font-medium"
        >
          {t('manys.team')}
        </button>
        {!loaded && (
          <div className="flex flex-col gap-2 px-1 pt-1">
            <Skeleton className="h-11 rounded-[14px]" />
            <Skeleton className="h-11 rounded-[14px]" />
          </div>
        )}
        {attention.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-[11px] leading-[1.4] font-semibold text-muted-foreground">
            {t('manys.attentionGroup', { count: attention.length })}
          </div>
        )}
        {attention.map(renderRow)}
        {attention.length > 0 && rest.length > 0 && (
          <div className="px-2 pt-3 pb-1 text-[11px] leading-[1.4] font-semibold text-muted-foreground">{t('manys.restGroup')}</div>
        )}
        {rest.map(renderRow)}
      </nav>
      <div className="border-t border-border p-3">
        <Popover open={newOpen} onOpenChange={onNewOpenChange}>
          <PopoverTrigger render={<Button type="button" variant="outline" className="w-full" />}>
            <HugeiconsIcon icon={Add01Icon} aria-hidden />
            {t('manys.newMany')}
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-72 p-0">
            <ManyCreateForm
              busy={busy}
              presetName={presetName}
              onCreate={async (input) => {
                const created = await onCreate(input);
                if (created) onNewOpenChange(false);
                return created;
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
}
