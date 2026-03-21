import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent, Editor } from '@tiptap/core';
import ReactDOM from 'react-dom';
import { buildNoteExtensions } from '@/lib/tiptap/extensions';
import { SlashCommandExtension, SLASH_COMMANDS, type SlashCommand } from '@/lib/tiptap/slash-commands';
import { SlashMenuPortal } from './SlashCommandMenu';
import type { SlashMenuHandle } from './SlashCommandMenu';
import { Bold, Italic, Underline, Strikethrough, Link, Highlighter, Code } from 'lucide-react';
import './note-editor.css';

interface NoteEditorProps {
  content?: JSONContent;
  editable?: boolean;
  placeholder?: string;
  onUpdate?: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor) => void;
}

export default function NoteEditor({
  content,
  editable = true,
  placeholder = 'Escribe algo, o escribe / para ver comandos…',
  onUpdate,
  onEditorReady,
}: NoteEditorProps) {
  // Slash menu state
  const [slashItems, setSlashItems] = useState<SlashCommand[]>([]);
  const [slashClientRect, setSlashClientRect] = useState<(() => DOMRect | null) | null>(null);
  const slashMenuRef = useRef<SlashMenuHandle | null>(null);
  const slashCommandRef = useRef<((item: SlashCommand) => void) | null>(null);

  const editor = useEditor({
    extensions: [
      ...buildNoteExtensions(placeholder),
      SlashCommandExtension.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase();
            if (!q) return SLASH_COMMANDS;
            return SLASH_COMMANDS.filter(
              (cmd: SlashCommand) =>
                cmd.title.toLowerCase().includes(q) ||
                cmd.description.toLowerCase().includes(q),
            );
          },
          render: () => {
            return {
              onStart: (props: any) => {
                setSlashItems(props.items);
                setSlashClientRect(() => props.clientRect);
                slashCommandRef.current = (item: SlashCommand) => props.command(item);
              },
              onUpdate: (props: any) => {
                setSlashItems(props.items);
                setSlashClientRect(() => props.clientRect);
                slashCommandRef.current = (item: SlashCommand) => props.command(item);
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  setSlashItems([]);
                  return true;
                }
                return slashMenuRef.current?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                setSlashItems([]);
                setSlashClientRect(null);
              },
            };
          },
        },
      }),
    ],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getJSON());
    },
    onCreate: ({ editor }) => {
      onEditorReady?.(editor);
    },
  });

  if (!editor) return null;

  const handleSlashCommand = (item: SlashCommand) => {
    slashCommandRef.current?.(item);
    setSlashItems([]);
  };

  return (
    <div className="note-editor-wrapper">
      {/* Floating bubble menu on selection */}
      <SelectionBubbleMenu editor={editor} />

      {/* Slash command palette */}
      {slashItems.length > 0 && slashClientRect && (
        <SlashMenuPortal
          items={slashItems}
          command={handleSlashCommand}
          clientRect={slashClientRect}
          menuRef={slashMenuRef}
        />
      )}

      <EditorContent editor={editor} className="note-editor-content" />
    </div>
  );
}

// ── Floating bubble menu on text selection ─────────────────────────────────
function SelectionBubbleMenu({ editor }: { editor: Editor }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const { from, to } = editor.state.selection;
      if (from === to || !editor.isFocused) { setPos(null); return; }

      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0) { setPos(null); return; }

      const rect = domSel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width) { setPos(null); return; }

      const menuW = 270;
      setPos({
        top: rect.top - 48,
        left: Math.min(Math.max(rect.left + rect.width / 2 - menuW / 2, 8), window.innerWidth - menuW - 8),
      });
    };

    editor.on('selectionUpdate', update);
    editor.on('blur', () => setPos(null));
    return () => { editor.off('selectionUpdate', update); };
  }, [editor]);

  if (!pos) return null;

  return ReactDOM.createPortal(
    <div
      className="note-bubble-menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <BubbleBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita (⌘B)">
        <Bold size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva (⌘I)">
        <Italic size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado (⌘U)">
        <Underline size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
        <Strikethrough size={13} strokeWidth={2} />
      </BubbleBtn>
      <div className="note-bubble-divider" />
      <BubbleBtn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Resaltado">
        <Highlighter size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Código inline">
        <Code size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive('link')}
        onClick={() => {
          if (editor.isActive('link')) { editor.chain().focus().unsetLink().run(); return; }
          const url = window.prompt('URL');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        title="Enlace (⌘K)"
      >
        <Link size={13} strokeWidth={2} />
      </BubbleBtn>
    </div>,
    document.body,
  );
}

function BubbleBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`note-bubble-btn${active ? ' active' : ''}`}>
      {children}
    </button>
  );
}
