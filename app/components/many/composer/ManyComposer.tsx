import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowUp02Icon, StopCircleIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
} from '@/components/ui/input-group';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { InlineModelSwitcher } from '@/components/chat/InlineModelSwitcher';
import ManyComposerChips from './ManyComposerChips';
import ManyComposerInput from './ManyComposerInput';
import ManyCapabilitiesMenu from './ManyCapabilitiesMenu';
import { ManyMcpPicker, ManyMentionPicker, ManySkillPicker } from './ManyComposerPickers';
import { useResourceMention } from '@/lib/chat/useResourceMention';
import { useSlashSkills, type SlashSkillItem } from '@/lib/chat/useSlashSkills';
import { useHashMcpMention } from '@/lib/chat/useHashMcpMention';
import { useRotatingComposerPlaceholder } from '@/lib/chat/useRotatingComposerPlaceholder';
import {
  composerFileAccept,
  useComposerMultimodalCapabilities,
} from '@/lib/chat/useComposerMultimodalCapabilities';
import { handleComposerImagePaste } from '@/lib/chat/composerPaste';
import { processAttachmentFile } from '@/lib/chat/processAttachmentFile';
import { newAttachmentId, type ChatAttachment } from '@/lib/chat/attachmentTypes';
import type { ComposerTokenTooltip } from '@/lib/chat/composerInlineHighlight';
import { listSkills, type SkillItem } from '@/lib/skills/client';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { db } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { cn } from '@/lib/utils';

const PLACEHOLDER_HINT_KEYS = [
  'many.input_placeholder_docs',
  'many.input_placeholder_hint_skills',
  'many.input_placeholder_hint_plus',
  'many.input_placeholder_web',
  'many.input_placeholder_hint_attach',
] as const;

export interface ManyComposerProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  inputRef: RefObject<HTMLTextAreaElement>;
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
  /** `welcome` renders the hero island (bigger field, no hints). */
  variant?: 'panel' | 'welcome';
  placeholderOverride?: string | null;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (items: ChatAttachment[]) => void;
  /** Show the ↵ / ⇧↵ / tokens hint line under the island. */
  showKeyboardHint?: boolean;
  /** Narrow surface: shorter hint line. */
  compact?: boolean;
  /** Context budget gauge, rendered in the action rail. */
  contextUsage?: ReactNode;
}

/**
 * The Many composer island: context chips, token-highlighted input and an
 * action rail (capabilities menu, model switcher, budget gauge, send/stop).
 */
