import type { ReactNode } from 'react';
import { HubSearch } from '@/components/hub/HubSearch';
import ListState from '@/components/shared/ListState';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { hubPageTitleClass } from '@/components/shared/hubChrome';

export type SortDir = 'az' | 'za';

export interface DirectoryFilterItem {
  value: string;
  label: string;
}

export type HubDirectoryColumnProps = {
  title?: string;
  action?: ReactNode;
  query?: string;
  onQueryChange?: (query: string) => void;
  queryPlaceholder?: string;
  queryClearLabel?: string;
  filter?: string;
  onFilterChange?: (filter: string) => void;
  filterItems?: DirectoryFilterItem[];
  filterAriaLabel?: string;
  sortDir?: SortDir;
  onSortDir?: (dir: SortDir) => void;
  sortAzLabel?: string;
  sortZaLabel?: string;
  filterAddon?: ReactNode;
  extraToolbar?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  empty?: { icon?: ReactNode; title: string; description: string };
  children: ReactNode;
};

export function HubDirectoryColumn({
  title,
  action,
  query,
  onQueryChange,
  queryPlaceholder,
  queryClearLabel,
  filter,
  onFilterChange,
  filterItems,
  filterAriaLabel,
  sortDir,
  onSortDir,
  sortAzLabel,
  sortZaLabel,
  filterAddon,
  extraToolbar,
  loading,
  loadingLabel,
  empty,
  children,
}: HubDirectoryColumnProps) {
  const filterLabel = filterItems?.find((item) => item.value === filter)?.label ?? filterItems?.[0]?.label;
  const showToolbar = Boolean(onQueryChange || onFilterChange || onSortDir || extraToolbar);
  const showTitleRow = Boolean(title || action);

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r md:w-96 md:basis-[36%] md:shrink-0">
      {showTitleRow ? (
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          {title ? <h2 className={hubPageTitleClass}>{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {showToolbar ? (
        <div className="flex flex-col gap-2 border-b px-3 py-2.5">
          {onQueryChange ? (
            <HubSearch
              value={query ?? ''}
              onChange={onQueryChange}
              placeholder={queryPlaceholder}
              aria-label={queryPlaceholder}
              clearLabel={queryClearLabel}
            />
          ) : null}
          {onFilterChange || onSortDir ? (
            <div className="flex items-center gap-1.5">
              {onFilterChange && filterItems ? (
                <Select
                  value={filter}
                  onValueChange={(next) => {
                    if (next) onFilterChange(next);
                  }}
                  items={filterItems}
                >
                  <SelectTrigger size="sm" className="h-6 min-w-0 flex-1" aria-label={filterAriaLabel}>
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
                ) : null}
              {filterAddon}
              {onSortDir && sortAzLabel && sortZaLabel ? (
                <Select
                  value={sortDir}
                  onValueChange={(next) => {
                    if (next === 'az' || next === 'za') onSortDir(next);
                  }}
                  items={[
                    { value: 'az', label: sortAzLabel },
                    { value: 'za', label: sortZaLabel },
                  ]}
                >
                  <SelectTrigger size="sm" className="h-6 w-20 shrink-0" aria-label={sortAzLabel}>
                    <SelectValue>{sortDir === 'za' ? sortZaLabel : sortAzLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="az">{sortAzLabel}</SelectItem>
                    <SelectItem value="za">{sortZaLabel}</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ) : null}
          {extraToolbar}
        </div>
      ) : (
        <div className="border-b" />
      )}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <ListState variant="loading" loadingLabel={loadingLabel} compact />
        ) : empty ? (
          <ListState
            variant="empty"
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            compact
          />
        ) : (
          children
        )}
      </ScrollArea>
    </div>
  );
}
