import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type DashboardTableColumn<T> = {
  id: string;
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
};

export type DashboardTableTab = {
  id: string;
  label: string;
  count?: number;
};

export function DashboardDataTable<T extends { id: string }>({
  tabs,
  tab,
  onTabChange,
  columns,
  rows,
  onRowClick,
  selectedId,
  emptyTitle,
  emptyDescription,
  loading = false,
  toolbarEnd,
  className,
}: {
  tabs?: DashboardTableTab[];
  tab?: string;
  onTabChange?: (tab: string) => void;
  columns: DashboardTableColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  emptyTitle: string;
  emptyDescription?: string;
  loading?: boolean;
  toolbarEnd?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      {tabs && tab && onTabChange ? (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
          <Tabs
            value={tab}
            onValueChange={(next) => {
              onTabChange(next);
            }}
          >
            <TabsList variant="line">
              {tabs.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.label}
                  {typeof item.count === 'number' ? (
                    <Badge variant="outline">{item.count}</Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {toolbarEnd ? <div className="ml-auto flex items-center gap-2">{toolbarEnd}</div> : null}
        </div>
      ) : toolbarEnd ? (
        <div className="flex justify-end pb-2">{toolbarEnd}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : rows.length === 0 ? (
          <Empty className="min-h-48 border-0">
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead key={column.id} className={cn('overflow-hidden', column.className)}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selectedId === row.id ? 'selected' : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <TableCell key={column.id} className={cn('overflow-hidden text-ellipsis', column.className)}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
