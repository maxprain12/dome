import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableData, StudioOutput } from '@/types';
import LearnViewerEmpty from '../LearnViewerEmpty';

interface TableViewProps {
  output: StudioOutput;
  onBack: () => void;
}

export default function TableView({ output, onBack }: TableViewProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const { data, corrupt } = useMemo(() => {
    if (!output.content) return { data: { columns: [], rows: [] } as DataTableData, corrupt: false };
    try {
      return { data: JSON.parse(output.content) as DataTableData, corrupt: false };
    } catch {
      return { data: { columns: [], rows: [] } as DataTableData, corrupt: true };
    }
  }, [output.content]);

  const rows = useMemo(() => {
    let list = [...data.rows];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    if (sortKey) {
      list.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
        return sortAsc ? cmp : -cmp;
      });
    }
    return list;
  }, [data.rows, query, sortKey, sortAsc]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (data.columns.length === 0 || data.rows.length === 0) {
    return <LearnViewerEmpty onBack={onBack} corrupt={corrupt} />;
  }

  return (
    <div className="lr-table-view">
      <div className="lr-table-hd">
        <button type="button" className="lr-deck-back" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden />
          {t('learn.back_to_library', 'Back to library')}
        </button>
        <h1>{output.title}</h1>
        <label className="lr-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('learn.table_search', 'Search table…')}
          />
        </label>
      </div>
      <div className="lr-table-wrap">
        <table className="lr-table">
          <thead>
            <tr>
              {data.columns.map((col) => (
                <th key={col.key}>
                  <button type="button" className="lr-table-sort" onClick={() => toggleSort(col.key)}>
                    {col.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {data.columns.map((col) => (
                  <td key={col.key}>{row[col.key] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
