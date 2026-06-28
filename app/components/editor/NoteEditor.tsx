import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent, Editor } from '@tiptap/core';
import type { SuggestionProps } from '@tiptap/suggestion';

import { buildCoreNoteExtensions } from '@/lib/tiptap/extensions';
import { SlashCommandExtension, SLASH_ITEMS, type SlashCommand } from '@/lib/tiptap/slash-commands';
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
import { useTabStore } from '@/lib/store/useTabStore';
import { NoteBubbleMenu, NoteLinkPopoverField } from './NoteBubbleMenu';
import { NoteFloatingInsertMenu } from './NoteFloatingInsertMenu';
import { NoteDragHandle } from './NoteDragHandle';
import './note-editor.css';

interface NoteEditorProps {
  /** Initial editor content — Tiptap JSON or legacy HTML fallback. */
  content?: JSONContent | string;
  editable?: boolean;
  placeholder?: string;
  projectId?: string;
  currentResourceId?: string;
  /**
   * Distraction-free / zen typing: wider column, serif, extra AI shortcuts in bubble + slash.
   */
  zenMode?: boolean;
  /** Legacy alias — passed from older layouts; behaves like zenMode when set. */
  focused?: boolean;
  /** When true, Dome resource links/mentions open in split instead of replacing the tab. */
  splitLinkNav?: boolean;
  /** Barra insert flotante (/ bloques rápidos) — Tweaks pueden desactivarla. */
  showFloatingInsert?: boolean;
  onInsertAiBlock?: () => void;
  onUpdate?: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor) => void;
}

