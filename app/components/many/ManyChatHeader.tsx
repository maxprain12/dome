import { memo, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, CheckIcon, Clock01Icon, ExternalLinkIcon, Maximize02Icon, Minimize02Icon, MoreHorizontalIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import ManyAvatar from './ManyAvatar';
import { sanitizeManySessionTitle } from '@/lib/store/manySessionStorage';
import { collectCompoundSlots, defineSlot } from '@/lib/utils/compoundSlots';

const ContextUsage = defineSlot('ManyChatHeader.ContextUsage');

interface ManyChatHeaderProps {
  status: string;
  providerInfo: string;
  providerId?: string;
  contextDescription: string;
  messagesCount: number;
  loadingHint?: string;
  sessionTitle?: string;
  historyOpen?: boolean;
  onClear: () => void;
  onStartNewChat: () => void;
  onToggleHistory: () => void;
  onClose: () => void;
  showClose?: boolean;
  showHistoryToggle?: boolean;
  isPopout?: boolean;
  showFullscreenToggle?: boolean;
  isFullscreenActive?: boolean;
  onToggleFullscreen?: () => void;
  showPopoutToggle?: boolean;
  onPopout?: () => void;
  children?: ReactNode;
}

const ManyChatHeader = memo(function ManyChatHeader({
  status,
  providerInfo: _providerInfo,
  providerId: _providerId,
  contextDescription,
  messagesCount: _messagesCount,
  onClear: _onClear,
  onStartNewChat,
  onToggleHistory,
  onClose,
  loadingHint,
  sessionTitle,
  historyOpen = false,
  showClose = true,
  showHistoryToggle = true,
  isPopout = false,
  showFullscreenToggle = false,
  isFullscreenActive = false,
  onToggleFullscreen,
  showPopoutToggle = false,
  onPopout,
  children,
}: ManyChatHeaderProps) {
  const { contextUsage } = collectCompoundSlots(children, {
    contextUsage: ContextUsage,
  });
  const { t } = useTranslation();

  const isThinking = status === 'thinking';
  const isSpeaking = status === 'speaking';
  const isMac =
    typeof window !== 'undefined' && Boolean(window.electron?.isMac ?? window.electron?.platform === 'darwin');
  const needsRightChromeInset =
    typeof window !== 'undefined' &&
    Boolean(window.electron?.isWindows || window.electron?.isLinux);

  const titleText =
    sessionTitle && sessionTitle !== 'New chat'
      ? sanitizeManySessionTitle(sessionTitle)
      : t('many.many');
  const statusBadgeLabel = isSpeaking
    ? t('many.speaking')
    : isThinking
      ? t('many.thinking')
      : null;
  const subtitleText = !isThinking && !isSpeaking ? loadingHint || null : null;
  const fullscreenLabel = isFullscreenActive ? t('many.exit_fullscreen') : t('many.fullscreen');

  return (
    <header
      className={cn(
        '@container/header flex shrink-0 items-center gap-3 border-b px-3 py-2.5',
        isPopout && 'drag-region',
        isPopout && isMac && 'nav-mac',
        isPopout && needsRightChromeInset && 'win-titlebar-padding',
      )}
      data-status={status}
    >
      <ManyAvatar size="md" state="idle" className="hidden shrink-0 @[420px]/header:inline-flex" />
      <ManyAvatar size="sm" state="idle" className="inline-flex shrink-0 @[420px]/header:hidden" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{titleText}</span>
          {statusBadgeLabel ? (
            <Badge variant="secondary" className="shrink truncate">
              {statusBadgeLabel}
            </Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {contextDescription ? (
            <Badge variant="outline" className="max-w-full truncate text-xs">
              {contextDescription}
            </Badge>
          ) : null}
          {subtitleText ? (
            <span className="truncate text-xs text-muted-foreground">{subtitleText}</span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 no-drag">
        {contextUsage}

        <div className="hidden items-center gap-0.5 @[420px]/header:flex">
          {showFullscreenToggle && onToggleFullscreen ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onToggleFullscreen} aria-label={fullscreenLabel}>
              <HugeiconsIcon icon={isFullscreenActive ? Minimize02Icon : Maximize02Icon} />
            </Button>
          ) : null}
          {showPopoutToggle && onPopout ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onPopout} aria-label={t('many.open_popout')}>
              <HugeiconsIcon icon={ExternalLinkIcon} />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" onClick={onStartNewChat} aria-label={t('many.newChat')}>
            <HugeiconsIcon icon={PlusSignIcon} />
          </Button>
          {showHistoryToggle ? (
            <Button
              type="button"
              variant={historyOpen ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={onToggleHistory}
              aria-label={t('many.toggle_history')}
            >
              <HugeiconsIcon icon={Clock01Icon} />
            </Button>
          ) : null}
        </div>

        <div className="@[420px]/header:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('many.more_actions')} />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="min-w-56">
              <DropdownMenuItem className="font-semibold" onClick={onStartNewChat}>
                <HugeiconsIcon icon={PlusSignIcon} />
                {t('many.newChat')}
              </DropdownMenuItem>
              {showHistoryToggle ? (
                <DropdownMenuItem onClick={onToggleHistory}>
                  <HugeiconsIcon icon={Clock01Icon} />
                  {t('many.toggle_history')}
                  {historyOpen ? <HugeiconsIcon icon={CheckIcon} className="ml-auto text-primary" /> : null}
                </DropdownMenuItem>
              ) : null}
              {(showFullscreenToggle && onToggleFullscreen) || (showPopoutToggle && onPopout) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{t('many.view_section')}</DropdownMenuLabel>
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
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showClose ? (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('many.close_chat_aria')}>
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
});

const ManyChatHeaderWithSlots = Object.assign(ManyChatHeader, { ContextUsage });

export default ManyChatHeaderWithSlots;
