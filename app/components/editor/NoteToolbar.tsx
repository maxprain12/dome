import type { Editor } from '@tiptap/core';
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Quote, Code, CodeSquare,
  AlignLeft, AlignCenter, AlignRight,
  Minus, Table, Image,
  Undo, Redo,
} from 'lucide-react';

interface NoteToolbarProps {
  editor: Editor;
}

export default function NoteToolbar({ editor }: NoteToolbarProps) {
  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const insertImage = () => {
    const url = window.prompt('URL de la imagen');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div
      className="note-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '4px 8px',
        borderBottom: '1px solid var(--dome-border)',
        background: 'var(--dome-surface)',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      {/* History */}
      <ToolBtn editor={editor} onClick={() => editor.chain().focus().undo().run()} title="Deshacer" disabled={!editor.can().undo()}>
        <Undo size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} onClick={() => editor.chain().focus().redo().run()} title="Rehacer" disabled={!editor.can().redo()}>
        <Redo size={14} strokeWidth={1.75} />
      </ToolBtn>

      <Divider />

      {/* Headings */}
      <ToolBtn editor={editor} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1">
        <Heading1 size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2">
        <Heading2 size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3">
        <Heading3 size={14} strokeWidth={1.75} />
      </ToolBtn>

      <Divider />

      {/* Inline formatting */}
      <ToolBtn editor={editor} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
        <Bold size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
        <Italic size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado">
        <Underline size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
        <Strikethrough size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Código inline">
        <Code size={14} strokeWidth={1.75} />
      </ToolBtn>

      <Divider />

      {/* Alignment */}
      <ToolBtn editor={editor} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Alinear izquierda">
        <AlignLeft size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centrar">
        <AlignCenter size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Alinear derecha">
        <AlignRight size={14} strokeWidth={1.75} />
      </ToolBtn>

      <Divider />

      {/* Block elements */}
      <ToolBtn editor={editor} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista con viñetas">
        <List size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
        <ListOrdered size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Lista de tareas">
        <CheckSquare size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita">
        <Quote size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Bloque de código">
        <CodeSquare size={14} strokeWidth={1.75} />
      </ToolBtn>

      <Divider />

      {/* Insert */}
      <ToolBtn editor={editor} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separador horizontal">
        <Minus size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} onClick={insertTable} title="Insertar tabla">
        <Table size={14} strokeWidth={1.75} />
      </ToolBtn>
      <ToolBtn editor={editor} onClick={insertImage} title="Insertar imagen">
        <Image size={14} strokeWidth={1.75} />
      </ToolBtn>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 16,
        background: 'var(--dome-border)',
        margin: '0 3px',
        flexShrink: 0,
      }}
    />
  );
}

function ToolBtn({
  children,
  onClick,
  title,
  active = false,
  disabled = false,
}: {
  editor: Editor;
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        border: 'none',
        borderRadius: 5,
        background: active ? 'var(--dome-accent)' : 'transparent',
        color: active ? '#fff' : disabled ? 'var(--dome-text-muted)' : 'var(--dome-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 120ms, color 120ms',
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-secondary)';
        }
      }}
    >
      {children}
    </button>
  );
}
