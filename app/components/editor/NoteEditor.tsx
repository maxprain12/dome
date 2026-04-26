import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent, Editor } from '@tiptap/core';
import type { SuggestionProps } from '@tiptap/suggestion';
import ReactDOM from 'react-dom';
import { buildCoreNoteExtensions } from '@/lib/tiptap/extensions';
import { SlashCommandExtension, SLASH_COMMANDS, type SlashCommand } from '@/lib/tiptap/slash-commands';
import { buildDomeResourceMention } from '@/lib/tiptap/extensions/resource-mention';
import { createTipTapAIActions } from '@/lib/tiptap/ai-actions';
import type { DomeMentionItem } from '@/lib/tiptap/extensions/resource-mention';
import type { NoteEmbedKind } from '@/lib/tiptap/extensions/note-editor-bridge';
import { SlashMenuPortal } from './SlashCommandMenu';
import type { SlashMenuHandle } from './SlashCommandMenu';
import { MentionMenuPortal } from './MentionSuggestionMenu';
import type { MentionMenuHandle } from './MentionSuggestionMenu';
import ResourcePickerModal from './ResourcePickerModal';
import ImagePickerModal from './ImagePickerModal';
import EmbedModal from './EmbedModal';
import { useTabStore } from '@/lib/store/useTabStore';
import { Bold, Italic, Underline, Strikethrough, Link, Highlighter, Code } from 'lucide-react';
import './note-editor.css';

interface NoteEditorProps {
  content?: JSONContent;
  editable?: boolean;
  placeholder?: string;
  projectId?: string;
  /** Current note resource (excluded from link picker) */
  currentResourceId?: string;
  onUpdate?: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor) => void;
}

