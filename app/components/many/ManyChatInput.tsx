
import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  Plus,
  StopCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatComposerPlusMenuContent } from '@/components/chat/ChatComposerPlusMenu';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { newAttachmentId } from '@/lib/chat/attachmentTypes';
import { processAttachmentFile } from '@/lib/chat/processAttachmentFile';
import {
  composerFileAccept,
  useComposerMultimodalCapabilities,
} from '@/lib/chat/useComposerMultimodalCapabilities';
import { AIComposerFrame } from '@/components/chat/AIComposer';
import ManyComposerRichInput from './ManyComposerRichInput';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';
import { useResourceMention } from '@/lib/chat/useResourceMention';
import { useSlashSkills, type SlashSkillItem } from '@/lib/chat/useSlashSkills';
import { useHashMcpMention } from '@/lib/chat/useHashMcpMention';
import { useRotatingComposerPlaceholder } from '@/lib/chat/useRotatingComposerPlaceholder';
import type { ComposerTokenTooltip } from '@/lib/chat/composerInlineHighlight';
import { listSkills, type SkillItem } from '@/lib/skills/client';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { InlineModelSwitcher } from '@/components/chat/InlineModelSwitcher';
import { useManyStore } from '@/lib/store/useManyStore';
import { db } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { handleComposerImagePaste } from '@/lib/chat/composerPaste';

const MANY_PLACEHOLDER_HINT_KEYS = [
  'many.input_placeholder_docs',
  'many.input_placeholder_hint_skills',
  'many.input_placeholder_hint_plus',
  'many.input_placeholder_web',
  'many.input_placeholder_hint_attach',
] as const;

export interface ManyChatInputProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
  toolsEnabled: boolean;
  resourceToolsEnabled: boolean;
  memoryEnabled?: boolean;
  setToolsEnabled: (v: boolean) => void;
  setResourceToolsEnabled: (v: boolean) => void;
  setMemoryEnabled?: (v: boolean) => void;
  supportsTools: boolean;
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
  /** Sidebar / narrow panel: icon-only toolbar, capabilities in + menu. */
  compact?: boolean;
  /** Context donut + popup, shown before the send button. */
  composerContextUsage?: React.ReactNode;
}

