'use client';

import { memo, useCallback, useMemo, useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowUp02Icon, File02Icon, PlusSignIcon, StopCircleIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { processAttachmentFile } from '@/lib/chat/processAttachmentFile';
import {
  composerFileAccept,
  useComposerMultimodalCapabilities,
} from '@/lib/chat/useComposerMultimodalCapabilities';
import { ChatComposerPlusMenu, type ChatComposerSkillsHandlers } from '@/components/chat/ChatComposerPlusMenu';
import { AgentChatPlusAgentSlot } from '@/components/agents/AgentChatPlusAgentSlot';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AI_COMPOSER_INPUT_HANDLER,
  AI_COMPOSER_TEXTAREA_CLASS,
  AIComposerAttachmentTray,
  AIComposerFrame,
  AIComposerPinnedResourceChip,
} from '@/components/chat/AIComposer';
import { useResourceMention } from '@/lib/chat/useResourceMention';
import { useSlashSkills, type SlashSkillItem } from '@/lib/chat/useSlashSkills';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { InlineModelSwitcher } from '@/components/chat/InlineModelSwitcher';
import { ChatSkillChip } from '@/components/chat/ChatSkillChip';
import { ComposerFloatingPicker } from '@/components/chat/ComposerFloatingPicker';
import { db } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { handleComposerImagePaste } from '@/lib/chat/composerPaste';
import type { PinnedResource } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

