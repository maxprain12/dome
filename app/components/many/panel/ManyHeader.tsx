import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BubbleChatIcon,
  Cancel01Icon,
  Delete02Icon,
  ExternalLinkIcon,
  HistoryIcon,
  InformationCircleIcon,
  Maximize02Icon,
  Minimize02Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ManyAvatar, { type ManyAvatarState } from '@/components/many/ManyAvatar';
import type { ManyStatus } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

export type ManyPanelViewId = 'chat' | 'history' | 'context';

interface ManyHeaderProps {
  status: ManyStatus;
  sessionTitle?: string;
  contextDescription: string;
  loadingHint?: string;
  /** Sidebar mode: chat / history / context switcher. Hidden in fullscreen. */
  view: ManyPanelViewId;
  onViewChange: (view: ManyPanelViewId) => void;
  showViewSwitcher: boolean;
  /** Fullscreen mode: inline history column toggle. */
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  showHistoryToggle?: boolean;
  onStartNewChat: () => void;
  onClear: () => void;
  canClear: boolean;
  onClose: () => void;
  showClose?: boolean;
  isPopout?: boolean;
  showFullscreenToggle?: boolean;
  isFullscreenActive?: boolean;
  onToggleFullscreen?: () => void;
  showPopoutToggle?: boolean;
  onPopout?: () => void;
}

type Translator = (key: string) => string;

// ── Pure helpers (kept outside the component so they don't add to its complexity) ──

/** Whether the runtime is macOS / Windows / Linux (renderer-side hint from preload). */
function pickPlatformFlags(): { isMac: boolean; needsRightChromeInset: boolean } {
  if (typeof window === 'undefined') {
    return { isMac: false, needsRightChromeInset: false };
  }
  const isMac = Boolean(window.electron?.isMac ?? window.electron?.platform === 'darwin');
  const needsRightChromeInset = Boolean(window.electron?.isWindows || window.electron?.isLinux);
  return { isMac, needsRightChromeInset };
}

/** Map runtime status → avatar halo state. */
function pickAvatarState(status: ManyStatus): ManyAvatarState {
  if (status === 'speaking') return 'speaking';
  if (status === 'thinking') return 'thinking';
  return 'idle';
}

/**
 * "Thinking" is transcript state and is shown there, next to the message being
 * produced. Repeating it in the header (and again in a panel bar) meant the
 * same word appeared three times at once. The animated avatar carries the
 * status here without adding a third copy of the label.
 */
function pickStatusLabel(status: ManyStatus, t: Translator): string | null {
  return status === 'speaking' ? t('many.speaking') : null;
}

/** Popout is a real OS window: keep brand "Many" as the title; session/context sit below. */
function pickTitleText(
  isPopout: boolean,
  hasSessionTitle: boolean,
  sessionTitle: string | undefined,
  t: Translator,
): string {
  if (isPopout) return t('many.many');
  if (hasSessionTitle) return sessionTitle ?? t('many.many');
  return t('many.many');
}

/**
 * Pick the secondary text under the title.
 * Popout: prefer session title (the chat name) when no live status hint.
 * Sidebar: prefer context description; loading hint wins while it lasts.
 */
function pickRawSubtitle(
  isPopout: boolean,
  loadingHint: string | undefined,
  statusLabel: string | null,
  hasSessionTitle: boolean,
  sessionTitle: string | undefined,
  contextDescription: string,
): string | null {
  if (loadingHint && !statusLabel) return loadingHint;
  if (!isPopout) return contextDescription || null;
  if (hasSessionTitle) return sessionTitle ?? null;
  return contextDescription || null;
}

/**
 * The context description often *is* the session title (a chat named after
 * the first message). Echoing it under the title is noise, not information.
 */
function pickSubtitleText(rawSubtitle: string | null, titleText: string): string | null {
  if (!rawSubtitle) return null;
  return rawSubtitle.trim() === titleText.trim() ? null : rawSubtitle;
}

