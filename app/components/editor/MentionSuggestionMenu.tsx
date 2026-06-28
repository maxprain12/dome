import {
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type CSSProperties,
  type RefObject,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { DomeMentionItem } from '@/lib/tiptap/extensions/resource-mention';
import { useSuggestionPortalPosition } from './useSuggestionPortalPosition';

export interface MentionMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionSuggestionMenuProps {
  items: DomeMentionItem[];
  command: (item: DomeMentionItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

const menuContainerStyle: CSSProperties = {
  background: 'var(--dome-surface)',
  border: '1px solid var(--dome-border)',
  borderRadius: 8,
  padding: '6px',
  minWidth: 220,
  maxHeight: 260,
  overflowY: 'auto',
};

export const MentionSuggestionMenu = forwardRef<MentionMenuHandle, MentionSuggestionMenuProps>(
  ({ items, command }, ref) => {
    const { t } = useTranslation();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [prevItems, setPrevItems] = useState(items);
    if (items !== prevItems) {
      setPrevItems(items);
      setSelectedIndex(0);
    }

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          if (items.length === 0) return false;
          if (event.key === 'ArrowUp') {
            setSelectedIndex((i) => (i + items.length - 1) % items.length);
            return true;
          }
          if (event.key === 'ArrowDown') {
            setSelectedIndex((i) => (i + 1) % items.length);
            return true;
          }
          if (event.key === 'Enter') {
            selectItem(selectedIndex);
            return true;
          }
          return false;
        },
      }),
      [items.length, selectedIndex, selectItem],
    );

    if (!items.length) {
      return (
        <div
          className="mention-suggestion-menu note-mention-menu-shell mention-suggestion-menu--empty"
          style={{
            ...menuContainerStyle,
            overflowY: 'hidden',
            color: 'var(--dome-text-muted)',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          {t('focused_editor.mention_no_matches')}
        </div>
      );
    }

    return (
      <div className="mention-suggestion-menu note-mention-menu-shell" style={menuContainerStyle}>
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                width: '100%',
                padding: '7px 10px',
                border: 'none',
                borderRadius: 6,
                background: isSelected ? 'var(--dome-bg-hover)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dome-text)' }}>{item.label}</span>
              <span style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>{item.type}</span>
            </button>
          );
        })}
      </div>
    );
  },
);

MentionSuggestionMenu.displayName = 'MentionSuggestionMenu';

interface MentionMenuPortalProps {
  items: DomeMentionItem[];
  command: (item: DomeMentionItem) => void;
  clientRect: (() => DOMRect | null) | null;
  menuRef: RefObject<MentionMenuHandle | null>;
}

const MENTION_MENU_WIDTH = 240;

export function MentionMenuPortal({ items, command, clientRect, menuRef }: MentionMenuPortalProps) {
  const position = useSuggestionPortalPosition(clientRect, true, MENTION_MENU_WIDTH, items);

  if (!position) return null;

  return createPortal(
    <div style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 10000 }}>
      <MentionSuggestionMenu ref={menuRef as Ref<MentionMenuHandle>} items={items} command={command} clientRect={clientRect} />
    </div>,
    document.body,
  );
}
