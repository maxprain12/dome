
import { memo, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  AtSign,
  BookOpen,
  Brain,
  Globe,
  Plus,
  Slash,
  StopCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';
import { useManyStore } from '@/lib/store/useManyStore';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { newAttachmentId } from '@/lib/chat/attachmentTypes';
import { processAttachmentFile } from '@/lib/chat/processAttachmentFile';
import { ChatComposerPlusMenuContent, type ChatComposerSkillsHandlers } from '@/components/chat/ChatComposerPlusMenu';
import { ChatSkillChip } from '@/components/chat/ChatSkillChip';
import {
  AI_COMPOSER_INPUT_HANDLER,
  AI_COMPOSER_TEXTAREA_CLASS,
  AIComposerFrame,
} from '@/components/chat/AIComposer';
import ManyComposerAttachmentRow from './ManyComposerAttachmentRow';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';
import { useResourceMention } from '@/lib/chat/useResourceMention';
import { useSlashSkills, type SlashSkillItem } from '@/lib/chat/useSlashSkills';
import { InlineModelSwitcher } from '@/components/chat/InlineModelSwitcher';
import { db } from '@/lib/db/client';

export interface ManyChatInputProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
  toolsEnabled: boolean;
  resourceToolsEnabled: boolean;
  memoryEnabled?: boolean;
  mcpEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  setResourceToolsEnabled: (v: boolean) => void;
  setMemoryEnabled?: (v: boolean) => void;
  setMcpEnabled: (v: boolean) => void;
  supportsTools: boolean;
  hasMcp: boolean;
  onSend: () => void;
  onAbort: () => void;
  isWelcomeScreen?: boolean;
  inputPlaceholderOverride?: string | null;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (items: ChatAttachment[]) => void;
  /** `full` = slash skills, nested + menu, inline model switcher; `legacy` = previous single-scroll + menu */
  variant?: 'full' | 'legacy';
  /** Show Enter / Shift+Enter hint under the composer (Many redesign). */
  showComposerKeyboardHint?: boolean;
}

