'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface PersonSummary {
  id: string;
  displayName: string;
}

function isPersonSummaryArray(value: unknown): value is PersonSummary[] {
  return Array.isArray(value);
}

/** Extract a valid `personIds: string[]` from a card/event `metadata` blob. */
export function personIdsFromMeta(meta: Record<string, unknown> | null | undefined): string[] {
  const raw = meta?.personIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

interface PeoplePickerProps {
  /** Active project/vault id, scopes the search. */
  projectId: string;
  personIds: string[];
  onChange: (personIds: string[]) => void;
  /** Show the search trigger + remove buttons. Defaults to true. */
  editable?: boolean;
  /** Which i18n namespace (`<namespace>.json`) supplies the section copy. */
  namespace?: 'pipelines' | 'calendarPage';
  className?: string;
}

/**
 * Minimal People soft-link picker: chips for linked people (resolved via
 * `people.get`) + a search popover (`people.search`) to add more. Shared by
 * pipeline cards and calendar events — both store `personIds` in their own
 * `metadata` JSON column, this component only knows about the id list.
 */
export default function PeoplePicker({
  projectId,
  personIds,
  onChange,
  editable = true,
  namespace = 'pipelines',
  className,
}: PeoplePickerProps) {
  const { t } = useTranslation();
  const tr = useCallback((key: string) => t(`${namespace}.${key}`), [t, namespace]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PersonSummary[]>([]);

  const linkedIds = useMemo(() => new Set(personIds), [personIds]);

  useEffect(() => {
    const missing = personIds.filter((id) => !(id in names));
    if (missing.length === 0) return;
    const api = window.electron?.people;
    if (!api?.getMany) return;
    let cancelled = false;
    void api
      .getMany({ ids: missing })
      .then((res) => {
        if (cancelled) return;
        const people = res.success ? (res.data?.people ?? []) : [];
        setNames((prev) => {
          const next = { ...prev };
          for (const id of missing) {
            if (!(id in next)) next[id] = '';
          }
          for (const person of people) {
            next[person.id] = person.displayName;
          }
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setNames((prev) => {
          const next = { ...prev };
          for (const id of missing) {
            if (!(id in next)) next[id] = '';
          }
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [personIds, names]);

  const search = useCallback(async () => {
    const api = window.electron?.people;
    const q = query.trim();
    if (!api?.search || !q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.search({ projectId, query: q });
      const people = res.success && isPersonSummaryArray(res.data?.people) ? res.data.people : [];
      setResults(
        people
          .filter((p) => !linkedIds.has(p.id))
          .map((p) => ({ id: p.id, displayName: p.displayName })),
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, query, linkedIds]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void search();
    }, query.trim() ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [open, search, query]);

  const addPerson = (person: PersonSummary) => {
    if (linkedIds.has(person.id)) return;
    setNames((prev) => ({ ...prev, [person.id]: person.displayName }));
    onChange([...personIds, person.id]);
    setQuery('');
    setResults((prev) => prev.filter((p) => p.id !== person.id));
  };

  const removePerson = (id: string) => {
    onChange(personIds.filter((pid) => pid !== id));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {tr('people_section')}
      </span>
      {personIds.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tr('people_empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {personIds.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 pr-1 font-normal">
              <span className="max-w-40 truncate">{names[id] || tr('people_unknown')}</span>
              {editable ? (
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={tr('remove_person')}
                  onClick={() => removePerson(id)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      )}
      {editable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button type="button" variant="outline" size="sm" className="self-start" />}>
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            {tr('link_person')}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('people_search_placeholder')}
            />
            <div className="mt-2 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {loading ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('common.loading')}</p>
              ) : results.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">{tr('people_no_results')}</p>
              ) : (
                results.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => addPerson(person)}
                  >
                    <span className="truncate">{person.displayName}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
