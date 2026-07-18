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

  const avatarState: ManyAvatarState =
    status === 'speaking' ? 'speaking' : status === 'thinking' ? 'thinking' : 'idle';
  const statusLabel =
    status === 'speaking' ? t('many.speaking') : status === 'thinking' ? t('many.thinking') : null;

  const isMac =
    typeof window !== 'undefined' &&
    Boolean(window.electron?.isMac ?? window.electron?.platform === 'darwin');
  const needsRightChromeInset =
    typeof window !== 'undefined' &&
    Boolean(window.electron?.isWindows || window.electron?.isLinux);

  const hasSessionTitle = Boolean(sessionTitle && sessionTitle !== 'New chat');
  // Popout is a real OS window: keep brand "Many" as the title; session/context sit below.
  const titleText = isPopout
    ? t('many.many')
    : hasSessionTitle
      ? sessionTitle!
      : t('many.many');
  const subtitleText = isPopout
    ? loadingHint && !statusLabel
      ? loadingHint
      : hasSessionTitle
        ? sessionTitle!
        : contextDescription || null
    : loadingHint && !statusLabel
      ? loadingHint
      : contextDescription || null;
  const fullscreenLabel = isFullscreenActive ? t('many.exit_fullscreen') : t('many.fullscreen');
  // Native traffic lights / titleBarOverlay already close the window.
  const showCloseButton = showClose && !isPopout;

  return (
    <header
      data-status={status}
      className={cn(
        '@container/header flex shrink-0 items-center gap-2.5 border-b',
        isPopout
          ? cn(
              // Match shell TitleBar: fixed height + traffic-light / overlay insets.
              'drag-region h-11 gap-2 border-border/60 px-3',
              isMac && 'pl-20',
              needsRightChromeInset && 'pr-[140px]',
            )
          : 'px-3 py-2',
      )}
    >
      <ManyAvatar
        size={isPopout ? 'sm' : 'md'}
        state={avatarState}
        className={cn(
          isPopout ? 'inline-flex' : 'hidden @[380px]/header:inline-flex',
        )}
      />
      {!isPopout ? (
        <ManyAvatar size="sm" state={avatarState} className="inline-flex @[380px]/header:hidden" />
      ) : null}

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

      <div className="no-drag flex shrink-0 items-center gap-0.5">
        {showViewSwitcher ? (
          <Tabs
            value={view}
            onValueChange={(value) => onViewChange(value as ManyPanelViewId)}
          >
            <TabsList>
              <TabsTrigger
                value="chat"
                title={t('chat.messages')}
                aria-label={t('chat.messages')}
              >
                <HugeiconsIcon icon={BubbleChatIcon} />
              </TabsTrigger>
              <TabsTrigger
                value="history"
                title={t('many.history')}
                aria-label={t('many.history')}
              >
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
        ) : null}

        {showHistoryToggle && onToggleHistory ? (
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
        ) : null}

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

        {showCloseButton ? (
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
        ) : null}
      </div>
    </header>
  );
});
