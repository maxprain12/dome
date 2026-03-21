import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
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

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
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
    }));

    if (!items.length) return null;

    // Group items
    const groups: Record<string, SlashCommand[]> = {};
    for (const item of items) {
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
          minWidth: 240,
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
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
              const globalIndex = items.indexOf(item);
              const isSelected = globalIndex === selectedIndex;
              return (
                <button
                  key={item.title}
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
                      fontWeight: 700,
                      fontFamily: 'monospace',
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

// ── Portal renderer ────────────────────────────────────────────────────────
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
      left: Math.min(rect.left, window.innerWidth - 260),
    });
  }, [clientRect, items]);

  return createPortal(
    <div
      ref={containerRef}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
    >
      <SlashCommandMenu ref={menuRef} items={items} command={command} />
    </div>,
    document.body,
  );
}
