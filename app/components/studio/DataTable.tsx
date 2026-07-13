
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowUpDownIcon,
  ArrowUp02Icon,
  ArrowDown02Icon,
  Download04Icon,
  Search01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { DataTableData } from '@/types';

interface DataTableProps {
  data: DataTableData;
  title?: string;
  onClose?: () => void;
}

type SortDirection = 'asc' | 'desc' | null;

function DataTableSortIcon({
  columnKey,
  sortKey,
  sortDir,
}: {
  columnKey: string;
  sortKey: string | null;
  sortDir: SortDirection;
}) {
  if (sortKey !== columnKey) return <HugeiconsIcon icon={ArrowUpDownIcon} size={12} className="opacity-30" />;
  if (sortDir === 'asc') return <HugeiconsIcon icon={ArrowUp02Icon} size={12} className="text-primary" />;
  return <HugeiconsIcon icon={ArrowDown02Icon} size={12} className="text-primary" />;
}

export default function DataTable({ data, title, onClose }: DataTableProps) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filterText, setFilterText] = useState('');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
      else setSortDir('asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey, sortDir]);

  const filteredAndSorted = useMemo(() => {
    let rows = [...data.rows];

    // Filter
    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      rows = rows.filter(row =>
        data.columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(lower))
      );
    }

    // Sort
    if (sortKey && sortDir) {
      rows.sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return rows;
  }, [data, sortKey, sortDir, filterText]);

  const handleExportCSV = useCallback(() => {
    const header = data.columns.map(c => `"${c.label}"`).join(',');
    const rows = filteredAndSorted.map(row =>
      data.columns.map(c => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header, ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'data-table'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data.columns, filteredAndSorted, title]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 border-border">
        <h3 className="text-sm font-semibold text-foreground">
          {title || t('studio.data_table')}
        </h3>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleExportCSV} variant="ghost" className="p-2 min-h-[44px] flex items-center gap-1 text-xs rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={t('studio.export_csv_aria')} title={t('studio.export_csv')}>
            <HugeiconsIcon icon={Download04Icon} size={14} />
            <span>CSV</span>
          </Button>
          {onClose && (
            <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={t('ui.close')} title={t('ui.close')}><HugeiconsIcon icon={Cancel01Icon} size={16} /></Button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="px-4 py-2 border-b border-border">
        <div className="relative">
          <label htmlFor="datatable-filter-rows" className="sr-only">{t('studio.filter_rows_label')}</label>
          <HugeiconsIcon icon={Search01Icon} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="datatable-filter-rows"
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={t('studio.filter_rows_placeholder')}
            className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {data.columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="sticky top-0 px-4 py-2.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap"
                  style={{
                    background: 'var(--card)',
                    borderBottom: '2px solid var(--border)',
                    color: sortKey === col.key ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    <DataTableSortIcon columnKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="transition-colors"
                style={{ background: rowIdx % 2 === 0 ? 'transparent' : 'var(--card)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 12%, transparent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = rowIdx % 2 === 0 ? 'transparent' : 'var(--card)'; }}
              >
                {data.columns.map(col => (
                  <td
                    key={col.key}
                    className="px-4 py-2 whitespace-nowrap"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
            {filteredAndSorted.length === 0 && (
              <tr>
                <td
                  colSpan={data.columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {filterText ? t('studio.no_matching_rows') : t('studio.no_data')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        {t('studio.rows_progress', { shown: filteredAndSorted.length, total: data.rows.length })}
        {filterText ? ` (${t('studio.filtered_hint')})` : ''}
      </div>
    </div>
  );
}
