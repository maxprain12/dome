import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent, Editor } from '@tiptap/core';
import type { SuggestionProps } from '@tiptap/suggestion';
import ReactDOM from 'react-dom';
import { buildCoreNoteExtensions } from '@/lib/tiptap/extensions';
import { SlashCommandExtension, SLASH_COMMANDS, type SlashCommand } from '@/lib/tiptap/slash-commands';
import { buildDomeResourceMention } from '@/lib/tiptap/extensions/resource-mention';
import { createTipTapAIActions } from '@/lib/tiptap/ai-actions';
import { executeEditorAIAction } from '@/lib/ai/editor-ai';
import type { EditorAIAction } from '@/lib/ai/editor-ai';
import type { DomeMentionItem } from '@/lib/tiptap/extensions/resource-mention';
import type { NoteEmbedKind } from '@/lib/tiptap/extensions/note-editor-bridge';
import { SlashMenuPortal } from './SlashCommandMenu';
import type { SlashMenuHandle } from './SlashCommandMenu';
import { MentionMenuPortal } from './MentionSuggestionMenu';
import type { MentionMenuHandle } from './MentionSuggestionMenu';
import ResourcePickerModal from './ResourcePickerModal';
import ImagePickerModal from './ImagePickerModal';
import EmbedModal from './EmbedModal';
import BlockHandles from './BlockHandles';
import { useTabStore } from '@/lib/store/useTabStore';
import { Bot, Check, FileText, Link, Highlighter, Sparkles } from 'lucide-react';
import { Button as TiptapButton } from '@/components/tiptap-ui-primitive/button';
import { Separator as TiptapSeparator } from '@/components/tiptap-ui-primitive/separator';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import './note-editor.css';

interface NoteEditorProps {
  /**
   * Initial editor content. Accepts either a Tiptap JSON document (the
   * canonical persisted format) or an HTML string (used as a fallback when
   * legacy notes were stored as raw markdown — see `loadNoteContent`).
   */
  content?: JSONContent | string;
  editable?: boolean;
  placeholder?: string;
  projectId?: string;
  /** Current note resource (excluded from link picker) */
  currentResourceId?: string;
  focused?: boolean;
  /** Show Notion-style ⋮⋮ + ➕ controls on hover. Defaults to focused. */
  showBlockHandles?: boolean;
  onUpdate?: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor) => void;
}

