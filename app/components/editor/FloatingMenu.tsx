'use client';

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
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: showMenu ? 'var(--bg-hover)' : 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--primary)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!showMenu) {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }
          }}
          onMouseLeave={(e) => {
            if (!showMenu) {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            }
          }}
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
              zIndex: 1000,
            }}
          >
            {items.map((item) => (
              <div
                key={item.title}
                onClick={() => {
                  const { from } = editor.state.selection;
                  item.command({ editor, range: { from: from - 1, to: from } });
                  setShowMenu(false);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {item.icon && (
                  <div style={{ color: 'var(--primary)' }}>{item.icon}</div>
                )}
                <div style={{ color: 'var(--primary)', fontSize: '14px' }}>
                  {item.title}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TiptapFloatingMenu>
  );
}
