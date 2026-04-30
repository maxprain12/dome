'use client';

import { memo, useCallback, useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ArrowUp, StopCircle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { processAttachmentFile } from '@/lib/chat/processAttachmentFile';
import { ChatComposerPlusMenuContent, type ChatComposerSkillsHandlers } from '@/components/chat/ChatComposerPlusMenu';
import { AgentChatPlusAgentSlot } from '@/components/agents/AgentChatPlusAgentSlot';
import {
  AI_COMPOSER_INPUT_HANDLER,
  AI_COMPOSER_TEXTAREA_CLASS,
  AIComposerAttachmentTray,
  AIComposerFrame,
  AIComposerPinnedResourceChip,
} from '@/components/chat/AIComposer';
import { useResourceMention } from '@/lib/chat/useResourceMention';
import { useSlashSkills, type SlashSkillItem } from '@/lib/chat/useSlashSkills';
import { InlineModelSwitcher } from '@/components/chat/InlineModelSwitcher';
import { ChatSkillChip } from '@/components/chat/ChatSkillChip';
import { db } from '@/lib/db/client';
import type { PinnedResource } from '@/lib/store/useManyStore';

export interface AgentChatInputProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  onSend: () => void;
  onAbort: () => void;
  placeholder?: string;
  mcpServerIds: string[];
  toolIds: string[];
  disabledMcpIds: Set<string>;
  disabledToolIds: Set<string>;
  onToggleMcp: (id: string) => void;
  onToggleTool: (id: string) => void;
  hasAgentFunctions?: boolean;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (items: ChatAttachment[]) => void;
  variant?: 'full' | 'legacy';
  pinnedResources?: PinnedResource[];
  onAddPinnedResource?: (r: PinnedResource) => void;
  onRemovePinnedResource?: (id: string) => void;
  pendingOneShotSkillId?: string | null;
  onSetPendingOneShotSkill?: (id: string | null) => void;
  activeStickySkillId?: string | null;
  onSetActiveStickySkill?: (id: string | null) => void;
}

