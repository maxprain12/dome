import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TextInput } from '@mantine/core';
import type { SlashCommand } from '@/lib/tiptap/slash-commands';

interface SlashMenuProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

export interface SlashMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [menuFilter, setMenuFilter] = useState('');

    const visibleItems = useMemo(() => {
      const q = menuFilter.trim().toLowerCase();
      if (!q) return items;
      return items.filter((cmd) =>
        [cmd.title, cmd.description, cmd.category].some((s) => s.toLowerCase().includes(q)),
      );
    }, [items, menuFilter]);

    useEffect(() => setSelectedIndex(0), [visibleItems]);

    useEffect(() => setMenuFilter(''), [items]);

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
      <div
        style={{
          background: 'var(--dome-surface)',
          border: '1px solid var(--dome-border)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: '6px',
          minWidth: 260,
          maxHeight: 360,
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '4px 6px 8px' }}>
          <TextInput
            size="xs"
            placeholder="Filtrar comandos…"
            value={menuFilter}
            onChange={(e) => setMenuFilter(e.currentTarget.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        {Object.entries(groups).map(([group, cmds]) => (
          <div key={group}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--dome-text-muted)',
                padding: '6px 10px 2px',
              }}
            >
              {group}
            </div>
            {cmds.map((item) => {
              const globalIndex = visibleItems.indexOf(item);
              const isSelected = globalIndex === selectedIndex;
              return (
                <button
                  key={`${group}-${item.title}-${item.description}`}
                  type="button"
                  onClick={() => selectItem(globalIndex)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '7px 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: isSelected ? 'var(--dome-bg-hover)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 100ms',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: 'var(--dome-bg-tertiary, var(--dome-bg-hover))',
                      fontSize: 11,
                      fontWeight: 400,
                      color: 'var(--dome-text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dome-text)', lineHeight: 1.3 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--dome-text-muted)', lineHeight: 1.3 }}>
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
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

export function SlashMenuPortal({ items, command, clientRect, menuRef }: SlashMenuPortalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!clientRect) return;
    const rect = clientRect();
    if (!rect) return;
    setPosition({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 280),
    });
  }, [clientRect, items]);

  return createPortal(
    <div
      ref={containerRef}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
    >
      <SlashCommandMenu ref={menuRef as React.Ref<SlashMenuHandle>} items={items} command={command} />
    </div>,
    document.body,
  );
}