export default function NoteEditor({
  content,
  editable = true,
  placeholder = 'Escribe algo, o escribe / para ver comandos…',
  projectId = '',
  currentResourceId,
  onUpdate,
  onEditorReady,
}: NoteEditorProps) {
  const [slashItems, setSlashItems] = useState<SlashCommand[]>([]);
  const [slashClientRect, setSlashClientRect] = useState<(() => DOMRect | null) | null>(null);
  const slashMenuRef = useRef<SlashMenuHandle | null>(null);
  const slashCommandRef = useRef<((item: SlashCommand) => void) | null>(null);

  const [mentionUi, setMentionUi] = useState<{
    items: DomeMentionItem[];
    clientRect: () => DOMRect | null;
    onPick: (item: DomeMentionItem) => void;
  } | null>(null);
  const mentionMenuRef = useRef<MentionMenuHandle | null>(null);

  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedKind, setEmbedKind] = useState<NoteEmbedKind | null>(null);

  const editorRef = useRef<Editor | null>(null);

  const mentionRender = useCallback(() => {
    return {
      onStart: (props: SuggestionProps<DomeMentionItem, unknown>) => {
        setMentionUi({
          items: props.items,
          clientRect: () => props.clientRect?.() ?? null,
          onPick: (item) => props.command(item),
        });
      },
      onUpdate: (props: SuggestionProps<DomeMentionItem, unknown>) => {
        setMentionUi({
          items: props.items,
          clientRect: () => props.clientRect?.() ?? null,
          onPick: (item) => props.command(item),
        });
      },
      onExit: () => setMentionUi(null),
      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === 'Escape') {
          setMentionUi(null);
          return true;
        }
        return mentionMenuRef.current?.onKeyDown(props) ?? false;
      },
    };
  }, []);

  const extensions = useMemo(
    () => [
      ...buildCoreNoteExtensions(placeholder),
      buildDomeResourceMention({ render: mentionRender }),
      SlashCommandExtension.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase();
            if (!q) return SLASH_COMMANDS;
            return SLASH_COMMANDS.filter((cmd: SlashCommand) =>
              [cmd.title, cmd.description, cmd.category, cmd.group].some((s) =>
                s.toLowerCase().includes(q),
              ),
            );
          },
          render: () => {
            return {
              onStart: (props: SuggestionProps<SlashCommand, unknown>) => {
                setSlashItems(props.items);
                setSlashClientRect(() => () => props.clientRect?.() ?? null);
                slashCommandRef.current = props.command;
              },
              onUpdate: (props: SuggestionProps<SlashCommand, unknown>) => {
                setSlashItems(props.items);
                setSlashClientRect(() => () => props.clientRect?.() ?? null);
                slashCommandRef.current = props.command;
              },
              onKeyDown: (props: { event: KeyboardEvent }) => {
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
    [placeholder, mentionRender],
  );

  const editor = useEditor(
    {
      extensions,
      content,
      editable,
      immediatelyRender: false,
      editorProps: {
        handlePaste: (_view, event) => {
        const ed = editorRef.current;
        if (!ed) return false;
        const data = event.clipboardData;
        if (!data) return false;
        for (const item of data.items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              ed.chain().focus().setImage({ src }).run();
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
        },
        handleDOMEvents: {
          click: (_view, event) => {
          const el = event.target as HTMLElement | null;
          const link = el?.closest?.('.dome-resource-link');
          if (link) {
            const id = link.getAttribute('data-resource-id');
            const title = link.getAttribute('data-title') ?? '';
            const rt = link.getAttribute('data-resource-type') ?? 'note';
            if (id) {
              event.preventDefault();
              useTabStore.getState().openResourceTab(id, rt, title);
              return true;
            }
          }
          const men = el?.closest?.('.dome-resource-mention');
          if (men) {
            const id = men.getAttribute('data-id') ?? men.getAttribute('data-resource-id');
            const label = men.getAttribute('data-label') ?? men.getAttribute('data-title') ?? '';
            const rt = men.getAttribute('data-resource-type') ?? 'note';
            if (id) {
              event.preventDefault();
              useTabStore.getState().openResourceTab(id, rt, label);
              return true;
            }
          }
          return false;
          },
        },
      },
      onUpdate: ({ editor: ed }) => {
        onUpdate?.(ed.getJSON());
      },
      onCreate: ({ editor: ed }) => {
        editorRef.current = ed;
        onEditorReady?.(ed);
      },
    },
    [extensions],
  );

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const s = editor.storage.noteEditorBridge;
    s.projectId = projectId ?? '';
    s.openResourcePicker = () => setResourcePickerOpen(true);
    s.openImagePicker = () => setImagePickerOpen(true);
    s.openEmbedModal = (k) => {
      setEmbedKind(k);
      setEmbedOpen(true);
    };
    s.aiActions = createTipTapAIActions(editor);
  }, [editor, projectId]);

  if (!editor) return null;

  const handleSlashCommand = (item: SlashCommand) => {
    slashCommandRef.current?.(item);
    setSlashItems([]);
  };

  return (
    <div className="note-editor-wrapper">
      <SelectionBubbleMenu editor={editor} />

      {slashItems.length > 0 && slashClientRect && (
        <SlashMenuPortal
          items={slashItems}
          command={handleSlashCommand}
          clientRect={slashClientRect}
          menuRef={slashMenuRef}
        />
      )}

      {mentionUi && mentionUi.items.length > 0 && (
        <MentionMenuPortal
          items={mentionUi.items}
          command={(item) => {
            mentionUi.onPick(item);
            setMentionUi(null);
          }}
          clientRect={mentionUi.clientRect}
          menuRef={mentionMenuRef}
        />
      )}

      <ResourcePickerModal
        opened={resourcePickerOpen}
        onClose={() => setResourcePickerOpen(false)}
        projectId={projectId}
        excludeResourceId={currentResourceId}
        onSelect={(r) => {
          editor
            .chain()
            .focus()
            .insertResourceLink({
              resourceId: r.id,
              title: r.title,
              resourceType: r.type,
            })
            .run();
        }}
      />

      <ImagePickerModal
        opened={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        projectId={projectId}
        onSelectDataUrl={(src) => {
          editor.chain().focus().setImage({ src }).run();
        }}
      />

      <EmbedModal
        opened={embedOpen}
        onClose={() => {
          setEmbedOpen(false);
          setEmbedKind(null);
        }}
        editor={editor}
        kind={embedKind}
      />

      <EditorContent editor={editor} className="note-editor-content" />
    </div>
  );
}

function SelectionBubbleMenu({ editor }: { editor: Editor }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const { from, to } = editor.state.selection;
      if (from === to || !editor.isFocused) {
        setPos(null);
        return;
      }

      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0) {
        setPos(null);
        return;
      }

      const rect = domSel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width) {
        setPos(null);
        return;
      }

      const menuW = 270;
      setPos({
        top: rect.top - 48,
        left: Math.min(Math.max(rect.left + rect.width / 2 - menuW / 2, 8), window.innerWidth - menuW - 8),
      });
    };

    editor.on('selectionUpdate', update);
    editor.on('blur', () => setPos(null));
    return () => {
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  if (!pos) return null;

  return ReactDOM.createPortal(
    <div
      className="note-bubble-menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <BubbleBtn
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Negrita (⌘B)"
      >
        <Bold size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Cursiva (⌘I)"
      >
        <Italic size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Subrayado (⌘U)"
      >
        <Underline size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Tachado"
      >
        <Strikethrough size={13} strokeWidth={2} />
      </BubbleBtn>
      <div className="note-bubble-divider" />
      <BubbleBtn
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="Resaltado"
      >
        <Highlighter size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Código inline"
      >
        <Code size={13} strokeWidth={2} />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive('link')}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run();
            return;
          }
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

function BubbleBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`note-bubble-btn${active ? ' active' : ''}`}
    >
      {children}
    </button>
  );
}
