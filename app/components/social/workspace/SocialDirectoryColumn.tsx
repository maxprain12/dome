import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ListState from '@/components/shared/ListState';
import { hubDirectoryRowClass, hubPageTitleClass } from '@/components/shared/hubChrome';

export type SortDir = 'az' | 'za';

export interface DirectoryFilterItem {
  value: string;
  label: string;
}

export function SocialDirectoryColumn({
  title,
  action,
  query,
  onQueryChange,
  queryPlaceholder,
  filter,
  onFilterChange,
  filterItems,
  filterAriaLabel,
  sortDir,
  onSortDir,
  sortAzLabel,
  sortZaLabel,
  loading,
  loadingLabel,
  empty,
  children,
}: {
  title: string;
  action?: ReactNode;
  query?: string;
  onQueryChange?: (query: string) => void;
  queryPlaceholder?: string;
  filter?: string;
  onFilterChange?: (filter: string) => void;
  filterItems?: DirectoryFilterItem[];
  filterAriaLabel?: string;
  sortDir?: SortDir;
  onSortDir?: (dir: SortDir) => void;
  sortAzLabel?: string;
  sortZaLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  empty?: { icon?: ReactNode; title: string; description: string };
  children: ReactNode;
}) {
  const filterLabel = filterItems?.find((item) => item.value === filter)?.label ?? filterItems?.[0]?.label;
  const showToolbar = Boolean(onQueryChange || onFilterChange || onSortDir);

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r md:w-96 md:basis-[36%] md:shrink-0">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h2 className={hubPageTitleClass}>{title}</h2>
        {action}
      </div>
      {showToolbar ? (
        <div className="flex flex-col gap-2 border-b px-3 py-2.5">
          {onQueryChange ? (
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                size={14}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query ?? ''}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={queryPlaceholder}
                aria-label={queryPlaceholder}
                className="pl-7"
              />
            </div>
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

export function SocialDirectoryRow({
  selected,
  onClick,
  mark,
  title,
  subtitle,
  meta,
}: {
  selected: boolean;
  onClick: () => void;
  mark?: ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
}) {
  return (
    <li className="border-b border-border/80 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className={hubDirectoryRowClass(selected)}
      >
        {mark}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold">{title}</span>
          {subtitle ? (
            <span className="truncate text-[0.6875rem] text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        {meta ? (
          <span className="hidden shrink-0 text-[0.6875rem] text-muted-foreground @[16rem]/social-row:block">
            {meta}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function SocialFichaEmpty({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ListState variant="empty" icon={icon} title={title} description={description} fullHeight />
    </div>
  );
}

export function SocialHubSplit({ children }: { children: ReactNode }) {
  return <div className="@container/social-row flex h-full min-h-0 flex-1 overflow-hidden">{children}</div>;
}
