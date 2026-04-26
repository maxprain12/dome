
import { memo, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  StopCircle,
  FileText,
  Mic,
  Loader2,
  Plus,
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { transcribeAudioBlob } from '@/lib/transcription/transcribeBlob';
import { useMediaRecorder } from '@/lib/transcription/useMediaRecorder';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';
import { useManyStore } from '@/lib/store/useManyStore';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { processAttachmentFile } from '@/lib/chat/processAttachmentFile';
import { ChatComposerPlusMenuContent, type ChatComposerSkillsHandlers } from '@/components/chat/ChatComposerPlusMenu';
import { ChatSkillChip } from '@/components/chat/ChatSkillChip';
import {
  AI_COMPOSER_INPUT_HANDLER,
  AI_COMPOSER_TEXTAREA_CLASS,
  AIComposerAttachmentTray,
  AIComposerFrame,
  AIComposerIconButton,
  AIComposerPinnedResourceChip,
} from '@/components/chat/AIComposer';
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
  mcpEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  setResourceToolsEnabled: (v: boolean) => void;
  setMcpEnabled: (v: boolean) => void;
  supportsTools: boolean;
  hasMcp: boolean;
  onSend: () => void;
  onAbort: () => void;
  onVoiceSend?: (text: string) => void;
  isWelcomeScreen?: boolean;
  inputPlaceholderOverride?: string | null;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (items: ChatAttachment[]) => void;
  /** `full` = slash skills, nested + menu, inline model switcher; `legacy` = previous single-scroll + menu */
  variant?: 'full' | 'legacy';
}