export default memo(function AgentChatInput({
  input,
  setInput,
  inputRef,
  isLoading,
  onSend,
  onAbort,
  placeholder,
  mcpServerIds,
  toolIds,
  disabledMcpIds,
  disabledToolIds,
  onToggleMcp,
  onToggleTool,
  hasAgentFunctions,
  attachments = [],
  onAttachmentsChange,
  variant = 'full',
  pinnedResources = [],
  onAddPinnedResource,
  onRemovePinnedResource,
  pendingOneShotSkillId = null,
  onSetPendingOneShotSkill,
  activeStickySkillId = null,
  onSetActiveStickySkill,
}: AgentChatInputProps) {
  const { t } = useTranslation();
  const enhanced = variant === 'full';
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; above?: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const addPinned = onAddPinnedResource ?? (() => {});
  const mention = useResourceMention({
    input,
    setInput,
    inputRef,
    containerRef,
    onPinResource: addPinned,
    enabled: enhanced,
  });

  const slash = useSlashSkills({
    input,
    setInput,
    inputRef,
    containerRef,
    enabled: enhanced,
  });

  const applySlashOneShot = useCallback(
    (skill: SlashSkillItem) => {
      const cursor = inputRef.current?.selectionStart ?? input.length;
      slash.removeSlashTokenFromInput(cursor);
      slash.setSlashActive(false);
      onSetPendingOneShotSkill?.(skill.id);
      setSkillLabels((prev) => ({ ...prev, [skill.id]: skill.name }));
    },
    [input.length, inputRef, slash, onSetPendingOneShotSkill],
  );

  const handlePickFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || !onAttachmentsChange) return;
      const next: ChatAttachment[] = [...attachments];
      for (const file of Array.from(fileList)) {
        const a = await processAttachmentFile(file);
        if (a) next.push(a);
      }
      onAttachmentsChange(next);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [attachments, onAttachmentsChange],
  );

  const hasMcp = mcpServerIds.length > 0;
  const hasTools = toolIds.length > 0;

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
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
    if (showDropdown && buttonRef.current && typeof window !== 'undefined') {
      const rect = buttonRef.current.getBoundingClientRect();
      const estimatedHeight = 200;
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      setDropdownRect({
        top: showAbove ? rect.top - 6 : rect.bottom + 6,
        left: rect.left,
        above: showAbove,
      });
    } else {
      setDropdownRect(null);
    }
  }, [showDropdown]);

  const insertAtSymbol = useCallback(() => {
    mention.insertAtSymbol();
  }, [mention]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (enhanced) {
        const slashRes = slash.handleSlashKeyDown(e);
        if (slashRes.handled) {
          if (slashRes.skill) applySlashOneShot(slashRes.skill);
          return;
        }
        if (mention.mentionKeyDown(e)) return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() || attachments.length > 0) onSend();
      }
    },
    [enhanced, slash, mention, applySlashOneShot, onSend, input, attachments.length],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);
      const cursor = e.target.selectionStart ?? val.length;
      if (enhanced) {
        mention.updateFromText(val, cursor);
        slash.updateFromText(val, cursor);
      }
    },
    [setInput, enhanced, mention, slash],
  );

  const handleInput = AI_COMPOSER_INPUT_HANDLER;

  const hasActiveAgentTools =
    (hasMcp && mcpServerIds.some((id) => !disabledMcpIds.has(id))) ||
    (hasTools && toolIds.some((id) => !disabledToolIds.has(id)));

  const showPlus = hasAgentFunctions || onAttachmentsChange || enhanced;
  const menuLayout = enhanced ? 'nested' : 'flat';

  const skillsHandlers: ChatComposerSkillsHandlers | null =
    enhanced && onSetPendingOneShotSkill && onSetActiveStickySkill
      ? {
          onInvokeOneShot: (id) => {
            onSetPendingOneShotSkill(id);
            setShowDropdown(false);
          },
          onSetSticky: (id) => {
            onSetActiveStickySkill(id);
            setShowDropdown(false);
          },
          activeStickySkillId: activeStickySkillId ?? null,
          onCloseMenu: () => setShowDropdown(false),
        }
      : null;

  const removePinned = onRemovePinnedResource ?? (() => {});

  return (
    <div className="many-input-area shrink-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
      {enhanced &&
      (pinnedResources.length > 0 || pendingOneShotSkillId || activeStickySkillId) ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pinnedResources.map((resource) => (
            <AIComposerPinnedResourceChip key={resource.id} resource={resource} onRemove={removePinned} />
          ))}
          {pendingOneShotSkillId ? (
            <ChatSkillChip
              label={skillLabels[pendingOneShotSkillId] || pendingOneShotSkillId}
              onRemove={() => onSetPendingOneShotSkill?.(null)}
            />
          ) : null}
          {activeStickySkillId ? (
            <ChatSkillChip
              sticky
              label={skillLabels[activeStickySkillId] || activeStickySkillId}
              onRemove={() => onSetActiveStickySkill?.(null)}
            />
          ) : null}
        </div>
      ) : null}

      <AIComposerFrame
        containerRef={containerRef}
        isDragging={isDragging}
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
        {onAttachmentsChange ? (
          <AIComposerAttachmentTray
            attachments={attachments}
            onRemove={(id) => onAttachmentsChange(attachments.filter((item) => item.id !== id))}
          />
        ) : null}
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
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={input}
          onChange={enhanced ? handleChange : (e) => setInput(e.target.value)}
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
                if (f) {
                  const d = new DataTransfer();
                  d.items.add(f);
                  void handlePickFiles(d.files);
                }
                break;
              }
            }
          }}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className={AI_COMPOSER_TEXTAREA_CLASS}
          style={{
            lineHeight: '1.6',
            border: 'none',
            boxShadow: 'none',
            minHeight: 48,
            maxHeight: 200,
          }}
        />

        <div className="flex min-w-0 items-center justify-between gap-2 px-3 pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {showPlus ? (
              <>
                <button
                  ref={buttonRef}
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                    showDropdown || hasActiveAgentTools
                      ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
                      : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]'
                  }`}
                  title={t('chat.compose_more')}
                  aria-haspopup="menu"
                  aria-expanded={showDropdown}
                >
                  <Plus size={18} strokeWidth={2} />
                </button>
                {enhanced ? <InlineModelSwitcher /> : null}
                {showDropdown && dropdownRect && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={dropdownRef}
                    className="fixed"
                    style={{
                      zIndex: 'var(--z-popover)',
                      top: dropdownRect.above ? undefined : dropdownRect.top,
                      bottom: dropdownRect.above ? window.innerHeight - dropdownRect.top : undefined,
                      left: Math.min(dropdownRect.left, window.innerWidth - 340),
                    }}
                  >
                    <ChatComposerPlusMenuContent
                      showAttach={!!onAttachmentsChange}
                      onAttach={() => {
                        fileInputRef.current?.click();
                        setShowDropdown(false);
                      }}
                      showAddContext={enhanced}
                      onAddContext={() => {
                        insertAtSymbol();
                        setShowDropdown(false);
                      }}
                      manyCapabilities={null}
                      hideToolsSectionHeader
                      menuLayout={menuLayout}
                      isMenuOpen={showDropdown}
                      skillsHandlers={skillsHandlers}
                      onCloseMenu={() => setShowDropdown(false)}
                      toolsSlot={
                        hasAgentFunctions ? (
                          <AgentChatPlusAgentSlot
                            isOpen={showDropdown}
                            mcpServerIds={mcpServerIds}
                            disabledMcpIds={disabledMcpIds}
                            onToggleMcp={onToggleMcp}
                            toolIds={toolIds}
                            disabledToolIds={disabledToolIds}
                            onToggleTool={onToggleTool}
                            hasMcp={hasMcp}
                            hasTools={hasTools}
                          />
                        ) : null
                      }
                      disableQuick={isLoading}
                    />
                  </div>,
                  document.body
                )}
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isLoading ? (
              <button
                type="button"
                onClick={onAbort}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
                style={{ background: 'var(--primary-text)', color: 'var(--bg)' }}
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
                className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
                style={{
                  background: input.trim() || attachments.length > 0 ? 'var(--primary-text)' : 'var(--bg-tertiary)',
                  color: input.trim() || attachments.length > 0 ? 'var(--bg)' : 'var(--tertiary-text)',
                  opacity: input.trim() || attachments.length > 0 ? 1 : 0.5,
                }}
                title={t('chat.send')}
                aria-label={t('chat.send')}
              >
                <ArrowUp size={17} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </AIComposerFrame>

      {enhanced && slash.slashActive && slash.slashRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={slash.slashDropdownRef}
          className="fixed z-[var(--z-popover)] overflow-y-auto rounded-xl border py-1 shadow-lg"
          style={{
            bottom: window.innerHeight - slash.slashRect.top + 6,
            left: slash.slashRect.left,
            width: 300,
            maxHeight: 260,
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--tertiary-text)]">
            {t('chat.slash_skills_title')}
          </div>
          {slash.filteredSkills.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--tertiary-text)]">{t('common.no_results')}</div>
          ) : (
            slash.filteredSkills.map((skill, idx) => (
              <div
                key={skill.id}
                className="border-b border-[var(--border)] last:border-0"
                style={{ background: idx === slash.slashSelectedIdx ? 'var(--bg-hover)' : 'transparent' }}
              >
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[13px] text-[var(--primary-text)]"
                  onMouseEnter={() => slash.setSlashSelectedIdx(idx)}
                  onClick={() => applySlashOneShot(skill)}
                >
                  <span className="font-medium">{skill.name}</span>
                  {skill.description ? (
                    <span className="line-clamp-2 text-[11px] text-[var(--tertiary-text)]">{skill.description}</span>
                  ) : null}
                </button>
                <div className="flex flex-wrap gap-2 px-3 pb-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--secondary-text)]">
                    <input
                      type="checkbox"
                      checked={activeStickySkillId === skill.id}
                      onChange={() => {
                        const next = activeStickySkillId === skill.id ? null : skill.id;
                        onSetActiveStickySkill?.(next);
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

      {enhanced && mention.mentionActive && mention.mentionRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={mention.mentionDropdownRef}
          className="fixed z-[var(--z-popover)] overflow-y-auto rounded-xl border py-1 shadow-lg"
          style={{
            bottom: window.innerHeight - mention.mentionRect.top + 6,
            left: mention.mentionRect.left,
            width: 280,
            maxHeight: 240,
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--tertiary-text)]">
            {t('many.add_to_context')}
          </div>
          {mention.mentionResources.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--tertiary-text)]">{t('common.no_results')}</div>
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
                <FileText size={12} className="shrink-0 text-[var(--tertiary-text)]" />
                <span className="min-w-0 flex-1 truncate">{resource.title}</span>
                <span className="shrink-0 text-[10px] text-[var(--tertiary-text)]">{resource.type}</span>
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
});
