import {
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
  type RefObject,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
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

const menuContainerClassName = 'mention-suggestion-menu note-mention-menu-shell';

export const MentionSuggestionMenu = forwardRef<MentionMenuHandle, MentionSuggestionMenuProps>(
  ({ items, command }, ref) => {
    const { t } = useTranslation();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const prevItemsRef = useRef(items);
    if (items !== prevItemsRef.current) {
      prevItemsRef.current = items;
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
          className={cn(menuContainerClassName, 'mention-suggestion-menu--empty')}
        >
          {t('focused_editor.mention_no_matches')}
        </div>
      );
    }

    return (
      <div className={menuContainerClassName}>
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn('mention-suggestion-item', isSelected && 'is-selected')}
            >
              <span className="mention-suggestion-item__label">{item.label}</span>
              <span className="mention-suggestion-item__type">{item.type}</span>
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