export default memo(function ManyChatInput({
  input,
  setInput,
  inputRef,
  isLoading,
  toolsEnabled,
  resourceToolsEnabled,
  mcpEnabled,
  setToolsEnabled,
  setResourceToolsEnabled,
  setMcpEnabled,
  supportsTools,
  hasMcp,
  onSend,
  onAbort,
  onVoiceSend,
  isWelcomeScreen = false,
  inputPlaceholderOverride = null,
  attachments = [],
  onAttachmentsChange,
  variant = 'full',
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

  const [voiceToSend, setVoiceToSend] = useState(false);
  const voiceArmRef = useRef(false);

  const voiceRecorder = useMediaRecorder({
    onBlob: async (blob) => {
      const tr = await transcribeAudioBlob(blob);
      if (!tr.success) {
        notifications.show({ title: t('manyVoice.transcribe_failed'), message: tr.error, color: 'red' });
        return;
      }
      if (voiceToSend && onVoiceSend) {
        onVoiceSend(tr.text);
      } else {
        setInput((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${tr.text}`);
      }
    },
    onEmpty: () => {
      notifications.show({
        title: t('media.dock_empty_recording'),
        message: t('media.dock_empty_recording'),
        color: 'yellow',
      });
    },
    onError: (msg) => {
      notifications.show({ title: t('media.dock_mic_permission'), message: msg, color: 'red' });
    },
  });
  const voicePhase = voiceRecorder.phase;

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

  const insertAtSymbol = useCallback(() => {
    mention.insertAtSymbol();
  }, [mention]);

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

  const canVoice =
    typeof window !== 'undefined' &&
    typeof window.electron?.transcription?.bufferToText === 'function';

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
      {(pinnedResources.length > 0 ||
        (enhanced && (pendingOneShotSkillId || activeStickySkillId))) && (
        <div className={`flex flex-wrap gap-1.5 mb-2 ${isWelcomeScreen ? 'justify-center' : ''}`}>
          {pinnedResources.map((resource) => (
            <AIComposerPinnedResourceChip key={resource.id} resource={resource} onRemove={removePinnedResource} />
          ))}
          {enhanced && pendingOneShotSkillId ? (
            <ChatSkillChip
              label={skillLabels[pendingOneShotSkillId] || pendingOneShotSkillId}
              onRemove={() => setPendingOneShotSkill(null)}
            />
          ) : null}
          {enhanced && activeStickySkillId ? (
            <ChatSkillChip
              sticky
              label={skillLabels[activeStickySkillId] || activeStickySkillId}
              onRemove={() => currentSessionId && setActiveSkillForSession(currentSessionId, null)}
            />
          ) : null}
        </div>
      )}

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
                ? t('chat.ask_placeholder')
                : resourceToolsEnabled
                  ? t('many.input_placeholder_docs')
                  : toolsEnabled
                    ? t('many.input_placeholder_web')
                    : t('many.input_placeholder_docs')
          }
          disabled={isLoading}
          rows={isWelcomeScreen ? 2 : 1}
          className={AI_COMPOSER_TEXTAREA_CLASS}
          style={{
            lineHeight: '1.6',
            border: 'none',
            boxShadow: 'none',
            minHeight: isWelcomeScreen ? 72 : 48,
            maxHeight: 200,
          }}
        />

        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-1">
              <button
              type="button"
              ref={buttonRef}
              onClick={() => setShowDropdown(!showDropdown)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                showDropdown || hasActiveCapabilities
                  ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
                  : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]'
              }`}
              title={t('chat.compose_more')}
              aria-haspopup="menu"
              aria-expanded={showDropdown}
              aria-label={t('chat.compose_more')}
            >
              <Plus size={18} strokeWidth={2} />
            </button>

            {enhanced ? <InlineModelSwitcher /> : null}

            {showDropdown && dropdownRect && typeof document !== 'undefined' && createPortal(
              <div
                ref={dropdownRef}
                className="fixed z-[var(--z-dropdown)]"
                style={{
                  top: dropdownRect.above ? undefined : dropdownRect.top,
                  bottom: dropdownRect.above ? window.innerHeight - dropdownRect.top : undefined,
                  left: Math.min(dropdownRect.left, typeof window !== 'undefined' ? window.innerWidth - 420 : 0),
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
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canVoice ? (
              <div className="flex items-center gap-1">
              <AIComposerIconButton
                  type="button"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (isLoading || voicePhase === 'processing' || voicePhase === 'recording') return;
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                    voiceArmRef.current = true;
                    void voiceRecorder.startMicRecording().then(() => { voiceArmRef.current = false; });
                  }}
                  onPointerUp={(e) => {
                    if (e.button !== 0) return;
                    try {
                      (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                    } catch { /* */ }
                    if (voicePhase === 'recording') {
                      voiceRecorder.stopRecording();
                    } else if (voiceArmRef.current) {
                      voiceArmRef.current = false;
                      voiceRecorder.cancelRecording();
                    }
                  }}
                  onPointerCancel={() => {
                    if (voicePhase === 'recording') voiceRecorder.cancelRecording();
                  }}
                  onPointerLeave={(e) => {
                    if (voicePhase !== 'recording') return;
                    if (e.buttons === 0) voiceRecorder.cancelRecording();
                  }}
                  disabled={isLoading || voicePhase === 'processing'}
                  className="select-none touch-none"
                  style={{
                    background: voicePhase === 'recording' ? 'var(--error)' : 'var(--bg-tertiary)',
                    color: voicePhase === 'recording' ? 'var(--base-text)' : 'var(--secondary-text)',
                  }}
                  title={t('manyVoice.ptt_subtitle')}
                  ariaLabel={t('manyVoice.ptt_subtitle')}
                >
                  {voicePhase === 'processing' ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <Mic size={16} strokeWidth={2} aria-hidden />
                  )}
                </AIComposerIconButton>
                {onVoiceSend ? (
                  <button
                    type="button"
                    onClick={() => setVoiceToSend((v) => !v)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: voiceToSend ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
                      color: 'var(--secondary-text)',
                    }}
                    title={t('manyVoice.toggle_send_mode')}
                  >
                    {voiceToSend ? t('manyVoice.mode_send') : t('manyVoice.mode_input')}
                  </button>
                ) : null}
              </div>
            ) : null}
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
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--tertiary-text)' }}>
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
                    <span className="text-[11px] text-[var(--tertiary-text)] line-clamp-2">{skill.description}</span>
                  ) : null}
                </button>
                <div className="flex flex-wrap gap-2 px-3 pb-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--secondary-text)]">
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
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--tertiary-text)' }}>
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
                <FileText size={12} style={{ flexShrink: 0, color: 'var(--tertiary-text)' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {resource.title}
                </span>
                <span style={{ fontSize: 10, color: 'var(--tertiary-text)', flexShrink: 0 }}>{resource.type}</span>
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
});
