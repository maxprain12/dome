
import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ArrowUp02Icon,
  PlusSignIcon,
  StopCircleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { ChatComposerPlusMenu } from '@/components/chat/ChatComposerPlusMenu';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { newAttachmentId } from '@/lib/chat/attachmentTypes';
import { processAttachmentFile } from '@/lib/chat/processAttachmentFile';
import {
  composerFileAccept,
  useComposerMultimodalCapabilities,
} from '@/lib/chat/useComposerMultimodalCapabilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import ManyComposerAttachments from '@/components/many/chat/ManyComposerAttachments';
import {
  ManyHashMcpPicker,
  ManyResourceMentionPicker,
  ManySlashSkillsPicker,
} from '@/components/many/chat/ManyComposerPickers';
import ManyComposerRichInput from '@/components/many/ManyComposerRichInput';
import { useResourceMention } from '@/lib/chat/useResourceMention';
import { useSlashSkills, type SlashSkillItem } from '@/lib/chat/useSlashSkills';
import { useHashMcpMention } from '@/lib/chat/useHashMcpMention';
import { useRotatingComposerPlaceholder } from '@/lib/chat/useRotatingComposerPlaceholder';
import type { ComposerTokenTooltip } from '@/lib/chat/composerInlineHighlight';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { listSkills, type SkillItem } from '@/lib/skills/client';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { InlineModelSwitcher } from '@/components/chat/InlineModelSwitcher';
import { useManyStore } from '@/lib/store/useManyStore';
import { db } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { handleComposerImagePaste } from '@/lib/chat/composerPaste';
import { collectCompoundSlots, defineSlot } from '@/lib/utils/compoundSlots';

const ContextUsage = defineSlot('ManyComposer.ContextUsage');

const MANY_PLACEHOLDER_HINT_KEYS = [
  'many.input_placeholder_docs',
  'many.input_placeholder_hint_skills',
  'many.input_placeholder_hint_plus',
  'many.input_placeholder_web',
  'many.input_placeholder_hint_attach',
] as const;

export interface ManyComposerProps {
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
  /** Show Enter / Shift+Enter hint under the composer (Many redesign). */
  showComposerKeyboardHint?: boolean;
  /** Sidebar / narrow panel: icon-only toolbar, capabilities in + menu. */
  compact?: boolean;
  children?: ReactNode;
}

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
  isWelcomeScreen = false,
  inputPlaceholderOverride = null,
  attachments = [],
  onAttachmentsChange,
  showComposerKeyboardHint = true,
  compact = false,
  children,
}: ManyComposerProps) {
  const { contextUsage } = collectCompoundSlots(children, {
    contextUsage: ContextUsage,
  });
  const { t } = useTranslation();
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

  const activeStickySkillId = currentSessionId ? activeSkillIdBySession[currentSessionId] ?? null : null;

  const [skillLabels, setSkillLabels] = useState<Record<string, string>>({});

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
    inputRef: inputRef as React.RefObject<HTMLTextAreaElement | null>,
    containerRef,
    enabled: true,
  });

  const hash = useHashMcpMention({
    input,
    setInput,
    inputRef: inputRef as React.RefObject<HTMLTextAreaElement | null>,
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
          prev.replace(new RegExp(`/${skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`, 'g'), ''),
        );
      }
      slash.setSlashActive(false);
    },
    [currentSessionId, setActiveSkillForSession, setInput, slash],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
      slash.updateFromText(val, cursor);
      hash.updateFromText(val, cursor);
      const pinnedMentions = new Set(
        pinnedResources.filter((pin) => val.includes(`@${pin.title}`)).map((pin) => pin.id),
      );
      for (const pin of pinnedResources) {
        if (!pinnedMentions.has(pin.id)) {
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


  return (
    <div className={cn('flex flex-col gap-2', !isWelcomeScreen && 'bg-background px-4 py-3')}>
      {!isWelcomeScreen ? <Separator /> : null}
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
      <InputGroup
        className={cn(
          'h-auto flex-col gap-0 rounded-2xl bg-background py-0 shadow-sm ring-1 ring-border',
          isDragging && 'border-primary/50 bg-muted/30',
          isWelcomeScreen && 'rounded-3xl shadow-md',
        )}
      >
        {onAttachmentsChange ? (
          <Input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={fileAccept}
            aria-label={t('chat.attach_files')}
            onChange={(e) => { void handlePickFiles(e.target.files); }}
          />
        ) : null}
        {onAttachmentsChange ? (
          <InputGroupAddon align="block-start" className="w-full p-0">
            <ManyComposerAttachments
              attachments={attachments}
              pinnedResources={pinnedResources}
              onRemoveAttachment={(id) => onAttachmentsChange(attachments.filter((a) => a.id !== id))}
              onRemovePinned={removePinnedResource}
            />
          </InputGroupAddon>
        ) : null}
        <div className={cn('w-full min-w-0 px-[18px] pb-1.5 pt-3', isWelcomeScreen && 'px-[22px] pb-2 pt-4')}>
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
            className={isWelcomeScreen ? 'min-h-18 max-h-[200px]' : 'min-h-6 max-h-[200px]'}
          />
        </div>

        <Separator />

        <InputGroupAddon align="block-end" className={cn('w-full gap-1 border-t px-2 py-1.5', compact && 'px-1.5')}>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <ChatComposerPlusMenu
              open={showDropdown}
              onOpenChange={setShowDropdown}
              trigger={
                <Button
                  type="button"
                  variant={showDropdown || hasActiveCapabilities ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  title={t('chat.compose_more')}
                  aria-label={t('chat.compose_more')}
                >
                  <HugeiconsIcon icon={PlusSignIcon} />
                </Button>
              }
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
              showSlashSkills
              onSlashSkills={() => {
                insertSlashToken();
                setShowDropdown(false);
              }}
              showHashMcp
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
              onCloseMenu={() => setShowDropdown(false)}
            />

            <span className="min-w-0 shrink">
              <InlineModelSwitcher />
            </span>

            {contextUsage ? (
              <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{contextUsage}</span>
            ) : null}

            {isLoading ? (
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                className="shrink-0 rounded-full"
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
                className="shrink-0 rounded-full"
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

      {showComposerKeyboardHint && !isWelcomeScreen ? (
        <p className={cn('px-1 text-[10.5px] text-muted-foreground', compact && 'text-[10px]')}>
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

      <ManySlashSkillsPicker
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

      <ManyResourceMentionPicker
        open={mention.mentionActive}
        anchorRect={mention.mentionRect}
        panelRef={mention.mentionDropdownRef}
        resources={mention.mentionResources}
        selectedIdx={mention.mentionSelectedIdx}
        onHover={mention.setMentionSelectedIdx}
        onSelect={mention.selectMentionResource}
      />

      <ManyHashMcpPicker
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

const ManyComposerWithSlots = Object.assign(ManyComposer, { ContextUsage });

export default ManyComposerWithSlots;