export interface AgentChatInputProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  onSend: () => void;
  onAbort: () => void;
  placeholder?: string;
  mcpServerIds: string[];
  disabledMcpIds: Set<string>;
  onToggleMcp: (id: string) => void;
  hasAgentFunctions?: boolean;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (items: ChatAttachment[]) => void;
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
  disabledMcpIds,
  onToggleMcp,
  hasAgentFunctions,
  attachments = [],
  onAttachmentsChange,
  pinnedResources = [],
  onAddPinnedResource,
  onRemovePinnedResource,
  pendingOneShotSkillId = null,
  onSetPendingOneShotSkill,
  activeStickySkillId = null,
  onSetActiveStickySkill,
}: AgentChatInputProps) {
  const { t } = useTranslation();
  const multimodalCaps = useComposerMultimodalCapabilities();
  const fileAccept = useMemo(() => composerFileAccept(multimodalCaps), [multimodalCaps]);
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

  const [showDropdown, setShowDropdown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabProjectId = useTabStore(
    (s) => s.tabs.find((tab) => tab.id === s.activeTabId)?.projectId,
  );
  const currentProjectId = useAppStore((s) => s.currentProject?.id);
  const mentionProjectId = activeTabProjectId ?? currentProjectId ?? 'default';

  const addPinned = onAddPinnedResource ?? (() => {});
  const mention = useResourceMention({
    input,
    setInput,
    inputRef,
    containerRef,
    onPinResource: addPinned,
    enabled: true,
    projectId: mentionProjectId,
  });

  const slash = useSlashSkills({
    input,
    setInput,
    inputRef,
    containerRef,
    enabled: true,
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
        const a = await processAttachmentFile(file);
        if (a) next.push(a);
      }
      onAttachmentsChange(next);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [attachments, multimodalCaps.supportsImage, multimodalCaps.supportsVideo, onAttachmentsChange, t],
  );

  const hasMcp = mcpServerIds.length > 0;

  const insertAtSymbol = useCallback(() => {
    mention.insertAtSymbol();
  }, [mention]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const slashRes = slash.handleSlashKeyDown(e);
      if (slashRes.handled) {
        if (slashRes.skill) applySlashOneShot(slashRes.skill);
        return;
      }
      if (mention.mentionKeyDown(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() || attachments.length > 0) onSend();
      }
    },
    [slash, mention, applySlashOneShot, onSend, input, attachments.length],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);
      const cursor = e.target.selectionStart ?? val.length;
      mention.updateFromText(val, cursor);
      slash.updateFromText(val, cursor);
    },
    [setInput, mention, slash],
  );

  const handleInput = AI_COMPOSER_INPUT_HANDLER;

  const hasActiveAgentTools = hasMcp && mcpServerIds.some((id) => !disabledMcpIds.has(id));

  const menuLayout = 'nested';

  const skillsHandlers: ChatComposerSkillsHandlers | null =
    onSetPendingOneShotSkill && onSetActiveStickySkill
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
    <div className="many-input-area shrink-0 border-t border-border bg-background px-4 py-3">
      {(pinnedResources.length > 0 || pendingOneShotSkillId || activeStickySkillId) ? (
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
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          aria-label={placeholder ?? t('chat.message_placeholder')}
          onPaste={(e) => {
            if (!onAttachmentsChange) return;
            void handleComposerImagePaste(e, {
              supportsImage: multimodalCaps.supportsImage,
              onUnsupported: () => showToast('info', t('chat.paste_image_unsupported')),
              onFiles: (files) => { void handlePickFiles(files); },
            });
          }}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className={`${AI_COMPOSER_TEXTAREA_CLASS} min-h-12 max-h-[200px] shadow-none`}
        />

        <div className="flex min-w-0 items-center justify-between gap-2 px-3 pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <ChatComposerPlusMenu
              open={showDropdown}
              onOpenChange={setShowDropdown}
              trigger={
                <Button
                  type="button"
                  variant={showDropdown || hasActiveAgentTools ? 'secondary' : 'ghost'}
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
              manyCapabilities={null}
              hideToolsSectionHeader
              menuLayout={menuLayout}
              skillsHandlers={skillsHandlers}
              onCloseMenu={() => setShowDropdown(false)}
              toolsSlot={
                hasAgentFunctions ? (
                  <AgentChatPlusAgentSlot
                    mcpServerIds={mcpServerIds}
                    disabledMcpIds={disabledMcpIds}
                    onToggleMcp={onToggleMcp}
                    hasMcp={hasMcp}
                  />
                ) : null
              }
              disableQuick={isLoading}
            />
            <InlineModelSwitcher />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isLoading ? (
              <Button
                type="button"
                onClick={onAbort}
                variant="destructive"
                size="icon"
                className="rounded-full"
                title={t('chat.stop')}
                aria-label={t('chat.stop')}
              >
                <HugeiconsIcon icon={StopCircleIcon} />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={onSend}
                disabled={!input.trim() && attachments.length === 0}
                size="icon"
                className="rounded-full"
                title={t('chat.send')}
                aria-label={t('chat.send')}
              >
                <HugeiconsIcon icon={ArrowUp02Icon} />
              </Button>
            )}
          </div>
        </div>
      </AIComposerFrame>

      <ComposerFloatingPicker
        open={slash.slashActive}
        anchorRect={slash.slashRect}
        panelRef={slash.slashDropdownRef}
        className="rounded-xl py-1"
      >
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('chat.slash_skills_title')}
          </div>
          {slash.filteredSkills.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-muted-foreground">{t('common.no_results')}</div>
          ) : (
            slash.filteredSkills.map((skill, idx) => (
              <div
                key={skill.id}
                className={cn('border-b border-border last:border-0', idx === slash.slashSelectedIdx && 'bg-accent')}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[13px] text-foreground"
                  onMouseEnter={() => slash.setSlashSelectedIdx(idx)}
                  onClick={() => applySlashOneShot(skill)}
                >
                  <span className="font-medium">{skill.name}</span>
                  {skill.description ? (
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">{skill.description}</span>
                  ) : null}
                </Button>
                <div className="flex flex-wrap gap-2 px-3 pb-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Checkbox
                      checked={activeStickySkillId === skill.id}
                      onCheckedChange={() => {
                        const next = activeStickySkillId === skill.id ? null : skill.id;
                        onSetActiveStickySkill?.(next);
                        const cursor = inputRef.current?.selectionStart ?? input.length;
                        slash.removeSlashTokenFromInput(cursor);
                        slash.setSlashActive(false);
                      }}
                    />
                    {t('chat.slash_keep_active')}
                  </label>
                </div>
              </div>
            ))
          )}
      </ComposerFloatingPicker>

      <ComposerFloatingPicker
        open={mention.mentionActive}
        anchorRect={mention.mentionRect}
        panelRef={mention.mentionDropdownRef}
        width={280}
        maxHeight={240}
        className="rounded-xl py-1"
      >
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('many.add_to_context')}
          </div>
          {mention.mentionResources.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-muted-foreground">{t('common.no_results')}</div>
          ) : (
            mention.mentionResources.map((resource, idx) => (
              <Button
                key={resource.id}
                type="button"
                variant="ghost"
                onClick={() => mention.selectMentionResource(resource)}
                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]', idx === mention.mentionSelectedIdx && 'bg-accent')}
              >
                <HugeiconsIcon icon={File02Icon} className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{resource.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{resource.type}</span>
              </Button>
            ))
          )}
      </ComposerFloatingPicker>
    </div>
  );
});