export default function NoteEditor({
  content,
  editable = true,
  placeholder = 'Escribe algo, o escribe / para ver comandos…',
  projectId = '',
  currentResourceId,
  focused = false,
  showBlockHandles,
  onUpdate,
  onEditorReady,
}: NoteEditorProps) {
  const blockHandlesEnabled = (showBlockHandles ?? focused) && editable;
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
  const [resourcePickerMode, setResourcePickerMode] = useState<'link' | 'split' | 'mention'>('link');
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedKind, setEmbedKind] = useState<NoteEmbedKind | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const [isAIBusy, setIsAIBusy] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);

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
              const store = useTabStore.getState();
              if (focused) store.openResourceInSplit(id, rt, title);
              else store.openResourceTab(id, rt, title);
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
              const store = useTabStore.getState();
              if (focused) store.openResourceInSplit(id, rt, label);
              else store.openResourceTab(id, rt, label);
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

  const runEditorAI = useCallback((action: EditorAIAction, mode: 'insert' | 'replace_selection' | 'append' = 'replace_selection') => {
    const ed = editorRef.current;
    if (!ed) return;
    const aiActions = ed.storage.noteEditorBridge?.aiActions;
    const selectedText = aiActions?.getSelectedMarkdownContext?.() ?? '';
    const documentText = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n\n');
    const sourceText = selectedText || documentText.slice(0, 4000);
    if (!sourceText.trim() && action !== 'continue') return;

    setAIError(null);
    setIsAIBusy(true);
    void (async () => {
      try {
        const result = await executeEditorAIAction(action, sourceText, documentText);
        aiActions?.insertMarkdown(result, mode);
      } catch (err) {
        setAIError(err instanceof Error ? err.message : 'No se pudo ejecutar la acción de IA.');
      } finally {
        setIsAIBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor, focused]);

  useEffect(() => {
    if (!editor) return;
    const s = editor.storage.noteEditorBridge;
    s.projectId = projectId ?? '';
    s.openResourcePicker = (mode = 'link') => {
      setResourcePickerMode(mode);
      setResourcePickerOpen(true);
    };
    s.openImagePicker = () => setImagePickerOpen(true);
    s.openEmbedModal = (k) => {
      setEmbedKind(k);
      setEmbedOpen(true);
    };
    s.aiActions = createTipTapAIActions(editor);
  }, [editor, projectId]);

  useEffect(() => {
    if (!focused) return;
    const handleAI = () => runEditorAI('improve', 'replace_selection');
    const handleReference = () => {
      setResourcePickerMode('split');
      setResourcePickerOpen(true);
    };
    window.addEventListener('dome:focused-editor-ai', handleAI);
    window.addEventListener('dome:focused-editor-reference', handleReference);
    return () => {
      window.removeEventListener('dome:focused-editor-ai', handleAI);
      window.removeEventListener('dome:focused-editor-reference', handleReference);
    };
  }, [focused, runEditorAI]);

  if (!editor) return null;

  const handleSlashCommand = (item: SlashCommand) => {
    slashCommandRef.current?.(item);
    setSlashItems([]);
  };

  return (
    <div className={`note-editor-wrapper${focused ? ' focused' : ''}`}>
      <SelectionBubbleMenu editor={editor} focused={focused} isAIPending={isAIBusy} onAIAction={runEditorAI} />
      <BlockHandles editor={editor} enabled={blockHandlesEnabled} />
      {aiError && (
        <div className="focused-editor-ai-error" role="status">
          {aiError}
        </div>
      )}

      {slashItems.length > 0 && slashClientRect && (
        <SlashMenuPortal
          items={slashItems}
          command={handleSlashCommand}
          clientRect={slashClientRect}
          menuRef={slashMenuRef}
        />
      )}

      {mentionUi && (
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
        onClose={() => {
          setResourcePickerOpen(false);
          setResourcePickerMode('link');
        }}
        projectId={projectId}
        excludeResourceId={currentResourceId}
        onSelect={(r) => {
          if (resourcePickerMode === 'split') {
            useTabStore.getState().openResourceInSplit(r.id, r.type, r.title);
            setResourcePickerOpen(false);
            setResourcePickerMode('link');
            return;
          }
          if (resourcePickerMode === 'mention') {
            editor.storage.noteEditorBridge.aiActions?.insertResourceMention({
              id: r.id,
              title: r.title,
              type: r.type,
            });
            setResourcePickerOpen(false);
            setResourcePickerMode('link');
            return;
          }
          editor
            .chain()
            .focus()
            .insertResourceLink({
              resourceId: r.id,
              title: r.title,
              resourceType: r.type,
            })
            .run();
          setResourcePickerOpen(false);
          setResourcePickerMode('link');
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

function SelectionBubbleMenu({
  editor,
  focused,
  isAIPending,
  onAIAction,
}: {
  editor: Editor;
  focused: boolean;
  isAIPending: boolean;
  onAIAction: (action: EditorAIAction, mode?: 'insert' | 'replace_selection' | 'append') => void;
}) {
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

      const menuW = focused ? 390 : 270;
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
  }, [editor, focused]);

  if (!pos) return null;

  const linkActive = editor.isActive('link');
  const highlightActive = editor.isActive('highlight');

  return ReactDOM.createPortal(
    <div
      className="note-bubble-menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <MarkButton editor={editor} type="bold" />
      <MarkButton editor={editor} type="italic" />
      <MarkButton editor={editor} type="underline" />
      <MarkButton editor={editor} type="strike" />
      <MarkButton editor={editor} type="code" />
      <TiptapSeparator orientation="vertical" />
      <TiptapButton
        type="button"
        variant="ghost"
        tooltip="Resaltado"
        aria-label="Resaltado"
        aria-pressed={highlightActive}
        data-active-state={highlightActive ? 'on' : 'off'}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="tiptap-button-icon" size={13} strokeWidth={2} />
      </TiptapButton>
      <TiptapButton
        type="button"
        variant="ghost"
        tooltip="Enlace"
        shortcutKeys="mod+k"
        aria-label="Enlace"
        aria-pressed={linkActive}
        data-active-state={linkActive ? 'on' : 'off'}
        onClick={() => {
          if (linkActive) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const url = window.prompt('URL');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
      >
        <Link className="tiptap-button-icon" size={13} strokeWidth={2} />
      </TiptapButton>
      {focused && (
        <>
          <TiptapSeparator orientation="vertical" />
          <TiptapButton
            type="button"
            variant="ghost"
            tooltip="Mejorar con IA"
            aria-label="Mejorar con IA"
            data-active-state={isAIPending ? 'on' : 'off'}
            disabled={isAIPending}
            onClick={() => onAIAction('improve', 'replace_selection')}
          >
            <Sparkles className="tiptap-button-icon" size={13} strokeWidth={2} />
          </TiptapButton>
          <TiptapButton
            type="button"
            variant="ghost"
            tooltip="Resumir selección"
            aria-label="Resumir selección"
            onClick={() => onAIAction('summarize', 'insert')}
          >
            <FileText className="tiptap-button-icon" size={13} strokeWidth={2} />
          </TiptapButton>
          <TiptapButton
            type="button"
            variant="ghost"
            tooltip="Continuar escribiendo"
            aria-label="Continuar escribiendo"
            onClick={() => onAIAction('continue', 'append')}
          >
            <Bot className="tiptap-button-icon" size={13} strokeWidth={2} />
          </TiptapButton>
          <TiptapButton
            type="button"
            variant="ghost"
            tooltip="Copiar selección"
            aria-label="Copiar selección"
            onClick={() => {
              const text = editor.state.doc.textBetween(
                editor.state.selection.from,
                editor.state.selection.to,
                '\n\n',
              );
              navigator.clipboard?.writeText(text).catch(() => undefined);
            }}
          >
            <Check className="tiptap-button-icon" size={13} strokeWidth={2} />
          </TiptapButton>
        </>
      )}
    </div>,
    document.body,
  );
}