function pickFullscreenLabel(isFullscreenActive: boolean, t: Translator): string {
  return isFullscreenActive ? t('many.exit_fullscreen') : t('many.fullscreen');
}

/** Native traffic lights / titleBarOverlay already close the popout window. */
function pickShowCloseButton(showClose: boolean, isPopout: boolean): boolean {
  return showClose && !isPopout;
}

function buildHeaderClassName(
  isPopout: boolean,
  isMac: boolean,
  needsRightChromeInset: boolean,
): string {
  const base = '@container/header flex shrink-0 items-center gap-2.5 border-b';
  if (!isPopout) return cn(base, 'px-3 py-2');
  // Match shell TitleBar: fixed height + traffic-light / overlay insets.
  return cn(
    base,
    'drag-region h-11 gap-2 border-border/60 px-3',
    isMac && 'pl-20',
    needsRightChromeInset && 'pr-[140px]',
  );
}

// ── JSX sections (rendered as plain functions, not components, to stay cheap) ──

function renderAvatar(isPopout: boolean, avatarState: ManyAvatarState) {
  return (
    <>
      <ManyAvatar
        size={isPopout ? 'sm' : 'md'}
        state={avatarState}
        className={cn(isPopout ? 'inline-flex' : 'hidden @[380px]/header:inline-flex')}
      />
      {!isPopout ? (
        <ManyAvatar size="sm" state={avatarState} className="inline-flex @[380px]/header:hidden" />
      ) : null}
    </>
  );
}

function renderTitleBlock(
  titleText: string,
  statusLabel: string | null,
  subtitleText: string | null,
  isPopout: boolean,
) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            'truncate font-semibold tracking-tight',
            isPopout ? 'text-[13px]' : 'text-sm',
          )}
        >
          {titleText}
        </span>
        {statusLabel ? (
          <Badge variant="secondary" className="shrink truncate rounded-full font-normal">
            {statusLabel}
          </Badge>
        ) : null}
      </div>
      {subtitleText ? (
        <span className="truncate text-[11px] text-muted-foreground">{subtitleText}</span>
      ) : null}
    </div>
  );
}

function renderViewSwitcher(
  showViewSwitcher: boolean,
  view: ManyPanelViewId,
  onViewChange: (view: ManyPanelViewId) => void,
  t: Translator,
) {
  if (!showViewSwitcher) return null;
  return (
    <Tabs
      value={view}
      onValueChange={(value) => onViewChange(value as ManyPanelViewId)}
    >
      <TabsList>
        <TabsTrigger value="chat" title={t('chat.messages')} aria-label={t('chat.messages')}>
          <HugeiconsIcon icon={BubbleChatIcon} />
        </TabsTrigger>
        <TabsTrigger value="history" title={t('many.history')} aria-label={t('many.history')}>
          <HugeiconsIcon icon={HistoryIcon} />
        </TabsTrigger>
        <TabsTrigger
          value="context"
          title={t('many.context_title')}
          aria-label={t('many.context_title')}
        >
          <HugeiconsIcon icon={InformationCircleIcon} />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function renderHistoryToggle(
  showHistoryToggle: boolean,
  onToggleHistory: (() => void) | undefined,
  historyOpen: boolean,
  t: Translator,
) {
  if (!showHistoryToggle || !onToggleHistory) return null;
  return (
    <Button
      type="button"
      variant={historyOpen ? 'secondary' : 'ghost'}
      size="icon-sm"
      onClick={onToggleHistory}
      aria-label={t('many.toggle_history')}
      title={t('many.toggle_history')}
    >
      <HugeiconsIcon icon={HistoryIcon} />
    </Button>
  );
}

function renderNewChatButton(onStartNewChat: () => void, t: Translator) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onStartNewChat}
      aria-label={t('many.newChat')}
      title={t('many.newChat')}
    >
      <HugeiconsIcon icon={PlusSignIcon} />
    </Button>
  );
}

