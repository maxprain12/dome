import { useState, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Slash } from 'lucide-react';
import { SlashCommandIcon } from '@/lib/tiptap/slash-icons';
import type { SlashCommand } from '@/lib/tiptap/slash-commands';
import { useSuggestionPortalPosition } from './useSuggestionPortalPosition';

interface SlashMenuProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

export interface SlashMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  ({ items, command }, ref) => {
    const { t } = useTranslation();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [menuFilter, setMenuFilter] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const visibleItems = useMemo(() => {
      const q = menuFilter.trim().toLowerCase();
      if (!q) return items;
      return items.filter((cmd) =>
        [cmd.title, cmd.description, cmd.category].some((s) => s.toLowerCase().includes(q)),
      );
    }, [items, menuFilter]);

    const [prevVisibleItems, setPrevVisibleItems] = useState(visibleItems);
    if (visibleItems !== prevVisibleItems) {
      setPrevVisibleItems(visibleItems);
      setSelectedIndex(0);
    }
    const [prevItems, setPrevItems] = useState(items);
    if (items !== prevItems) {
      setPrevItems(items);
      setMenuFilter('');
    }

    const selectItem = useCallback(
      (index: number) => {
        const item = visibleItems[index];
        if (item) command(item);
      },
      [visibleItems, command],
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          if (event.key === 'ArrowUp') {
            setSelectedIndex((i) =>
              visibleItems.length ? (i + visibleItems.length - 1) % visibleItems.length : 0,
            );
            return true;
          }
          if (event.key === 'ArrowDown') {
            setSelectedIndex((i) => (visibleItems.length ? (i + 1) % visibleItems.length : 0));
            return true;
          }
          if (event.key === 'Enter') {
            selectItem(selectedIndex);
            return true;
          }
          return false;
        },
      }),
      [visibleItems.length, selectedIndex, selectItem],
    );

    if (!items.length) return null;

    const groups: Record<string, SlashCommand[]> = {};
    for (const item of visibleItems) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }

    return (
      <div className="note-slash-menu-shell slash-menu-proto">
        {/* Search bar */}
        <div className="slash-search-row">
          <span className="slash-search-icon" aria-hidden>
            <Slash size={13} strokeWidth={2} />
          </span>
          <input
            ref={inputRef}
            className="slash-search-input"
            placeholder={t('notes.slash_filter_placeholder')}
            aria-label={t('notes.slash_filter_placeholder')}
            value={menuFilter}
            onChange={(e) => setMenuFilter(e.currentTarget.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span className="slash-kbd-chip">esc</span>
        </div>

        {/* Items list */}
        <div className="slash-items-list">
          {Object.entries(groups).map(([group, cmds]) => (
            <div key={group}>
              <div className="slash-section-header">{group}</div>
              {cmds.map((item) => {
                const globalIndex = visibleItems.indexOf(item);
                const isSelected = globalIndex === selectedIndex;
                return (
                  <button
                    key={`${group}-${item.title}`}
                    type="button"
                    className={`slash-item-btn${isSelected ? ' active' : ''}`}
                    onClick={() => selectItem(globalIndex)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                  >
                    <span
                      className={`slash-item-icon${item.accent ? ' slash-item-icon--accent' : ''}${isSelected ? ' is-active' : ''}`}
                    >
                      <SlashCommandIcon id={item.iconId} />
                    </span>
                    <div className="slash-item-text">
                      <div className="slash-item-name">{item.title}</div>
                      <div className="slash-item-desc">{item.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
          {visibleItems.length === 0 && (
            <div className="slash-empty">{t('notes.slash_no_results')}</div>
          )}
        </div>

        {/* Footer hints */}
        <div className="slash-footer note-slash-footer">
          <span>↑↓ {t('notes.slash_hint_nav')}</span>
          <span>↵ {t('notes.slash_hint_pick')}</span>
          <span>esc {t('notes.slash_hint_close')}</span>
        </div>
      </div>
    );
  },
);

SlashCommandMenu.displayName = 'SlashCommandMenu';

interface SlashMenuPortalProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
  clientRect: (() => DOMRect | null) | null;
  menuRef: React.RefObject<SlashMenuHandle | null>;
}

const SLASH_MENU_WIDTH = 340;

export function SlashMenuPortal({ items, command, clientRect, menuRef }: SlashMenuPortalProps) {
  const position = useSuggestionPortalPosition(
    clientRect,
    items.length > 0,
    SLASH_MENU_WIDTH,
    items,
  );

  if (!position || items.length === 0) return null;

  return createPortal(
    <div style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}>
      <SlashCommandMenu ref={menuRef as React.Ref<SlashMenuHandle>} items={items} command={command} />
    </div>,
    document.body,
  );
}
