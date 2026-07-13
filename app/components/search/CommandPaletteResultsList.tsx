'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
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
    return (
      <CommandItem
        key={row.id}
        value={row.id}
        data-palette-index={idx}
        onMouseEnter={() => setSelectedIndex(idx)}
        onSelect={() => row.run()}
        className="gap-3"
        data-selected={selectedIndex === idx ? 'true' : undefined}
      >
        {row.kind === 'resource' || row.kind === 'interaction' ? (
          <ResourceIcon type={row.type} name={row.label} size={16} className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <HugeiconsIcon icon={row.icon} className={row.kind === 'nav' ? 'text-primary' : 'text-muted-foreground'} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
        {row.sublabel ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {row.sublabel}
          </span>
        ) : null}
        {row.kind === 'nav' ? (
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0 opacity-40" />
        ) : null}
      </CommandItem>
    );
  };

  return (
    <CommandList ref={listRef} className="max-h-[min(420px,55vh)] p-1">
      {showEmptyQuery ? (
        <>
          <CommandGroup heading={t('command.quick_actions')}>
            {quickActions.map((row) => renderRow(row))}
          </CommandGroup>
          <CommandGroup heading={t('command.navigate')}>
            {navigationDestinations.map((row) => renderRow(row))}
          </CommandGroup>
        </>
      ) : null}

      {!showEmptyQuery && filteredNav.length > 0 ? (
        <>
          <CommandGroup heading={t('command.navigate')}>
            {filteredNav.map((row) => renderRow(row))}
          </CommandGroup>
        </>
      ) : null}

      {!showEmptyQuery && resources.length > 0 ? (
        <>
          <CommandGroup heading={t('command.resources')}>
            {resources.map((r) => {
              const row = flatRows.find((x) => x.id === `resource:${r.id}`);
              return row ? renderRow(row) : null;
            })}
          </CommandGroup>
        </>
      ) : null}

      {!showEmptyQuery && interactions.length > 0 ? (
        <>
          <CommandGroup heading={t('command.notes_annotations')}>
            {interactions.map((r, index) => {
              const row = flatRows.find((x) => x.id === `interaction:${r.id}:${index}`);
              return row ? renderRow(row) : null;
            })}
          </CommandGroup>
        </>
      ) : null}

      {showNoResults ? (
        <CommandEmpty className="px-4 py-10">
          <HugeiconsIcon icon={Search01Icon} className="mx-auto mb-2 size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('command.no_results', { query: trimmedQuery })}
          </p>
        </CommandEmpty>
      ) : null}
    </CommandList>
  );
}