export default memo(function ManyChatInput({
  input,
  setInput,
  inputRef,
  isLoading,
  toolsEnabled,
  resourceToolsEnabled,
  memoryEnabled = true,
  setToolsEnabled,
  setResourceToolsEnabled,
  setMemoryEnabled,
  supportsTools,
  onSend,
  onAbort,
  isWelcomeScreen = false,
  inputPlaceholderOverride = null,
  attachments = [],
  onAttachmentsChange,
  variant = 'full',
  showComposerKeyboardHint = true,
  compact = false,
  composerContextUsage = null,
}: ManyChatInputProps) {
  const { t } = useTranslation();
  const multimodalCaps = useComposerMultimodalCapabilities();
  const fileAccept = useMemo(() => composerFileAccept(multimodalCaps), [multimodalCaps]);
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

  const [skillCatalog, setSkillCatalog] = useState<SkillItem[]>([]);
  const [mcpCatalog, setMcpCatalog] = useState<Array<{ name: string; description?: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void listSkills().then((res) => {
      if (cancelled || !res.success || !Array.isArray(res.data)) return;
      setSkillCatalog(res.data);
    });
    void loadMcpServersSetting().then((servers) => {
      if (cancelled) return;
      const catalog: { name: string; description: undefined }[] = [];
      for (const s of servers) {
        if (s.enabled === false) continue;
        catalog.push({ name: s.name, description: undefined });
      }
      setMcpCatalog(catalog);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const hash = useHashMcpMention({
    input,
    setInput,
    inputRef: inputRef as React.RefObject<HTMLTextAreaElement | null>,
    containerRef,
    enabled: enhanced,
  });

  const applySlashOneShot = useCallback(
    (skill: SlashSkillItem) => {
      slash.insertSlashSkill(skill);
      setPendingOneShotSkill(skill.id);
      setSkillLabels((prev) => ({ ...prev, [skill.id]: skill.name }));
    },
    [slash, setPendingOneShotSkill],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (enhanced) {
        if (hash.hashKeyDown(e)) return;
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
    [enhanced, hash, slash, mention, applySlashOneShot, onSend],
  );

  const handlePickFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || !onAttachmentsChange) return;
      let working = [...attachments];
      for (const file of Array.from(fileList)) {
        const isImage = file.type.startsWith('image/');
        const isVideo =
          file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(file.name);
        if (isImage && !multimodalCaps.supportsImage) {
          console.warn(t('chat.attachment_image_unsupported'));
          continue;
        }
        if (isVideo && !multimodalCaps.supportsVideo) {
          console.warn(t('chat.attachment_video_unsupported'));
          continue;
        }
        const pendingId = isImage || isVideo ? null : newAttachmentId();
        if (pendingId) {
          working = [
            ...working,
            { id: pendingId, kind: 'document' as const, name: file.name, text: null, status: 'loading' as const },
          ];
          onAttachmentsChange(working);
        }
        const a = await processAttachmentFile(file);
        working = pendingId ? working.filter((item) => item.id !== pendingId) : working;
        if (a) {
          working = [...working, a];
          onAttachmentsChange(working);
          setInput((prev) => {
            const gap = prev.length > 0 && !/\s$/.test(prev) ? ' ' : '';
            return `${prev}${gap}@${a.name} `;
          });
        } else if (pendingId) {
          onAttachmentsChange(working);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [attachments, multimodalCaps.supportsImage, multimodalCaps.supportsVideo, onAttachmentsChange, setInput, t],
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
        hash.updateFromText(val, cursor);
      }
      for (const pin of pinnedResources) {
        if (!val.includes(`@${pin.title}`)) {
          removePinnedResource(pin.id);
        }
      }
      if (pendingOneShotSkillId) {
        const label = skillLabels[pendingOneShotSkillId] || pendingOneShotSkillId;
        if (!val.includes(`/${label}`)) {
          setPendingOneShotSkill(null);
        }
      }
      if (activeStickySkillId && currentSessionId) {
        const label = skillLabels[activeStickySkillId] || activeStickySkillId;
        if (!val.includes(`/${label}`)) {
          setActiveSkillForSession(currentSessionId, null);
        }
      }
    },
    [
      setInput,
      enhanced,
      mention,
      slash,
      hash,
      pinnedResources,
      removePinnedResource,
      pendingOneShotSkillId,
      activeStickySkillId,
      currentSessionId,
      skillLabels,
      setPendingOneShotSkill,
      setActiveSkillForSession,
    ],
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

  const hasActiveCapabilities = resourceToolsEnabled || toolsEnabled;

  const menuLayout = 'flat';

  const hasPlaceholderOverride =
    inputPlaceholderOverride != null && inputPlaceholderOverride !== '';

  const rotatingPlaceholder = useRotatingComposerPlaceholder(MANY_PLACEHOLDER_HINT_KEYS, {
    enabled: !hasPlaceholderOverride && !isLoading,
  });

  const composerPlaceholder = hasPlaceholderOverride ? inputPlaceholderOverride! : rotatingPlaceholder;

  const canSend = !!input.trim() || attachments.length > 0 || pinnedResources.length > 0;

  const mentionHighlightLabels = pinnedResources.map((r) => r.title);
  const fileHighlightNames = attachments.map((a) => a.name);
  const skillHighlightLabels = useMemo(
    () => [
      ...(pendingOneShotSkillId ? [skillLabels[pendingOneShotSkillId] || pendingOneShotSkillId] : []),
      ...(activeStickySkillId ? [skillLabels[activeStickySkillId] || activeStickySkillId] : []),
    ],
    [pendingOneShotSkillId, activeStickySkillId, skillLabels],
  );

  const tokenTooltips = useMemo(() => {
    const map: Record<string, ComposerTokenTooltip> = {};
    const skillByKey = new Map<string, SkillItem>();
    for (const skill of skillCatalog) {
      skillByKey.set(skill.name.toLowerCase(), skill);
      skillByKey.set(skill.slug.toLowerCase(), skill);
    }

    for (const resource of pinnedResources) {
      map[`mention:${resource.title}`] = {
        title: t('many.token_doc_title', { name: resource.title }),
        description: t('many.token_doc_desc', { type: resource.type }),
      };
    }

    for (const attachment of attachments) {
      map[`file:${attachment.name}`] = {
        title: t('many.token_file_title', { name: attachment.name }),
        description: t('many.token_file_desc'),
      };
    }

    for (const skill of skillCatalog) {
      map[`skill:${skill.name}`] = {
        title: t('many.token_skill_title', { name: skill.name }),
        description: skill.description?.trim() || t('many.token_skill_desc'),
      };
      if (skill.slug !== skill.name) {
        map[`skill:${skill.slug}`] = map[`skill:${skill.name}`]!;
      }
    }

    for (const name of skillHighlightLabels) {
      if (map[`skill:${name}`]) continue;
      const found = skillByKey.get(name.toLowerCase());
      map[`skill:${name}`] = {
        title: t('many.token_skill_title', { name }),
        description: found?.description?.trim() || t('many.token_skill_desc'),
      };
    }

    for (const server of mcpCatalog) {
      const slug = server.name.replace(/\s+/g, '-');
      map[`mcp:${slug}`] = {
        title: t('many.token_mcp_title', { name: server.name }),
        description: server.description?.trim() || t('many.token_mcp_desc'),
      };
    }

    return map;
  }, [t, pinnedResources, attachments, skillCatalog, mcpCatalog, skillHighlightLabels]);

  const inputPadding = isWelcomeScreen ? '16px 22px 8px' : '12px 18px 6px';

  const outerCls = isWelcomeScreen
    ? 'many-input-area bg-transparent px-0 pb-0'
    : 'many-input-area border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3';

  return (
    <div className={outerCls}>
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
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={fileAccept}
            aria-label={t('chat.attach_files')}
            onChange={(e) => { void handlePickFiles(e.target.files); }}
          />
        ) : null}
        <ManyComposerRichInput
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
          onPaste={(e) => {
            if (!onAttachmentsChange) return;
            void handleComposerImagePaste(e, {
              supportsImage: multimodalCaps.supportsImage,
              onUnsupported: () => showToast('info', t('chat.paste_image_unsupported')),
              onFiles: (files) => { void handlePickFiles(files); },
            });
          }}
          placeholder={composerPlaceholder}
          disabled={isLoading}
          rows={isWelcomeScreen ? 2 : 1}
          mentionLabels={mentionHighlightLabels}
          skillLabels={skillHighlightLabels}
          fileNames={fileHighlightNames}
          tokenTooltips={tokenTooltips}
          style={{
            lineHeight: '1.55',
            border: 'none',
            boxShadow: 'none',
            padding: inputPadding,
            minHeight: isWelcomeScreen ? 72 : 24,
            maxHeight: 200,
          }}
        />

        <div className={`many-composer-tools${compact ? ' many-composer-tools--compact' : ''}`}>
          <div className="many-composer-tools__bar">
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

            {enhanced ? (
              <span className="many-model-pill shrink min-w-0">
                <InlineModelSwitcher />
              </span>
            ) : null}

            {composerContextUsage ? (
              <span className="many-composer-context">{composerContextUsage}</span>
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
                  showSlashSkills={enhanced}
                  onSlashSkills={() => {
                    insertSlashToken();
                    setShowDropdown(false);
                  }}
                  showHashMcp={enhanced}
                  onHashMcp={() => {
                    hash.insertHashToken();
                    setShowDropdown(false);
                  }}
                  manyCapabilities={
                    supportsTools
                      ? {
                          resourceToolsEnabled,
                          setResourceToolsEnabled,
                          toolsEnabled,
                          setToolsEnabled,
                          memoryEnabled,
                          setMemoryEnabled,
                        }
                      : null
                  }
                  disableQuick={isLoading}
                  menuLayout={menuLayout}
                  isMenuOpen={showDropdown}
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
                style={{ background: 'var(--error)', color: 'var(--base-text)' }}
                title={t('chat.stop')}
                aria-label={t('chat.stop')}
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                className="many-composer-send flex shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50"
                style={{
                  background: canSend ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: canSend ? 'var(--base-text)' : 'var(--quaternary-text)',
                }}
                title={t('chat.send')}
                aria-label={t('chat.send')}
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </AIComposerFrame>

      {showComposerKeyboardHint && !isWelcomeScreen ? (
        <p className={`many-composer-hint px-1${compact ? ' many-composer-hint--compact' : ''}`}>
          {compact ? (
            <>
              <kbd>↵</kbd> {t('many.composer_hint_send')} · <kbd>⇧↵</kbd> {t('many.composer_hint_newline')}
            </>
          ) : (
            <>
              <kbd>↵</kbd> {t('many.composer_hint_send')} · <kbd>⇧↵</kbd> {t('many.composer_hint_newline')} ·{' '}
              <kbd>/</kbd> {t('many.composer_hint_skills')} · <kbd>@</kbd> {t('many.composer_hint_docs')} ·{' '}
              <kbd>#</kbd> MCP
            </>
          )}
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
                        const enabling = activeStickySkillId !== skill.id;
                        if (enabling) {
                          setActiveSkillForSession(currentSessionId, skill.id);
                          setSkillLabels((prev) => ({ ...prev, [skill.id]: skill.name }));
                          setInput((prev) => {
                            const token = `/${skill.name}`;
                            if (prev.includes(token)) return prev;
                            const gap = prev.length > 0 && !/\s$/.test(prev) ? ' ' : '';
                            return `${prev}${gap}${token} `;
                          });
                        } else {
                          setActiveSkillForSession(currentSessionId, null);
                          setInput((prev) =>
                            prev.replace(new RegExp(`/${skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`, 'g'), ''),
                          );
                        }
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

      {enhanced && hash.hashActive && hash.hashRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={hash.hashDropdownRef}
          className="fixed rounded-xl border shadow-lg py-1 overflow-y-auto"
          style={{
            bottom: window.innerHeight - hash.hashRect.top + 6,
            left: hash.hashRect.left,
            width: 280,
            maxHeight: 240,
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
            zIndex: 'var(--z-popover)',
          }}
        >
          <div className="px-3 py-1.5 text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--tertiary-text)' }}>
            {t('chat.quick_mcp')}
          </div>
          {hash.filteredServers.length === 0 ? (
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--tertiary-text)' }}>
              {t('chat.mcp_no_servers')}
            </div>
          ) : (
            hash.filteredServers.map((server, idx) => (
              <button
                key={server.name}
                type="button"
                onClick={() => hash.insertHashServer(server)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
                style={{
                  background: idx === hash.hashSelectedIdx ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--primary-text)',
                  fontSize: 13,
                }}
                onMouseEnter={() => hash.setHashSelectedIdx(idx)}
              >
                <span className="font-medium">#{server.name.replace(/\s+/g, '-')}</span>
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
});
