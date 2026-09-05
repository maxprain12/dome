import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, Tag01Icon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { HubDirectoryColumn } from '@/components/shared/HubDirectoryColumn';
import { hubDirectoryRowClass } from '@/components/shared/hubChrome';
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
    <HubDirectoryColumn
      query={query}
      onQueryChange={onQueryChange}
      queryPlaceholder={t('people.search_placeholder')}
      queryClearLabel={t('command.clear_search')}
      filter={filter}
      onFilterChange={onFilterChange}
      filterItems={filterItems}
      filterAriaLabel={t('people.filter_by')}
      sortDir={sortDir}
      onSortDir={setSortDir}
      sortAzLabel={t('people.sort_az')}
      sortZaLabel={t('people.sort_za')}
      filterAddon={
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
      }
      extraToolbar={
        people.length > 0 ? (
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
        ) : null
      }
      loading={loading && people.length === 0}
      loadingLabel={t('people.loading')}
      empty={
        people.length === 0 && !loading
          ? {
              icon: <HugeiconsIcon icon={UserMultiple02Icon} className="size-8" />,
              title: t('people.list_empty_title'),
              description: query.trim()
                ? t('people.list_empty_search', { query: query.trim() })
                : t('people.list_empty_description'),
            }
          : undefined
      }
    >
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
    </HubDirectoryColumn>
  );
}
