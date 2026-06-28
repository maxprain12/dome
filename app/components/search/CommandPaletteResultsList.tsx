'use client';

import { ArrowRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaletteRow, SearchResourceRow } from './commandPaletteTypes';

export function CommandPaletteResultsList({
  showEmptyQuery,
  showNoResults,
  trimmedQuery,
  quickActions,
  navigationDestinations,
  filteredNav,
  resources,
  interactions,
  flatRows,
  selectedIndex,
  setSelectedIndex,
  listRef,
}: {
  showEmptyQuery: boolean;
  showNoResults: boolean;
  trimmedQuery: string;
  quickActions: PaletteRow[];
  navigationDestinations: PaletteRow[];
  filteredNav: PaletteRow[];
  resources: SearchResourceRow[];
  interactions: SearchResourceRow[];
  flatRows: PaletteRow[];
  selectedIndex: number | undefined;
  setSelectedIndex: (index: number) => void;
  listRef: React.Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();

  let runningIndex = -1;
  const nextIndex = () => {
    runningIndex += 1;
    return runningIndex;
  };

  const renderRow = (row: PaletteRow) => {
    const idx = nextIndex();
    const isSelected = selectedIndex === idx;
    return (
      <button
        key={row.id}
        type="button"
        data-palette-index={idx}
        onMouseEnter={() => setSelectedIndex(idx)}
        onClick={() => row.run()}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
        style={{
          background: isSelected ? 'var(--dome-surface)' : 'transparent',
          color: 'var(--dome-text)',
        }}
      >
        <span style={{ color: row.kind === 'nav' ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}>
          {row.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
        {row.sublabel ? (
          <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
            {row.sublabel}
          </span>
        ) : null}
        {row.kind === 'nav' ? (
          <ArrowRight className="size-3.5 shrink-0 opacity-40" strokeWidth={1.5} />
        ) : null}
      </button>
    );
  };

  return (
    <div ref={listRef} className="max-h-[min(420px,55vh)] overflow-y-auto p-2">
      {showEmptyQuery ? (
        <>
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
            {t('command.quick_actions')}
          </p>
          <div className="mb-2 flex flex-col gap-0.5">
            {quickActions.map((row) => renderRow(row))}
          </div>
          <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
            {t('command.navigate')}
          </p>
          <div className="flex flex-col gap-0.5">
            {navigationDestinations.map((row) => renderRow(row))}
          </div>
        </>
      ) : null}

      {!showEmptyQuery && filteredNav.length > 0 ? (
        <>
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
            {t('command.navigate')}
          </p>
          <div className="mb-2 flex flex-col gap-0.5">
            {filteredNav.map((row) => renderRow(row))}
          </div>
        </>
      ) : null}

      {!showEmptyQuery && resources.length > 0 ? (
        <>
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
            {t('command.resources')}
          </p>
          <div className="mb-2 flex flex-col gap-0.5">
            {resources.map((r) => {
              const row = flatRows.find((x) => x.id === `resource:${r.id}`);
              return row ? renderRow(row) : null;
            })}
          </div>
        </>
      ) : null}

      {!showEmptyQuery && interactions.length > 0 ? (
        <>
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
            {t('command.notes_annotations')}
          </p>
          <div className="flex flex-col gap-0.5">
            {interactions.map((r, index) => {
              const row = flatRows.find((x) => x.id === `interaction:${r.id}:${index}`);
              return row ? renderRow(row) : null;
            })}
          </div>
        </>
      ) : null}

      {showNoResults ? (
        <div className="px-4 py-10 text-center">
          <Search className="mx-auto mb-2 size-7" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('command.no_results', { query: trimmedQuery })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