export default function NoteEditor({
  content,
  editable = true,
  placeholder = 'Escribe algo, o escribe / para ver comandos…',
  projectId = '',
  currentResourceId,
  zenMode,
  focused = false,
  splitLinkNav = false,
  showFloatingInsert = true,
  onInsertAiBlock,
  onUpdate,
  onEditorReady,
}: NoteEditorProps) {
  const isZen = Boolean(zenMode ?? focused);
  const openLinksInSplit = Boolean(splitLinkNav || isZen);

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
  const editorRef = useRef<Editor | null>(null);

  const isEditorSuggestionActive = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return false;
    return Boolean(
      ed.view.dom.querySelector('.suggestion') ||
        ed.view.dom.querySelector('[data-decoration-id]'),
    );
  }, []);

  const openResourceTarget = useCallback(
    (id: string, resourceType: string, title: string) => {
      const store = useTabStore.getState();
      if (openLinksInSplit) store.openResourceInSplit(id, resourceType, title);
      else store.openResourceTab(id, resourceType, title);
    },
    [openLinksInSplit],
  );

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
      onExit: () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!isEditorSuggestionActive()) setMentionUi(null);
          });
        });
      },
      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === 'Escape') {
          setMentionUi(null);
          return true;
        }
        return mentionMenuRef.current?.onKeyDown(props) ?? false;
      },
    };
  }, [isEditorSuggestionActive]);

  const slashRender = useCallback(() => {
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
          setSlashClientRect(null);
          return true;
        }
        return slashMenuRef.current?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!isEditorSuggestionActive()) {
              setSlashItems([]);
              setSlashClientRect(null);
            }
          });
        });
      },
    };
  }, [isEditorSuggestionActive]);

  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const resourcePickerModeRef = useRef<'link' | 'split' | 'mention'>('link');
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedKind, setEmbedKind] = useState<NoteEmbedKind | null>(null);

  const [isAIBusy, setIsAIBusy] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  const extensions = useMemo(
    () => [
      ...buildCoreNoteExtensions({ placeholder }),
      buildDomeResourceMention({ render: mentionRender }),
      SlashCommandExtension.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase();
            if (!q) return SLASH_ITEMS;
            return SLASH_ITEMS.filter((cmd: SlashCommand) =>
              [cmd.title, cmd.description, cmd.category, cmd.group].some((s) =>
                s.toLowerCase().includes(q),
              ),
            );
          },
          render: slashRender,
        },
      }),
    ],
    [placeholder, mentionRender, slashRender],
  );

  const editor = useEditor(
    {
      extensions,
      content,
      editable,
      immediatelyRender: false,
      editorProps: {
        handleClickOn: (_view, _pos, node, _nodePos, event) => {
          if (node.type.name !== 'mention') return false;
          const id = typeof node.attrs.id === 'string' ? node.attrs.id : '';
          if (!id) return false;
          event.preventDefault();
          openResourceTarget(
            id,
            typeof node.attrs.resourceType === 'string' ? node.attrs.resourceType : 'note',
            typeof node.attrs.label === 'string' ? node.attrs.label : '',
          );
          return true;
        },
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
                openResourceTarget(id, rt, title);
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
                openResourceTarget(id, rt, label);
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

  const runEditorAI = useCallback(
    (action: EditorAIAction, mode: 'insert' | 'replace_selection' | 'append' = 'replace_selection') => {
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
    },
    [],
  );

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const s = editor.storage.noteEditorBridge;
    s.projectId = projectId ?? '';
    s.openResourcePicker = (mode = 'link') => {
      resourcePickerModeRef.current = mode;
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
    if (!isZen) return;
    const handleAI = () => runEditorAI('improve', 'replace_selection');
    const handleReference = () => {
      resourcePickerModeRef.current = 'split';
      setResourcePickerOpen(true);
    };
    window.addEventListener('dome:focused-editor-ai', handleAI);
    window.addEventListener('dome:focused-editor-reference', handleReference);
    return () => {
      window.removeEventListener('dome:focused-editor-ai', handleAI);
      window.removeEventListener('dome:focused-editor-reference', handleReference);
    };
  }, [isZen, runEditorAI]);

  useEffect(() => {
    const onMany = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'j' && e.key !== 'J') return;
      const target = e.target as HTMLElement | null;
      const inEditorArea = !!target?.closest?.('.note-editor-wrapper');
      if (!inEditorArea) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('dome:many-sidebar-open'));
    };
    window.addEventListener('keydown', onMany, true);
    return () => window.removeEventListener('keydown', onMany, true);
  }, []);

  if (!editor) return null;

  const handleSlashCommand = (item: SlashCommand) => {
    slashCommandRef.current?.(item);
    setSlashItems([]);
  };

  return (
    <div className={`note-editor-wrapper${isZen ? ' focused' : ''}`}>
      <NoteBubbleMenu
        editor={editor}
        zenMode={isZen}
        isAIBusy={isAIBusy}
        onAIAction={runEditorAI}
        onRequestLinkPopover={() => setLinkPopoverOpen(true)}
      />

      <NoteDragHandle editor={editor} editable={editable && !editor.isDestroyed} />

      {linkPopoverOpen && (
        <NoteLinkPopoverField editor={editor} open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen} />
      )}

      {aiError ? (
        <output className="focused-editor-ai-error">
          {aiError}
        </output>
      ) : null}

      {slashItems.length > 0 && slashClientRect ? (
        <SlashMenuPortal
          items={slashItems}
          command={handleSlashCommand}
          clientRect={slashClientRect}
          menuRef={slashMenuRef}
        />
      ) : null}

      {mentionUi ? (
        <MentionMenuPortal
          items={mentionUi.items}
          command={(item) => {
            mentionUi.onPick(item);
            setMentionUi(null);
          }}
          clientRect={mentionUi.clientRect}
          menuRef={mentionMenuRef}
        />
      ) : null}

      <ResourcePickerModal
        opened={resourcePickerOpen}
        onClose={() => {
          setResourcePickerOpen(false);
          resourcePickerModeRef.current = 'link';
        }}
        projectId={projectId}
        excludeResourceId={currentResourceId}
        onSelect={(r) => {
          if (resourcePickerModeRef.current === 'split') {
            useTabStore.getState().openResourceInSplit(r.id, r.type, r.title);
            setResourcePickerOpen(false);
            resourcePickerModeRef.current = 'link';
            return;
          }
          if (resourcePickerModeRef.current === 'mention') {
            editor.storage.noteEditorBridge.aiActions?.insertResourceMention({
              id: r.id,
              title: r.title,
              type: r.type,
            });
            setResourcePickerOpen(false);
            resourcePickerModeRef.current = 'link';
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
          resourcePickerModeRef.current = 'link';
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

      <EditorContent editor={editor} className="note-editor-content tiptap-surface-padding" />

      {showFloatingInsert ? (
        <NoteFloatingInsertMenu
          editor={editor}
          onInsertAiBlock={onInsertAiBlock}
          onRequestLinkPopover={() => setLinkPopoverOpen(true)}
        />
      ) : null}
    </div>
  );
}