function renderOverflowMenu(
  showFullscreenToggle: boolean,
  onToggleFullscreen: (() => void) | undefined,
  showPopoutToggle: boolean,
  onPopout: (() => void) | undefined,
  isFullscreenActive: boolean,
  fullscreenLabel: string,
  canClear: boolean,
  onClear: () => void,
  t: Translator,
) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('many.more_actions')}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="min-w-52">
        <DropdownMenuGroup>
          {showFullscreenToggle && onToggleFullscreen ? (
            <DropdownMenuItem onClick={onToggleFullscreen}>
              <HugeiconsIcon icon={isFullscreenActive ? Minimize02Icon : Maximize02Icon} />
              {fullscreenLabel}
            </DropdownMenuItem>
          ) : null}
          {showPopoutToggle && onPopout ? (
            <DropdownMenuItem onClick={onPopout}>
              <HugeiconsIcon icon={ExternalLinkIcon} />
              {t('many.open_popout')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {canClear ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onClear}>
                <HugeiconsIcon icon={Delete02Icon} />
                {t('many.clear_chat')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function renderCloseButton(showCloseButton: boolean, onClose: () => void, t: Translator) {
  if (!showCloseButton) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClose}
      aria-label={t('many.close_chat_aria')}
      title={t('many.close_chat_aria')}
    >
      <HugeiconsIcon icon={Cancel01Icon} />
    </Button>
  );
}

/**
 * Panel header: the Many identity (avatar halo = run state) plus the view
 * switcher and window actions. One row; secondary actions collapse into the
 * overflow menu on narrow widths.
 */
export default memo(function ManyHeader({
  status,
  sessionTitle,
  contextDescription,
  loadingHint,
  view,
  onViewChange,
  showViewSwitcher,
  historyOpen = false,
  onToggleHistory,
  showHistoryToggle = false,
  onStartNewChat,
  onClear,
  canClear,
  onClose,
  showClose = true,
  isPopout = false,
  showFullscreenToggle = false,
  isFullscreenActive = false,
  onToggleFullscreen,
  showPopoutToggle = false,
  onPopout,
}: ManyHeaderProps) {
  const { t } = useTranslation();

  const { isMac, needsRightChromeInset } = pickPlatformFlags();
  const avatarState = pickAvatarState(status);
  const statusLabel = pickStatusLabel(status, t);
  const hasSessionTitle = Boolean(sessionTitle && sessionTitle !== 'New chat');
  const titleText = pickTitleText(isPopout, hasSessionTitle, sessionTitle, t);
  const rawSubtitle = pickRawSubtitle(
    isPopout,
    loadingHint,
    statusLabel,
    hasSessionTitle,
    sessionTitle,
    contextDescription,
  );
  const subtitleText = pickSubtitleText(rawSubtitle, titleText);
  const fullscreenLabel = pickFullscreenLabel(isFullscreenActive, t);
  const showCloseButton = pickShowCloseButton(showClose, isPopout);
  const headerClassName = buildHeaderClassName(isPopout, isMac, needsRightChromeInset);

  return (
    <header data-status={status} className={headerClassName}>
      {renderAvatar(isPopout, avatarState)}
      {renderTitleBlock(titleText, statusLabel, subtitleText, isPopout)}
      <div className="no-drag flex shrink-0 items-center gap-0.5">
        {renderViewSwitcher(showViewSwitcher, view, onViewChange, t)}
        {renderHistoryToggle(showHistoryToggle, onToggleHistory, historyOpen, t)}
        {renderNewChatButton(onStartNewChat, t)}
        {renderOverflowMenu(
          showFullscreenToggle,
          onToggleFullscreen,
          showPopoutToggle,
          onPopout,
          isFullscreenActive,
          fullscreenLabel,
          canClear,
          onClear,
          t,
        )}
        {renderCloseButton(showCloseButton, onClose, t)}
      </div>
    </header>
  );
});
