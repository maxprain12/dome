
import { useState, useMemo, useCallback } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Search, X } from 'lucide-react';
import type { DataTableData } from '@/types';

interface DataTableProps {
  data: DataTableData;
  title?: string;
  onClose?: () => void;
}

type SortDirection = 'asc' | 'desc' | null;

export default function DataTable({ data, title, onClose }: DataTableProps) {
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

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) return <ArrowUpDown size={12} className="opacity-30" />;
    if (sortDir === 'asc') return <ArrowUp size={12} style={{ color: 'var(--dome-accent, #596037)' }} />;
    return <ArrowDown size={12} style={{ color: 'var(--dome-accent, #596037)' }} />;
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
          {title || 'Data Table'}
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="btn btn-ghost p-2 min-h-[44px] flex items-center gap-1 text-xs rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" aria-label="Export CSV" title="Export CSV">
            <Download size={14} />
            <span>CSV</span>
          </button>
          {onClose && (
            <button onClick={onClose} className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" aria-label="Close" title="Close"><X size={16} /></button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="relative">
          <label htmlFor="datatable-filter-rows" className="sr-only">Filter rows</label>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--tertiary-text)' }} />
          <input
            id="datatable-filter-rows"
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter rows..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--primary-text)',
              outline: 'none',
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
                    background: 'var(--bg-secondary)',
                    borderBottom: '2px solid var(--border)',
                    color: sortKey === col.key ? 'var(--dome-accent, #596037)' : 'var(--secondary-text)',
                  }}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    <SortIcon columnKey={col.key} />
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
                style={{ background: rowIdx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dome-accent-bg, #F5F3EE)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = rowIdx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)'; }}
              >
                {data.columns.map(col => (
                  <td
                    key={col.key}
                    className="px-4 py-2 whitespace-nowrap"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--primary-text)',
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
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--tertiary-text)' }}
                >
                  {filterText ? 'No matching rows' : 'No data'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--tertiary-text)' }}>
        {filteredAndSorted.length} of {data.rows.length} rows
        {filterText && ` (filtered)`}
      </div>
    </div>
  );
}
