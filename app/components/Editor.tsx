'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import { showPrompt } from '@/lib/store/usePromptStore';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link2,
  ImageIcon,
  Highlighter,
} from 'lucide-react';

// Configurar lowlight para syntax highlighting
const lowlight = createLowlight();
lowlight.register({ typescript, javascript, python });

interface EditorProps {
  content?: string;
  onChange?: (content: string) => void;
  editable?: boolean;
  placeholder?: string;
}

export default function Editor({ content = '', onChange, editable = true, placeholder }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary-600 underline hover:text-primary-700',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg',
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing...',
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none p-4',
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {editable && (
        <div className="border-b p-2 flex flex-wrap gap-1" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          {/* Text Formatting */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('bold') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('bold')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('bold')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Negrita"
          >
            <Bold className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('italic') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('italic')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('italic')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Cursiva"
          >
            <Italic className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('strike') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('strike')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('strike')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Tachado"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('code') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('code')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('code')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Code"
          >
            <Code className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('highlight') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('highlight')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('highlight')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Resaltar"
          >
            <Highlighter className="w-4 h-4" />
          </button>

          <div className="w-px mx-1" style={{ background: 'var(--border)' }} />

          {/* Headings */}
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('heading', { level: 1 }) ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('heading', { level: 1 })) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('heading', { level: 1 })) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('heading', { level: 2 }) ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('heading', { level: 2 })) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('heading', { level: 2 })) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('heading', { level: 3 }) ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('heading', { level: 3 })) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('heading', { level: 3 })) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>

          <div className="w-px mx-1" style={{ background: 'var(--border)' }} />

          {/* Lists */}
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('bulletList') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('bulletList')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('bulletList')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Lista"
          >
            <List className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('orderedList') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('orderedList')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('orderedList')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Lista ordenada"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('blockquote') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('blockquote')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('blockquote')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Cita"
          >
            <Quote className="w-4 h-4" />
          </button>

          <div className="w-px mx-1" style={{ background: 'var(--border)' }} />

          {/* Insert Elements */}
          <button
            onClick={async () => {
              const url = await showPrompt('URL del enlace:');
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--primary)',
              background: editor.isActive('link') ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('link')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('link')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Insertar enlace"
          >
            <Link2 className="w-4 h-4" />
          </button>

          <button
            onClick={async () => {
              const url = await showPrompt('URL de la imagen:');
              if (url) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            }}
            className="p-2 rounded transition-colors"
            style={{ color: 'var(--primary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Insertar imagen"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <div className="w-px mx-1" style={{ background: 'var(--border)' }} />

          {/* Undo/Redo */}
          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-2 rounded transition-colors disabled:opacity-50"
            style={{ color: 'var(--primary)' }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Deshacer"
          >
            <Undo className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-2 rounded transition-colors disabled:opacity-50"
            style={{ color: 'var(--primary)' }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Rehacer"
          >
            <Redo className="w-4 h-4" />
          </button>
        </div>
      )}

      <EditorContent 
        editor={editor} 
        className="min-h-[300px]" 
        style={{ background: 'var(--bg)', color: 'var(--primary)' }}
      />
    </div>
  );
}
