import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import {
  Link,
  MessageSquare,
  MoreVertical,
  Sparkles,
  ChevronDown,
  Wand2,
  Minimize2,
  Maximize2,
  BookOpen,
  Edit,
  Globe,
  ListChecks,
  Lightbulb,
} from 'lucide-react';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import type { EditorAIAction } from '@/lib/ai/editor-ai';
import {
  BubbleAnchoredSubmenu,
  BubbleSubmenuItem,
  BubbleSubmenuLabel,
  BubbleSubmenuSeparator,
} from './BubbleAnchoredSubmenu';
import { useSelectionBubblePosition } from './useSelectionBubblePosition';

function modKey(): string {
  if (typeof navigator === 'undefined') return '⌘';
  const p = navigator.platform?.toUpperCase?.() ?? '';
  return p.includes('MAC') || p.includes('IPHONE') ? '⌘' : 'Ctrl+';
}

interface NoteBubbleMenuProps {
  editor: Editor;
  zenMode?: boolean;
  isAIBusy: boolean;
  onAIAction: (action: EditorAIAction, mode?: 'insert' | 'replace_selection' | 'append') => void;
  onRequestLinkPopover: () => void;
}

export function NoteBubbleMenu({
  editor,
  zenMode: _zenMode = false,
  isAIBusy,
  onAIAction,
  onRequestLinkPopover,
}: NoteBubbleMenuProps) {
  const { t } = useTranslation();
  const manyTriggerRef = useRef<HTMLButtonElement>(null);
  const typeTriggerRef = useRef<HTMLButtonElement>(null);
  const [manyOpen, setManyOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const submenuOpen = manyOpen || typeOpen;
  const [bubbleVisible, setBubbleVisible] = useState(false);

  const toggleMany = useCallback(() => {
    setTypeOpen(false);
    setManyOpen((open) => !open);
  }, []);

  const toggleType = useCallback(() => {
    setManyOpen(false);
    setTypeOpen((open) => !open);
  }, []);

  useEffect(() => {
    const syncVisibility = () => {
      const { empty } = editor.state.selection;
      if (empty || !editor.isEditable) {
        setBubbleVisible(false);
        setManyOpen(false);
        setTypeOpen(false);
        return;
      }
      if (submenuOpen) {
        setBubbleVisible(true);
        return;
      }
      setBubbleVisible(editor.isFocused);
    };

    syncVisibility();
    editor.on('selectionUpdate', syncVisibility);
    editor.on('focus', syncVisibility);
    editor.on('blur', syncVisibility);
    return () => {
      editor.off('selectionUpdate', syncVisibility);
      editor.off('focus', syncVisibility);
      editor.off('blur', syncVisibility);
    };
  }, [editor, submenuOpen]);

  const bubblePosition = useSelectionBubblePosition(editor, bubbleVisible);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'k' && e.key !== 'K') return;
      const ed = editor;
      if (!ed?.isFocused || ed.state.selection.empty) return;
      e.preventDefault();
      e.stopPropagation();
      onRequestLinkPopover();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [editor, onRequestLinkPopover]);

  const linkActive = editor.isActive('link');

  const currentBlockType = (): string => {
    if (editor.isActive('heading', { level: 1 })) return 'H1';
    if (editor.isActive('heading', { level: 2 })) return 'H2';
    if (editor.isActive('heading', { level: 3 })) return 'H3';
    if (editor.isActive('bulletList')) return t('notes.bubble_type_list');
    if (editor.isActive('orderedList')) return t('notes.bubble_type_olist');
    if (editor.isActive('blockquote')) return t('notes.bubble_type_quote');
    if (editor.isActive('codeBlock')) return t('notes.bubble_type_code');
    return t('notes.bubble_type_text');
  };

  if (!bubbleVisible || !bubblePosition) return null;

  return createPortal(
    // Positioning shell; onMouseDown-preventDefault only preserves the editor
    // selection (not an interaction). The toolbar inside carries the role.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={`note-selection-bubble-host note-selection-bubble-host--${bubblePosition.placement}`}
      style={{
        position: 'fixed',
        top: bubblePosition.top,
        left: bubblePosition.left,
        transform: 'translateX(-50%)',
        zIndex: 10000,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        className="bubble-menu-shell note-bubble-scope"
        role="toolbar"
        aria-label={t('notes.bubble_aria_format')}
      >
        {/* AI pill — olive, opens submenu */}
        <button
          ref={manyTriggerRef}
          type="button"
          className={`bubble-ai-pill bubble-submenu-trigger${manyOpen ? ' is-open' : ''}`}
          disabled={isAIBusy}
          aria-haspopup="menu"
          aria-expanded={manyOpen}
          title={t('notes.bubble_ai_many')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMany}
        >
          <Sparkles size={12} strokeWidth={2} />
          <span>{t('notes.many')}</span>
          <ChevronDown size={11} strokeWidth={2} />
        </button>
        <BubbleAnchoredSubmenu
          open={manyOpen}
          onOpenChange={setManyOpen}
          anchorRef={manyTriggerRef}
          width={240}
        >
          <BubbleSubmenuLabel>{t('notes.bubble_ai_section_edit')}</BubbleSubmenuLabel>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('improve', 'replace_selection');
              setManyOpen(false);
            }}
          >
            <Wand2 size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_improve')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('shorten', 'replace_selection');
              setManyOpen(false);
            }}
          >
            <Minimize2 size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_shorten')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('expand', 'replace_selection');
              setManyOpen(false);
            }}
          >
            <Maximize2 size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_expand')}
          </BubbleSubmenuItem>
          <BubbleSubmenuSeparator />
          <BubbleSubmenuLabel>{t('notes.bubble_ai_section_generate')}</BubbleSubmenuLabel>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('summarize', 'insert');
              setManyOpen(false);
            }}
          >
            <BookOpen size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_summarize')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('continue', 'append');
              setManyOpen(false);
            }}
          >
            <Edit size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_continue')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('translate', 'replace_selection');
              setManyOpen(false);
            }}
          >
            <Globe size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_translate')}
          </BubbleSubmenuItem>
          <BubbleSubmenuSeparator />
          <BubbleSubmenuLabel>{t('notes.bubble_ai_section_actions')}</BubbleSubmenuLabel>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('todo', 'replace_selection');
              setManyOpen(false);
            }}
          >
            <ListChecks size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_todo')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            disabled={isAIBusy}
            onSelect={() => {
              onAIAction('explain', 'insert');
              setManyOpen(false);
            }}
          >
            <Lightbulb size={13} className="mr-2 opacity-60" />
            {t('notes.bubble_ai_explain')}
          </BubbleSubmenuItem>
        </BubbleAnchoredSubmenu>

        <span className="bubble-bb-sep" aria-hidden />

        {/* Turn-into block type dropdown */}
        <button
          ref={typeTriggerRef}
          type="button"
          className="bubble-type-btn bubble-submenu-trigger"
          aria-label={t('notes.bubble_turn_into')}
          aria-haspopup="menu"
          aria-expanded={typeOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleType}
        >
          <span style={{ fontSize: 12, fontWeight: 500 }}>{currentBlockType()}</span>
          <ChevronDown size={11} strokeWidth={2} />
        </button>
        <BubbleAnchoredSubmenu
          open={typeOpen}
          onOpenChange={setTypeOpen}
          anchorRef={typeTriggerRef}
          width={200}
        >
          <BubbleSubmenuItem
            onSelect={() => {
              editor.chain().focus().setParagraph().run();
              setTypeOpen(false);
            }}
          >
            {t('notes.bubble_type_text')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            onSelect={() => {
              editor.chain().focus().toggleHeading({ level: 1 }).run();
              setTypeOpen(false);
            }}
          >
            H1
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            onSelect={() => {
              editor.chain().focus().toggleHeading({ level: 2 }).run();
              setTypeOpen(false);
            }}
          >
            H2
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            onSelect={() => {
              editor.chain().focus().toggleHeading({ level: 3 }).run();
              setTypeOpen(false);
            }}
          >
            H3
          </BubbleSubmenuItem>
          <BubbleSubmenuSeparator />
          <BubbleSubmenuItem
            onSelect={() => {
              editor.chain().focus().toggleBulletList().run();
              setTypeOpen(false);
            }}
          >
            {t('notes.bubble_type_list')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            onSelect={() => {
              editor.chain().focus().toggleOrderedList().run();
              setTypeOpen(false);
            }}
          >
            {t('notes.bubble_type_olist')}
          </BubbleSubmenuItem>
          <BubbleSubmenuItem
            onSelect={() => {
              editor.chain().focus().toggleBlockquote().run();
              setTypeOpen(false);
            }}
          >
            {t('notes.bubble_type_quote')}
          </BubbleSubmenuItem>
        </BubbleAnchoredSubmenu>

        <span className="bubble-bb-sep" aria-hidden />

        {/* Marks: B I U S — no tooltips (they overlap the bubble bar) */}
        <MarkButton editor={editor} type="bold" showTooltip={false} />
        <MarkButton editor={editor} type="italic" showTooltip={false} />
        <MarkButton editor={editor} type="underline" showTooltip={false} />
        <MarkButton editor={editor} type="strike" showTooltip={false} />

        <span className="bubble-bb-sep" aria-hidden />

        {/* Code + Link */}
        <MarkButton editor={editor} type="code" showTooltip={false} />
        <button
          type="button"
          className={`bb-icon-btn${linkActive ? ' active' : ''}`}
          title={`${t('notes.bubble_link')} (${modKey()}K)`}
          aria-label={t('notes.bubble_link')}
          aria-pressed={linkActive}
          onClick={() => onRequestLinkPopover()}
        >
          <Link size={13} strokeWidth={2} />
        </button>

        <span className="bubble-bb-sep" aria-hidden />

        {/* Stubs */}
        <button
          type="button"
          className="bb-icon-btn"
          title={t('notes.comment_stub')}
          disabled
          aria-label={t('notes.comment_stub')}
        >
          <MessageSquare size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="bb-icon-btn"
          title={t('notes.more_actions')}
          disabled
          aria-label={t('notes.more_actions')}
        >
          <MoreVertical size={13} strokeWidth={2} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

interface NoteLinkPopoverFieldProps {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NoteLinkPopoverField({ editor, open, onOpenChange }: NoteLinkPopoverFieldProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    const prev = editor.getAttributes('link').href;
    setUrl(typeof prev === 'string' ? prev : '');
  }, [open, editor]);

  const apply = useCallback(() => {
    const u = url.trim();
    if (!u) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: u }).run();
    }
    onOpenChange(false);
  }, [editor, onOpenChange, url]);

  if (!open) return null;

  return (
    <dialog
      open
      className="rounded-lg border p-3 shadow-xl m-0 max-w-none max-h-none"
      style={{
        position: 'fixed',
        zIndex: 'var(--z-popover)',
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
        minWidth: 288,
        left: '50%',
        top: 88,
        transform: 'translateX(-50%)',
      }}
      aria-label={t('notes.link_title')}
      onMouseDown={(e) => e.preventDefault()}
      onCancel={(e) => { e.preventDefault(); onOpenChange(false); }}
    >
      <div className="text-xs mb-2 font-semibold" style={{ color: 'var(--dome-text)' }}>
        {t('notes.link_title')}
      </div>
      <input
        className="w-full px-2 py-1.5 rounded-md border text-sm outline-none transition-shadow"
        style={{
          borderColor: 'var(--dome-border)',
          background: 'var(--dome-bg)',
          color: 'var(--dome-text)',
          boxShadow: 'none',
        }}
        placeholder={t('notes.link_placeholder_url')}
        aria-label={t('notes.link_placeholder_url')}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow =
            '0 0 0 2px color-mix(in srgb, var(--dome-accent) 35%, transparent)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onOpenChange(false);
          }
        }}
        // Focus the just-opened link popover input (expected dialog UX).
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-md hover:underline"
          style={{ color: 'var(--dome-text-muted)' }}
          onClick={() => onOpenChange(false)}
        >
          {t('notes.link_cancel')}
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1 rounded-md"
          style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}
          onClick={apply}
        >
          {t('notes.link_apply')}
        </button>
      </div>
    </dialog>
  );
}