export default memo(function ManyChatInput({
  input,
  setInput,
  inputRef,
  isLoading,
  toolsEnabled,
  resourceToolsEnabled,
  memoryEnabled = true,
  mcpEnabled,
  setToolsEnabled,
  setResourceToolsEnabled,
  setMemoryEnabled,
  setMcpEnabled,
  supportsTools,
  hasMcp,
  onSend,
  onAbort,
  isWelcomeScreen = false,
  inputPlaceholderOverride = null,
  attachments = [],
  onAttachmentsChange,
  variant = 'full',
  showComposerKeyboardHint = true,
}: ManyChatInputProps) {
  const { t } = useTranslation();
  const enhanced = variant === 'full';
  const pinnedResources = useManyStore((s) => s.pinnedResources);
  const addPinnedResource = useManyStore((s) => s.addPinnedResource);
  const removePinnedResource = useManyStore((s) => s.removePinnedResource);
  const pendingOneShotSkillId = useManyStore((s) => s.pendingOneShotSkillId);
  const setPendingOneShotSkill = useManyStore((s) => s.setPendingOneShotSkill);
  const activeSkillIdBySession = useManyStore((s) => s.activeSkillIdBySession);
  const setActiveSkillForSession = useManyStore((s) => s.setActiveSkillForSession);
  const currentSessionId = useManyStore((s) => s.currentSessionId);

  const activeStickySkillId = currentSessionId ? activeSkillIdBySession[currentSessionId] ?? null : null;

  const [skillLabels, setSkillLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = [pendingOneShotSkillId, activeStickySkillId].filter((x): x is string => !!x);
    if (!ids.length || !db.isAvailable()) return;
    let cancelled = false;
    void db.getAISkills().then((res) => {
      if (cancelled || !res.success || !Array.isArray(res.data)) return;
      const next: Record<string, string> = {};
      for (const row of res.data as Array<{ id?: string; name?: string }>) {
        if (row.id && ids.includes(row.id)) {
          next[row.id] = row.name || row.id;
        }
      }
      setSkillLabels((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingOneShotSkillId, activeStickySkillId]);

  const [showDropdown, setShowDropdown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; above?: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const mention = useResourceMention({
    input,
    setInput,
    inputRef,
    containerRef,
    onPinResource: addPinnedResource,
    enabled: true,
  });

  const slash = useSlashSkills({
    input,
    setInput,
    inputRef: inputRef as React.RefObject<HTMLTextAreaElement | null>,
    containerRef,
    enabled: enhanced,
  });

  const applySlashOneShot = useCallback(
    (skill: SlashSkillItem) => {
      const cursor = inputRef.current?.selectionStart ?? input.length;
      slash.removeSlashTokenFromInput(cursor);
      slash.setSlashActive(false);
      setPendingOneShotSkill(skill.id);
      setSkillLabels((prev) => ({ ...prev, [skill.id]: skill.name }));
    },
    [input.length, inputRef, slash, setPendingOneShotSkill],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (enhanced) {
        const slashRes = slash.handleSlashKeyDown(e);
        if (slashRes.handled) {
          if (slashRes.skill) {
            applySlashOneShot(slashRes.skill);
          }
          return;
        }
      }
      if (mention.mentionKeyDown(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [enhanced, slash, mention, applySlashOneShot, onSend],
  );

  const handleInput = AI_COMPOSER_INPUT_HANDLER;

  const handlePickFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || !onAttachmentsChange) return;
      let working = [...attachments];
      for (const file of Array.from(fileList)) {
        const isImage = file.type.startsWith('image/');
        const pendingId = isImage ? null : newAttachmentId();
        if (pendingId) {
          working = [
            ...working,
            { id: pendingId, kind: 'document' as const, name: file.name, text: null, status: 'loading' as const },
          ];
          onAttachmentsChange(working);
        }
        const a = await processAttachmentFile(file);
        working = pendingId ? working.filter((item) => item.id !== pendingId) : working;
        if (a) working = [...working, a];
        onAttachmentsChange(working);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [attachments, onAttachmentsChange],
  );

  const insertAtSymbol = useCallback(() => {
    mention.insertAtSymbol();
  }, [mention]);

  const insertSlashToken = useCallback(() => {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const after = input.slice(cursor);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const token = `${needsSpace ? ' ' : ''}/`;
    const next = `${before}${token}${after}`;
    setInput(next);
    const nextCursor = before.length + token.length;
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
      slash.updateFromText(next, nextCursor);
    });
  }, [input, inputRef, setInput, slash]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);
      const cursor = e.target.selectionStart ?? val.length;
      mention.updateFromText(val, cursor);
      if (enhanced) {
        slash.updateFromText(val, cursor);
      }
    },
    [setInput, enhanced, mention, slash],
  );

  useEffect(() => {
    if (!showDropdown) {
      setDropdownRect(null);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    if (!showDropdown || !buttonRef.current || typeof window === 'undefined') {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setDropdownRect({
      top: showAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      above: showAbove,
    });
  }, [showDropdown]);

  const hasActiveCapabilities = resourceToolsEnabled || toolsEnabled || mcpEnabled;

  const outerCls = isWelcomeScreen
    ? 'many-input-area bg-transparent px-0 pb-0'
    : 'many-input-area border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3';

  const skillsHandlers: ChatComposerSkillsHandlers | null = enhanced
    ? {
        onInvokeOneShot: (id) => {
          setPendingOneShotSkill(id);
          setShowDropdown(false);
        },
        onSetSticky: (id) => {
          if (currentSessionId) setActiveSkillForSession(currentSessionId, id);
          setShowDropdown(false);
        },
        activeStickySkillId: activeStickySkillId,
        onCloseMenu: () => setShowDropdown(false),
      }
    : null;

  const menuLayout = enhanced ? 'nested' : 'flat';

  return (
    <div className={outerCls}>
      {enhanced && (pendingOneShotSkillId || activeStickySkillId) ? (
        <div className={`mb-2 flex flex-wrap gap-1.5 ${isWelcomeScreen ? 'justify-center' : ''}`}>
          {pendingOneShotSkillId ? (
            <ChatSkillChip
              label={skillLabels[pendingOneShotSkillId] || pendingOneShotSkillId}
              onRemove={() => setPendingOneShotSkill(null)}
            />
          ) : null}
          {activeStickySkillId ? (
            <ChatSkillChip
              sticky
              label={skillLabels[activeStickySkillId] || activeStickySkillId}
              onRemove={() => currentSessionId && setActiveSkillForSession(currentSessionId, null)}
            />
          ) : null}
        </div>
      ) : null}

      <AIComposerFrame
        containerRef={containerRef}
        isDragging={isDragging}
        isWelcomeScreen={isWelcomeScreen}
        onDragOver={(e) => {
          if (!onAttachmentsChange) return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (!onAttachmentsChange) return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          void handlePickFiles(e.dataTransfer?.files ?? null);
        }}
      >
        <ManyComposerAttachmentRow
          attachments={attachments}
          pinnedResources={pinnedResources}
          onRemoveAttachment={(id) => onAttachmentsChange?.(attachments.filter((item) => item.id !== id))}
          onRemovePinned={removePinnedResource}
        />
        {onAttachmentsChange ? (
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.ppt,.pptx"
            onChange={(e) => { void handlePickFiles(e.target.files); }}
          />
        ) : null}
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={(e) => {
            if (!onAttachmentsChange) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const it of items) {
              if (it.kind === 'file' && it.type.startsWith('image/')) {
                e.preventDefault();
                const f = it.getAsFile();
                if (f) void handlePickFiles((() => { const d = new DataTransfer(); d.items.add(f); return d.files; })());
                break;
              }
            }
          }}
          placeholder={
            inputPlaceholderOverride != null && inputPlaceholderOverride !== ''
              ? inputPlaceholderOverride
              : isWelcomeScreen
                ? t('many.input_placeholder_docs')
                : t('many.input_placeholder_many')
          }
          disabled={isLoading}
          rows={isWelcomeScreen ? 2 : 1}
          className={AI_COMPOSER_TEXTAREA_CLASS}
          style={{
            lineHeight: '1.55',
            border: 'none',
            boxShadow: 'none',
            padding: isWelcomeScreen ? '20px 22px 8px' : '14px 18px 6px',
            minHeight: isWelcomeScreen ? 72 : 24,
            maxHeight: 200,
          }}
        />

        <div className="many-composer-tools">
          <button
            type="button"
            ref={buttonRef}
            onClick={() => setShowDropdown(!showDropdown)}
            className={`many-composer-icon-btn ${
              showDropdown || hasActiveCapabilities ? 'many-composer-icon-btn--active' : ''
            }`}
            title={t('chat.compose_more')}
            aria-haspopup="menu"
            aria-expanded={showDropdown}
            aria-label={t('chat.compose_more')}
          >
            <Plus size={15} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={insertAtSymbol}
            className="many-composer-icon-btn"
            title={t('many.add_to_context')}
            aria-label={t('many.add_to_context')}
          >
            <AtSign size={14} strokeWidth={2} />
          </button>

          {enhanced ? (
            <button
              type="button"
              onClick={insertSlashToken}
              className={`many-composer-icon-btn ${slash.slashActive ? 'many-composer-icon-btn--active' : ''}`}
              title={t('chat.slash_skills_title')}
              aria-label={t('chat.slash_skills_title')}
            >
              <Slash size={13} strokeWidth={2} />
            </button>
          ) : null}

          {supportsTools ? <span className="many-composer-divider" aria-hidden /> : null}

          {supportsTools ? (
            <>
              <button
                type="button"
                className={`many-tool-toggle ${toolsEnabled ? 'many-tool-toggle--on' : ''}`}
                onClick={() => setToolsEnabled(!toolsEnabled)}
                title={t('chat.capability_web')}
              >
                <Globe size={12} strokeWidth={2} />
                <span>{t('chat.capability_web')}</span>
              </button>
              {setMemoryEnabled ? (
                <button
                  type="button"
                  className={`many-tool-toggle ${memoryEnabled ? 'many-tool-toggle--on' : ''}`}
                  onClick={() => setMemoryEnabled(!memoryEnabled)}
                  title={t('many.capability_memory')}
                >
                  <Brain size={12} strokeWidth={2} />
                  <span>{t('many.capability_memory')}</span>
                </button>
              ) : null}
              <button
                type="button"
                className={`many-tool-toggle ${resourceToolsEnabled ? 'many-tool-toggle--on' : ''}`}
                onClick={() => setResourceToolsEnabled(!resourceToolsEnabled)}
                title={t('chat.capability_resources')}
              >
                <BookOpen size={12} strokeWidth={2} />
                <span>{t('chat.capability_resources')}</span>
              </button>
            </>
          ) : null}

          <span className="many-composer-tools__spacer" aria-hidden />

          {enhanced ? (
            <span className="many-model-pill shrink min-w-0">
              <InlineModelSwitcher />
            </span>
          ) : null}

          {showDropdown && dropdownRect && typeof document !== 'undefined' && createPortal(
              <div
                ref={dropdownRef}
                className="fixed z-[var(--z-popover)]"
                style={{
                  top: dropdownRect.above ? undefined : dropdownRect.top,
                  bottom: dropdownRect.above ? window.innerHeight - dropdownRect.top : undefined,
                  left: Math.min(dropdownRect.left, typeof window !== 'undefined' ? window.innerWidth - 340 : 0),
                }}
              >
                <ChatComposerPlusMenuContent
                  showAttach={!!onAttachmentsChange}
                  onAttach={() => {
                    fileInputRef.current?.click();
                    setShowDropdown(false);
                  }}
                  showAddContext
                  onAddContext={() => {
                    insertAtSymbol();
                    setShowDropdown(false);
                  }}
                  manyCapabilities={
                    supportsTools
                      ? {
                          resourceToolsEnabled,
                          setResourceToolsEnabled,
                          toolsEnabled,
                          setToolsEnabled,
                          mcpEnabled,
                          setMcpEnabled,
                          hasMcp,
                        }
                      : null
                  }
                  toolsSlot={hasMcp ? <McpCapabilitiesSection /> : null}
                  disableQuick={isLoading}
                  menuLayout={menuLayout}
                  isMenuOpen={showDropdown}
                  skillsHandlers={skillsHandlers}
                  onCloseMenu={() => setShowDropdown(false)}
                />
              </div>,
              document.body
            )}

          {isLoading ? (
            <button
              type="button"
              onClick={onAbort}
              className="many-composer-send flex shrink-0 items-center justify-center rounded-full transition-all"
              style={{ background: 'var(--error)', color: 'var(--base-text, #ffffff)' }}
              title={t('chat.stop')}
              aria-label={t('chat.stop')}
            >
              <StopCircle size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!input.trim() && attachments.length === 0}
              className="many-composer-send flex shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50"
              style={{
                background:
                  input.trim() || attachments.length > 0 ? 'var(--accent)' : 'var(--bg-tertiary)',
                color:
                  input.trim() || attachments.length > 0
                    ? 'var(--base-text, #ffffff)'
                    : 'var(--quaternary-text)',
              }}
              title={t('chat.send')}
              aria-label={t('chat.send')}
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </AIComposerFrame>

      {showComposerKeyboardHint && !isWelcomeScreen ? (
        <p className="many-composer-hint px-1">
          <kbd>↵</kbd> {t('many.composer_hint_send')} · <kbd>⇧↵</kbd> {t('many.composer_hint_newline')} ·{' '}
          <kbd>/</kbd> {t('many.composer_hint_skills')} · <kbd>@</kbd> {t('many.composer_hint_docs')}
        </p>
      ) : null}

      {enhanced && slash.slashActive && slash.slashRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={slash.slashDropdownRef}
          className="fixed rounded-xl border shadow-lg py-1 overflow-y-auto"
          style={{
            bottom: window.innerHeight - slash.slashRect.top + 6,
            left: slash.slashRect.left,
            width: 300,
            maxHeight: 260,
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
            zIndex: 'var(--z-popover)',
          }}
        >
          <div className="px-3 py-1.5 text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--tertiary-text)' }}>
            {t('chat.slash_skills_title')}
          </div>
          {slash.filteredSkills.length === 0 ? (
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--tertiary-text)' }}>
              {t('common.no_results')}
            </div>
          ) : (
            slash.filteredSkills.map((skill, idx) => (
              <div
                key={skill.id}
                className="border-b border-[var(--border)] last:border-0"
                style={{ background: idx === slash.slashSelectedIdx ? 'var(--bg-hover)' : 'transparent' }}
              >
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
                  style={{ color: 'var(--primary-text)', fontSize: 13 }}
                  onMouseEnter={() => slash.setSlashSelectedIdx(idx)}
                  onClick={() => applySlashOneShot(skill)}
                >
                  <span className="font-medium">{skill.name}</span>
                  {skill.description ? (
                    <span className="text-[12px] text-[var(--tertiary-text)] line-clamp-2">{skill.description}</span>
                  ) : null}
                </button>
                <div className="flex flex-wrap gap-2 px-3 pb-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--secondary-text)]">
                    <input
                      type="checkbox"
                      checked={activeStickySkillId === skill.id}
                      onChange={() => {
                        if (!currentSessionId) return;
                        const next = activeStickySkillId === skill.id ? null : skill.id;
                        setActiveSkillForSession(currentSessionId, next);
                        const cursor = inputRef.current?.selectionStart ?? input.length;
                        slash.removeSlashTokenFromInput(cursor);
                        slash.setSlashActive(false);
                      }}
                      className="rounded border-[var(--border)]"
                    />
                    {t('chat.slash_keep_active')}
                  </label>
                </div>
              </div>
            ))
          )}
        </div>,
        document.body
      )}

      {mention.mentionActive && mention.mentionRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={mention.mentionDropdownRef}
          className="fixed rounded-xl border shadow-lg py-1 overflow-y-auto"
          style={{
            bottom: window.innerHeight - mention.mentionRect.top + 6,
            left: mention.mentionRect.left,
            width: 280,
            maxHeight: 240,
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
            zIndex: 'var(--z-popover)',
          }}
        >
          <div className="px-3 py-1.5 text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--tertiary-text)' }}>
            {t('many.add_to_context')}
          </div>
          {mention.mentionResources.length === 0 ? (
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--tertiary-text)' }}>
              {t('common.no_results')}
            </div>
          ) : (
            mention.mentionResources.map((resource, idx) => (
              <button
                key={resource.id}
                type="button"
                onClick={() => mention.selectMentionResource(resource)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
                style={{
                  background: idx === mention.mentionSelectedIdx ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--primary-text)',
                  fontSize: 13,
                }}
              >
                <DomeResourceIcon type={resource.type} name={resource.title} size={12} className="shrink-0 text-[var(--tertiary-text)]" />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {resource.title}
                </span>
                <span style={{ fontSize: 12, color: 'var(--tertiary-text)', flexShrink: 0 }}>{resource.type}</span>
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
});
