import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Tag01Icon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HubSearch } from '@/components/hub/HubSearch';
import { cn } from '@/lib/utils';
import { resolveInstagramLead } from './instagramLead';
import { leadStatusBadgeVariant, personDisplayLabel, personInitial } from './peopleLabels';
import {
  PEOPLE_PAGE_SIZES,
  formatPersonDate,
  paginatePeople,
  personCompany,
  personSourceKey,
  sortPeople,
  visiblePageNumbers,
  type PeoplePageSize,
  type PeopleSort,
} from './peopleTable';
import { BUILTIN_PERSON_STATUSES, personStatusLabel, type CustomPersonStatus } from './personStatuses';
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
  onToggleAllChecked: (ids: string[], checked: boolean) => void;
  onDeletePeople: (ids: string[]) => void;
  onManageStatuses: () => void;
  onCreate: () => void;
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
  onDeletePeople,
  onManageStatuses,
  onCreate,
  customs = [],
  deleting = false,
}: PeopleListProps) {
  const { t, i18n } = useTranslation();
  const [sort, setSort] = useState<PeopleSort>('name_az');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PeoplePageSize>(25);

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
  const sortItems = useMemo(
    () => [
      { value: 'name_az' as const, label: t('people.sort_az') },
      { value: 'name_za' as const, label: t('people.sort_za') },
      { value: 'newest' as const, label: t('people.sort_newest') },
      { value: 'last_seen' as const, label: t('people.sort_last_seen') },
    ],
    [t],
  );

  const sortedPeople = useMemo(() => sortPeople(people, sort), [people, sort]);
  const paged = useMemo(
    () => paginatePeople(sortedPeople, page, pageSize),
    [page, pageSize, sortedPeople],
  );

  useEffect(() => {
    setPage(1);
  }, [query, filter, sort, pageSize]);

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page);
  }, [page, paged.page]);

  const pageIds = paged.rows.map((row) => row.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => checkedIds.has(id));
  const someChecked = pageIds.some((id) => checkedIds.has(id));
  const checkedCount = checkedIds.size;
  const selectedFilter = filterItems.find((item) => item.value === filter);
  const selectedSort = sortItems.find((item) => item.value === sort);
  const selectedPageSize = String(pageSize);

  const sourceLabel = (person: PersonSummary) => {
    const key = personSourceKey(person);
    if (key === 'unknown') return t('people.source_unknown');
    return t(`people.source_${key}`);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <HubSearch
          className="min-w-48 max-w-sm flex-1"
          value={query}
          onChange={onQueryChange}
          placeholder={t('people.search_placeholder')}
          aria-label={t('people.search_placeholder')}
          clearLabel={t('command.clear_search')}
        />
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
              {checkedCount > 0
                ? t('people.selected_count', { count: checkedCount })
                : t('people.bulk_action')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={checkedCount === 0 || deleting}
                  onClick={() => onDeletePeople(Array.from(checkedIds))}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                  {t('people.delete_selected')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Select
            value={filter}
            items={filterItems}
            onValueChange={(value) => {
              if (value) onFilterChange(String(value));
            }}
          >
            <SelectTrigger size="default" aria-label={t('people.filter_by')}>
              <SelectValue>{selectedFilter?.label ?? t('people.filter_all')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {filterItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            items={sortItems}
            onValueChange={(value) => {
              if (value === 'name_az' || value === 'name_za' || value === 'newest' || value === 'last_seen') {
                setSort(value);
              }
            }}
          >
            <SelectTrigger size="default" aria-label={t('people.sort_by')}>
              <SelectValue>{selectedSort?.label ?? t('people.sort_az')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
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
          <Button type="button" size="sm" onClick={onCreate}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('people.new_person')}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {loading && people.length === 0 ? (
          <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label={t('people.loading')}>
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : people.length === 0 ? (
          <Empty className="min-h-64 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={UserMultiple02Icon} />
              </EmptyMedia>
              <EmptyTitle>{t('people.list_empty_title')}</EmptyTitle>
              <EmptyDescription>
                {query.trim()
                  ? t('people.list_empty_search', { query: query.trim() })
                  : t('people.list_empty_description')}
              </EmptyDescription>
            </EmptyHeader>
            {!query.trim() ? (
              <EmptyContent>
                <Button type="button" size="sm" onClick={onCreate}>
                  {t('people.new_person')}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allChecked}
                        indeterminate={!allChecked && someChecked}
                        onCheckedChange={(value) => onToggleAllChecked(pageIds, value === true)}
                        aria-label={t('people.select_all')}
                      />
                    </TableHead>
                    <TableHead>{t('people.col_name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('people.col_company')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t('people.col_source')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t('people.col_created')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{t('people.col_last_seen')}</TableHead>
                    <TableHead>{t('people.col_status')}</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">{t('people.more_actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.rows.map((person) => {
                    const ig = resolveInstagramLead(person);
                    const name = personDisplayLabel(person);
                    const company = personCompany(person);
                    const isSelected = selectedId === person.id;
                    const isChecked = checkedIds.has(person.id);
                    return (
                      <TableRow
                        key={person.id}
                        data-state={isSelected ? 'selected' : undefined}
                        className={cn(
                          'cursor-pointer hover:bg-brand-mint/55',
                          isSelected && 'bg-brand-mint/70 hover:bg-brand-mint',
                        )}
                        onClick={() => onSelect(person.id)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(value) => onToggleChecked(person.id, value === true)}
                            aria-label={t('people.select_person', { name })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar size="sm">
                              {ig?.avatarUrl || person.avatarUrl ? (
                                <AvatarImage
                                  src={ig?.avatarUrl || person.avatarUrl || undefined}
                                  alt={name}
                                />
                              ) : null}
                              <AvatarFallback>{personInitial(person)}</AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">{name}</span>
                              {person.primaryEmail ? (
                                <span className="truncate text-[0.6875rem] text-muted-foreground">
                                  {person.primaryEmail}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell">
                          {company || t('people.empty_cell')}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {sourceLabel(person)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {formatPersonDate(person.firstSeenAt, i18n.language)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground xl:table-cell">
                          {formatPersonDate(person.lastSeenAt, i18n.language)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={leadStatusBadgeVariant(person.leadStatus)}>
                            {personStatusLabel(person.leadStatus, t, customs)}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button type="button" variant="ghost" size="icon-sm" />}
                              aria-label={t('people.more_actions')}
                            >
                              <HugeiconsIcon icon={MoreHorizontalIcon} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuGroup>
                                <DropdownMenuItem onClick={() => onSelect(person.id)}>
                                  {t('people.row_open')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={deleting}
                                  onClick={() => onDeletePeople([person.id])}
                                >
                                  {t('people.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
              <p className="text-[0.6875rem] text-muted-foreground">
                {t('people.showing_range', {
                  from: paged.from,
                  to: paged.to,
                  total: paged.total,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={paged.page <= 1}
                        aria-label={t('people.page_prev')}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        <HugeiconsIcon icon={ArrowLeft01Icon} />
                      </Button>
                    </PaginationItem>
                    {visiblePageNumbers(paged.page, paged.totalPages).map((item, index) =>
                      item === 'ellipsis' ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <Button
                            type="button"
                            variant={item === paged.page ? 'outline' : 'ghost'}
                            size="icon-sm"
                            aria-current={item === paged.page ? 'page' : undefined}
                            onClick={() => setPage(item)}
                          >
                            {item}
                          </Button>
                        </PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={paged.page >= paged.totalPages}
                        aria-label={t('people.page_next')}
                        onClick={() => setPage((current) => Math.min(paged.totalPages, current + 1))}
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} />
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
                <Select
                  value={selectedPageSize}
                  items={PEOPLE_PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
                  onValueChange={(value) => {
                    const next = Number(value);
                    if ((PEOPLE_PAGE_SIZES as readonly number[]).includes(next)) {
                      setPageSize(next as PeoplePageSize);
                    }
                  }}
                >
                  <SelectTrigger size="sm" aria-label={t('people.page_size')}>
                    <SelectValue>{selectedPageSize}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {PEOPLE_PAGE_SIZES.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
