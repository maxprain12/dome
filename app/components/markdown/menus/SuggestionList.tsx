import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from '@/lib/utils';
import type { MenuEntry } from './menu-types';

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SuggestionListProps {
  items: MenuEntry[];
  command: (item: MenuEntry) => void;
  query?: string;
}

const SuggestionList = forwardRef<SuggestionListHandle, SuggestionListProps>(function SuggestionList({ items, command, query }, ref) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const safeIndex = items.length === 0 ? 0 : index % items.length;

  useEffect(() => {
    setIndex(0);
  }, [query, items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        setIndex((current) => (current + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setIndex((current) => (current - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[safeIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }), [command, items, safeIndex]);

  let previousGroup = '';
  return (
    <div
      className="z-50 w-72 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      role="listbox"
      tabIndex={-1}
      aria-label={t('notes.slash_filter_placeholder')}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.length === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground">{t('notes.slash_no_results')}</p> : null}
      {items.map((item, itemIndex) => {
        const showGroup = Boolean(item.group) && item.group !== previousGroup;
        previousGroup = item.group || previousGroup;
        const selected = itemIndex === safeIndex;
        return (
          <div key={item.id}>
            {showGroup ? <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{item.group}</p> : null}
            <button
              type="button"
              tabIndex={-1}
              role="option"
              aria-selected={selected}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')}
              onMouseDown={(event) => {
                event.preventDefault();
                command(item);
              }}
              onMouseEnter={() => setIndex(itemIndex)}
            >
              {item.icon ? <HugeiconsIcon icon={item.icon} size={15} className="shrink-0 text-muted-foreground" /> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
});

export default SuggestionList;
