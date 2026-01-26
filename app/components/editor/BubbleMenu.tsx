'use client';

import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react';
import { Editor } from '@tiptap/core';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link2,
  Highlighter,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { useState } from 'react';
import { showPrompt } from '@/lib/store/usePromptStore';

interface BubbleMenuProps {
  editor: Editor;
}

export function BubbleMenu({ editor }: BubbleMenuProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!editor) {
    return null;
  }

  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
      className="bubble-menu"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '4px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
      >
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 ${editor.isActive('bold') ? 'is-active' : ''}`}
          title="Negrita"
          aria-label="Negrita"
        >
          <Bold size={16} />
        </button>

        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 ${editor.isActive('italic') ? 'is-active' : ''}`}
          title="Cursiva"
          aria-label="Cursiva"
        >
          <Italic size={16} />
        </button>

        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 ${editor.isActive('underline') ? 'is-active' : ''}`}
          title="Subrayado"
          aria-label="Subrayado"
        >
          <Underline size={16} />
        </button>

        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 ${editor.isActive('strike') ? 'is-active' : ''}`}
          title="Tachado"
          aria-label="Tachado"
        >
          <Strikethrough size={16} />
        </button>

        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 ${editor.isActive('code') ? 'is-active' : ''}`}
          title="Code"
          aria-label="Code"
        >
          <Code size={16} />
        </button>

        <div
          style={{
            width: '1px',
            height: '24px',
            backgroundColor: 'var(--border)',
            margin: '0 4px',
          }}
        />

        <button
          onClick={async () => {
            const url = await showPrompt('URL del enlace:');
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={`bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 ${editor.isActive('link') ? 'is-active' : ''}`}
          title="Enlace"
          aria-label="Agregar enlace"
        >
          <Link2 size={16} />
        </button>

        <button
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={`bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 ${editor.isActive('highlight') ? 'is-active' : ''}`}
          title="Resaltar"
          aria-label="Resaltar texto"
        >
          <Highlighter size={16} />
        </button>

        <div
          style={{
            width: '1px',
            height: '24px',
            backgroundColor: 'var(--border)',
            margin: '0 4px',
          }}
        />

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="bubble-menu-button focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
            title="Color"
            aria-label="Seleccionar color"
            aria-expanded={showColorPicker}
          >
            <Palette size={16} />
          </button>
          {showColorPicker && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '4px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              }}
            >
              {[
                '#000000',
                '#ef4444',
                '#f97316',
                '#eab308',
                '#22c55e',
                '#3b82f6',
                '#8b5cf6',
                '#ec4899',
              ].map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    editor.chain().focus().setColor(color).run();
                    setShowColorPicker(false);
                  }}
                  className="focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                  aria-label={`Seleccionar color ${color}`}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: color,
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                  title={color}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </TiptapBubbleMenu>
  );
}
