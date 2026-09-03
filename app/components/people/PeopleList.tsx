import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, PlusSignIcon, Search01Icon, Tag01Icon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ListState from '@/components/shared/ListState';
import { hubDirectoryRowClass, hubPageTitleClass } from '@/components/shared/hubChrome';
import { cn } from '@/lib/utils';
import { resolveInstagramLead } from './instagramLead';
import { personDirectorySubtitle, personPhone } from './peopleContactActions';
import { personDisplayLabel, personInitial } from './peopleLabels';
import { BUILTIN_PERSON_STATUSES, personStatusLabel, type CustomPersonStatus } from './personStatuses';
import type { PeopleFilter, PersonSummary } from './peopleTypes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface PeopleListProps {
  people: PersonSummary[];
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  filter: PeopleFilter;
  onFilterChange: (filter: PeopleFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  checkedIds: Set<string>;
  onToggleChecked: (id: string, checked: boolean) => void;
  onToggleAllChecked: (checked: boolean) => void;
  onDeleteChecked: () => void;
  onCreate: () => void;
  onManageStatuses: () => void;
  customs?: CustomPersonStatus[];
  deleting?: boolean;
}

export default function PeopleList({
  people,
  loading,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  checkedIds,
  onToggleChecked,
  onToggleAllChecked,
  onDeleteChecked,
  onCreate,
  onManageStatuses,
  customs = [],
  deleting = false,
}: PeopleListProps) {
  const { t } = useTranslation();
  const [sortDir, setSortDir] = useState<'az' | 'za'>('az');
  const allChecked = people.length > 0 && people.every((p) => checkedIds.has(p.id));
  const someChecked = people.some((p) => checkedIds.has(p.id));
  const checkedCount = checkedIds.size;
  const statusIds = useMemo(
    () => [...BUILTIN_PERSON_STATUSES, ...customs.map((row) => row.id)],
    [customs],
  );
  const filterItems = useMemo(
    () => [
      { value: 'all', label: t('people.filter_all') },
      ...statusIds.map((id) => ({ value: id, label: personStatusLabel(id, t, customs) })),
    ],
    [customs, statusIds, t],
  );
  const filterLabel =
    filter === 'all' ? t('people.filter_all') : personStatusLabel(filter, t, customs);

  const sortedPeople = useMemo(() => {
    const next = [...people];
    next.sort((a, b) => {
      const cmp = personDisplayLabel(a).localeCompare(personDisplayLabel(b), undefined, {
        sensitivity: 'base',
      });
      return sortDir === 'az' ? cmp : -cmp;
    });
    return next;
  }, [people, sortDir]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r md:w-96 md:basis-[36%] md:shrink-0">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h1 className={hubPageTitleClass}>{t('people.hub_title')}</h1>
        <Button type="button" size="sm" onClick={onCreate}>
          <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
          {t('people.new_person')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-b px-3 py-2.5">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('people.search_placeholder')}
            aria-label={t('people.search_placeholder')}
            className="pl-7"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Select
            value={filter}
            onValueChange={(next) => {
              if (next) onFilterChange(next);
            }}
            items={filterItems}
          >
            <SelectTrigger size="sm" className="h-6 min-w-0 flex-1" aria-label={t('people.filter_by')}>
              <SelectValue>{filterLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {filterItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={onManageStatuses}
            aria-label={t('people.manage_statuses')}
            title={t('people.manage_statuses')}
          >
            <HugeiconsIcon icon={Tag01Icon} />
          </Button>
          <Select
            value={sortDir}
            onValueChange={(next) => {
              if (next === 'az' || next === 'za') setSortDir(next);
            }}
            items={[
              { value: 'az', label: t('people.sort_az') },
              { value: 'za', label: t('people.sort_za') },
            ]}
          >
            <SelectTrigger size="sm" className="h-6 w-20 shrink-0" aria-label={t('people.sort_az')}>
              <SelectValue>{sortDir === 'az' ? t('people.sort_az') : t('people.sort_za')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="az">{t('people.sort_az')}</SelectItem>
              <SelectItem value="za">{t('people.sort_za')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {people.length > 0 ? (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allChecked}
              indeterminate={!allChecked && someChecked}
              onCheckedChange={(value) => onToggleAllChecked(value === true)}
              aria-label={t('people.select_all')}
            />
            <span className="text-[0.6875rem] text-muted-foreground">
              {checkedCount > 0
                ? t('people.selected_count', { count: checkedCount })
                : t('people.select_all')}
            </span>
            {checkedCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="ml-auto h-6 px-2 text-[0.6875rem]"
                disabled={deleting}
                onClick={onDeleteChecked}
              >
                <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                {t('people.delete_selected')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading && people.length === 0 ? (
          <ListState variant="loading" loadingLabel={t('people.loading')} compact />
        ) : people.length === 0 ? (
          <ListState
            variant="empty"
            icon={<HugeiconsIcon icon={UserMultiple02Icon} className="size-8" />}
            title={t('people.list_empty_title')}
            description={
              query.trim()
                ? t('people.list_empty_search', { query: query.trim() })
                : t('people.list_empty_description')
            }
            compact
          />
        ) : (
          <ul className="flex flex-col">
            {sortedPeople.map((person) => {
              const isChecked = checkedIds.has(person.id);
              const ig = resolveInstagramLead(person);
              const subtitle = personDirectorySubtitle(person, ig?.handle);
              const phone = personPhone(person);
              const email = person.primaryEmail?.trim() || null;
              return (
                <li key={person.id} className="border-b border-border/80 last:border-b-0">
                  <div
                    className={cn(
                      '@container/people-row',
                      hubDirectoryRowClass(selectedId === person.id, 'gap-2'),
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(value) => onToggleChecked(person.id, value === true)}
                      aria-label={t('people.select_person', { name: personDisplayLabel(person) })}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => onSelect(person.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <Avatar size="sm">
                        {ig?.avatarUrl || person.avatarUrl ? (
                          <AvatarImage
                            src={ig?.avatarUrl || person.avatarUrl || undefined}
                            alt={personDisplayLabel(person)}
                          />
                        ) : null}
                        <AvatarFallback>{personInitial(person)}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-semibold">{personDisplayLabel(person)}</span>
                        {subtitle ? (
                          <span className="truncate text-[0.6875rem] text-muted-foreground">
                            {subtitle}
                          </span>
                        ) : null}
                      </div>
                      {phone || email ? (
                        <div className="hidden min-w-0 max-w-[8.5rem] shrink-0 flex-col items-end @[16rem]/people-row:flex">
                          {phone ? (
                            <span className="truncate text-[0.6875rem] text-muted-foreground">{phone}</span>
                          ) : null}
                          {email ? (
                            <span className="truncate text-[0.6875rem] text-muted-foreground">{email}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
