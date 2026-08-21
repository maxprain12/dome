import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, Search01Icon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import ListState from '@/components/shared/ListState';
import { cn } from '@/lib/utils';
import { resolveInstagramLead } from './instagramLead';
import { leadStatusBadgeVariant, personDisplayLabel, personInitial } from './peopleLabels';
import type { PeopleFilter, PersonSummary } from './peopleTypes';

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
  deleting?: boolean;
}

const FILTERS: PeopleFilter[] = ['all', 'lead', 'customer', 'archived'];

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
  deleting = false,
}: PeopleListProps) {
  const { t } = useTranslation();
  const allChecked = people.length > 0 && people.every((p) => checkedIds.has(p.id));
  const someChecked = people.some((p) => checkedIds.has(p.id));
  const checkedCount = checkedIds.size;

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r sm:w-72 md:w-80">
      <div className="flex flex-col gap-2 border-b p-2.5">
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
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filter === f ? 'secondary' : 'outline'}
              onClick={() => onFilterChange(f)}
              className="h-6 px-2 text-[0.6875rem]"
            >
              {t(`people.filter_${f}`)}
            </Button>
          ))}
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
          <ul className="flex flex-col gap-0.5 p-1.5">
            {people.map((person) => {
              const isChecked = checkedIds.has(person.id);
              const ig = resolveInstagramLead(person);
              const subtitle = ig?.handle
                ? `@${ig.handle.replace(/^@/, '')}`
                : person.primaryEmail || null;
              return (
                <li key={person.id}>
                  <div
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent',
                      selectedId === person.id && 'bg-accent',
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(value) => onToggleChecked(person.id, value === true)}
                      aria-label={t('people.select_person', { name: personDisplayLabel(person) })}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      onClick={() => onSelect(person.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
                        <span className="truncate text-xs font-medium">{personDisplayLabel(person)}</span>
                        {subtitle ? (
                          <span className="truncate text-[0.6875rem] text-muted-foreground">
                            {subtitle}
                          </span>
                        ) : null}
                      </div>
                      <Badge variant={leadStatusBadgeVariant(person.leadStatus)}>
                        {t(`people.lead_status_${person.leadStatus ?? 'lead'}`)}
                      </Badge>
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
