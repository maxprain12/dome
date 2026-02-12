
import { FloatingMenu as TiptapFloatingMenu } from '@tiptap/react';
import { Editor } from '@tiptap/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { getSlashCommandItems } from './SlashCommand';
import type { SlashCommandItem } from './extensions/SlashCommand';

interface FloatingMenuProps {
  editor: Editor;
}

export function FloatingMenu({ editor }: FloatingMenuProps) {
  const [showMenu, setShowMenu] = useState(false);

  if (!editor) {
    return null;
  }

  const items = getSlashCommandItems().slice(0, 8); // Mostrar solo los primeros 8

  return (
    <TiptapFloatingMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
      shouldShow={({ state, view }) => {
        const { selection } = state;
        const { $anchor } = selection;
        const isFirstLine = $anchor.parentOffset === 0;
        const isEmpty = $anchor.parent.textContent.length === 0;
        return isFirstLine && isEmpty;
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <button
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Insert block"
          aria-expanded={showMenu}
          className={`flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--border)] cursor-pointer transition-[background-color] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${showMenu ? 'bg-[var(--bg-hover)]' : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]'}`}
          style={{ color: 'var(--primary-text)' }}
        >
          <Plus size={16} />
        </button>

        {showMenu && (
          <div
            style={{
              position: 'absolute',
              left: '32px',
              top: 0,
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              padding: '4px',
              minWidth: '200px',
              zIndex: 'var(--z-popover)',
            }}
          >
            {items.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => {
                  const { from } = editor.state.selection;
                  item.command({ editor, range: { from: from - 1, to: from } });
                  setShowMenu(false);
                }}
                className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 text-left flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-200"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary-text)',
                }}
                aria-label={`Insert ${item.title}`}
              >
                {item.icon && (
                  <div style={{ color: 'var(--primary-text)' }}>{item.icon}</div>
                )}
                <div style={{ color: 'var(--primary-text)', fontSize: '14px' }}>
                  {item.title}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </TiptapFloatingMenu>
  );
}