const ManyComposer = memo(function ManyComposer({
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
  variant = 'panel',
  placeholderOverride = null,
  attachments = [],
  onAttachmentsChange,
  showKeyboardHint = true,
  compact = false,
  contextUsage,
}: ManyComposerProps) {
  const { t } = useTranslation();
  const isWelcome = variant === 'welcome';

  const multimodalCaps = useComposerMultimodalCapabilities();
  const fileAccept = useMemo(() => composerFileAccept(multimodalCaps), [multimodalCaps]);

  const pinnedResources = useManyStore((s) => s.pinnedResources);
  const addPinnedResource = useManyStore((s) => s.addPinnedResource);
  const removePinnedResource = useManyStore((s) => s.removePinnedResource);
  const pendingOneShotSkillId = useManyStore((s) => s.pendingOneShotSkillId);
  const setPendingOneShotSkill = useManyStore((s) => s.setPendingOneShotSkill);
  const activeSkillIdBySession = useManyStore((s) => s.activeSkillIdBySession);
  const setActiveSkillForSession = useManyStore((s) => s.setActiveSkillForSession);
  const currentSessionId = useManyStore((s) => s.currentSessionId);

  const activeStickySkillId = currentSessionId
    ? activeSkillIdBySession[currentSessionId] ?? null
    : null;

  const [skillLabels, setSkillLabels] = useState<Record<string, string>>({});
  const [skillCatalog, setSkillCatalog] = useState<SkillItem[]>([]);
  const [mcpCatalog, setMcpCatalog] = useState<Array<{ name: string; description?: string }>>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ids = [pendingOneShotSkillId, activeStickySkillId].filter((x): x is string => !!x);
    if (!ids.length || !db.isAvailable()) return;
    let cancelled = false;
    void db.getAISkills().then((res) => {
      if (cancelled || !res.success || !Array.isArray(res.data)) return;
      const next: Record<string, string> = {};
      const idSet = new Set(ids);
      for (const row of res.data as Array<{ id?: string; name?: string }>) {
        if (row.id && idSet.has(row.id)) {
          next[row.id] = row.name || row.id;
        }
      }
      setSkillLabels((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingOneShotSkillId, activeStickySkillId]);

  useEffect(() => {
    let cancelled = false;
    void listSkills().then((res) => {
      if (cancelled || !res.success || !Array.isArray(res.data)) return;
      setSkillCatalog(res.data);
    });
    void loadMcpServersSetting().then((servers) => {
      if (cancelled) return;
      setMcpCatalog(
        servers
          .filter((s) => s.enabled !== false)
          .map((s) => ({ name: s.name, description: undefined })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTabProjectId = useTabStore(
    (s) => s.tabs.find((tab) => tab.id === s.activeTabId)?.projectId,
  );
  const currentProjectId = useAppStore((s) => s.currentProject?.id);
  const mentionProjectId = activeTabProjectId ?? currentProjectId ?? 'default';

  const mention = useResourceMention({
    input,
    setInput,
    inputRef,
    containerRef,
    onPinResource: addPinnedResource,
    enabled: true,
    projectId: mentionProjectId,
  });

  const slash = useSlashSkills({
    input,
    setInput,
    inputRef: inputRef as RefObject<HTMLTextAreaElement | null>,
    containerRef,
    enabled: true,
  });

  const hash = useHashMcpMention({
    input,
    setInput,
    inputRef: inputRef as RefObject<HTMLTextAreaElement | null>,
    containerRef,
    enabled: true,
  });

  const applySlashOneShot = useCallback(
    (skill: SlashSkillItem) => {
      slash.insertSlashSkill(skill);
      setPendingOneShotSkill(skill.id);
      setSkillLabels((prev) => ({ ...prev, [skill.id]: skill.name }));
    },
    [slash, setPendingOneShotSkill],
  );

  const handleSlashStickyToggle = useCallback(
    (skill: SlashSkillItem, enabling: boolean) => {
      if (!currentSessionId) return;
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
          prev.replace(
            new RegExp(`/${skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`, 'g'),
            '',
          ),
        );
      }
      slash.setSlashActive(false);
    },
    [currentSessionId, setActiveSkillForSession, setInput, slash],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (hash.hashKeyDown(e)) return;
      const slashRes = slash.handleSlashKeyDown(e);
      if (slashRes.handled) {
        if (slashRes.skill) {
          applySlashOneShot(slashRes.skill);
        }
        return;
      }
      if (mention.mentionKeyDown(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [hash, slash, mention, applySlashOneShot, onSend],
  );

  const handlePickFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || !onAttachmentsChange) return;
      let working = [...attachments];
      for (const file of Array.from(fileList)) {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(file.name);
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
            {
              id: pendingId,
              kind: 'document' as const,
              name: file.name,
              text: null,
              status: 'loading' as const,
            },
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
    [
      attachments,
      multimodalCaps.supportsImage,
      multimodalCaps.supportsVideo,
      onAttachmentsChange,
      setInput,
      t,
    ],
  );

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
      const previous = input;
      setInput(val);
      const cursor = e.target.selectionStart ?? val.length;
      mention.updateFromText(val, cursor);
      slash.updateFromText(val, cursor);
      hash.updateFromText(val, cursor);
      // Only drop pins when the user removes an @mention that was already in the text.
      // Chip-only pins (e.g. email "Ask Many") must survive typing complementary text.
      for (const pin of pinnedResources) {
        const token = `@${pin.title}`;
        if (previous.includes(token) && !val.includes(token)) {
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
      input,
      setInput,
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

  const hasPlaceholderOverride = placeholderOverride != null && placeholderOverride !== '';
  const rotatingPlaceholder = useRotatingComposerPlaceholder(PLACEHOLDER_HINT_KEYS, {
    enabled: !hasPlaceholderOverride && !isLoading,
  });
  const placeholder = hasPlaceholderOverride ? placeholderOverride! : rotatingPlaceholder;

  const canSend = !!input.trim() || attachments.length > 0 || pinnedResources.length > 0;

  const mentionHighlightLabels = pinnedResources.map((r) => r.title);
  const fileHighlightNames = attachments.map((a) => a.name);
  const skillHighlightLabels = useMemo(
    () => [
      ...(pendingOneShotSkillId
        ? [skillLabels[pendingOneShotSkillId] || pendingOneShotSkillId]
        : []),
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

  return (
    <div className={cn('flex flex-col gap-1.5', !isWelcome && 'px-3 pb-3 pt-1')}>
      <div
        ref={containerRef}
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
          <Input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={fileAccept}
            aria-label={t('chat.attach_files')}
            onChange={(e) => {
              void handlePickFiles(e.target.files);
            }}
          />
        ) : null}

        <InputGroup
          data-disabled={isLoading ? true : undefined}
          className={cn(
            'h-auto w-full min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-2xl border border-input bg-card shadow-sm transition-[border-color,box-shadow]',
            'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/30',
            isDragging && 'border-primary/50 bg-primary/5',
            isWelcome && 'rounded-3xl shadow-md',
          )}
        >
          {onAttachmentsChange &&
          (attachments.length > 0 || pinnedResources.length > 0) ? (
            <InputGroupAddon align="block-start" className="min-w-0 overflow-hidden px-0 pt-0">
              <ManyComposerChips
                attachments={attachments}
                pinnedResources={pinnedResources}
                onRemoveAttachment={(id) =>
                  onAttachmentsChange(attachments.filter((a) => a.id !== id))
                }
                onRemovePinned={removePinnedResource}
              />
            </InputGroupAddon>
          ) : null}

          <div className={cn('min-w-0 w-full px-3 pb-1 pt-3', isWelcome && 'px-4 pt-4')}>
            <ManyComposerInput
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
              onPaste={(e) => {
                if (!onAttachmentsChange) return;
                void handleComposerImagePaste(e, {
                  supportsImage: multimodalCaps.supportsImage,
                  onUnsupported: () => showToast('info', t('chat.paste_image_unsupported')),
                  onFiles: (files) => {
                    void handlePickFiles(files);
                  },
                });
              }}
              placeholder={placeholder}
              disabled={isLoading}
              rows={isWelcome ? 2 : 1}
              mentionLabels={mentionHighlightLabels}
              skillLabels={skillHighlightLabels}
              fileNames={fileHighlightNames}
              tokenTooltips={tokenTooltips}
              className={isWelcome ? 'min-h-16 max-h-[200px]' : 'min-h-6 max-h-[200px]'}
            />
          </div>

          <InputGroupAddon
            align="block-end"
            className="justify-between gap-2 border-0 px-2 pb-2 pt-1"
          >
            <div className="flex min-w-0 items-center gap-1">
              <ManyCapabilitiesMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                showAttach={!!onAttachmentsChange}
                onAttach={() => {
                  fileInputRef.current?.click();
                  setMenuOpen(false);
                }}
                onAddContext={() => {
                  mention.insertAtSymbol();
                  setMenuOpen(false);
                }}
                onSlashSkills={() => {
                  insertSlashToken();
                  setMenuOpen(false);
                }}
                onHashMcp={() => {
                  hash.insertHashToken();
                  setMenuOpen(false);
                }}
                capabilities={
                  supportsTools
                    ? {
                        toolsEnabled,
                        setToolsEnabled,
                        resourceToolsEnabled,
                        setResourceToolsEnabled,
                        memoryEnabled,
                        setMemoryEnabled,
                      }
                    : null
                }
                disabled={isLoading}
              />
              <span className="min-w-0 shrink">
                <InlineModelSwitcher />
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {contextUsage}
              {isLoading ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  className="rounded-full"
                  onClick={onAbort}
                  title={t('chat.stop')}
                  aria-label={t('chat.stop')}
                >
                  <HugeiconsIcon icon={StopCircleIcon} />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon-sm"
                  className="rounded-full"
                  onClick={onSend}
                  disabled={!canSend}
                  title={t('chat.send')}
                  aria-label={t('chat.send')}
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} />
                </Button>
              )}
            </div>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {showKeyboardHint && !isWelcome ? (
        <p
          className={cn(
            'flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1.5 text-xs text-muted-foreground',
            compact && 'text-[0.625rem]',
          )}
        >
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd>
            {t('many.composer_hint_send')}
          </span>
          <span className="inline-flex items-center gap-1">
            <KbdGroup>
              <Kbd>⇧</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>
            {t('many.composer_hint_newline')}
          </span>
          {!compact ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Kbd>/</Kbd>
                {t('many.composer_hint_skills')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>@</Kbd>
                {t('many.composer_hint_docs')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>#</Kbd>
                MCP
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      <ManySkillPicker
        open={slash.slashActive}
        anchorRect={slash.slashRect}
        panelRef={slash.slashDropdownRef}
        skills={slash.filteredSkills}
        selectedIdx={slash.slashSelectedIdx}
        onHover={slash.setSlashSelectedIdx}
        onPick={applySlashOneShot}
        activeStickySkillId={activeStickySkillId}
        currentSessionId={currentSessionId}
        onToggleSticky={handleSlashStickyToggle}
        onClose={() => slash.setSlashActive(false)}
      />

      <ManyMentionPicker
        open={mention.mentionActive}
        anchorRect={mention.mentionRect}
        panelRef={mention.mentionDropdownRef}
        resources={mention.mentionResources}
        selectedIdx={mention.mentionSelectedIdx}
        onHover={mention.setMentionSelectedIdx}
        onSelect={mention.selectMentionResource}
      />

      <ManyMcpPicker
        open={hash.hashActive}
        anchorRect={hash.hashRect}
        panelRef={hash.hashDropdownRef}
        servers={hash.filteredServers}
        selectedIdx={hash.hashSelectedIdx}
        onHover={hash.setHashSelectedIdx}
        onSelect={hash.insertHashServer}
      />
    </div>
  );
});

export default ManyComposer;
