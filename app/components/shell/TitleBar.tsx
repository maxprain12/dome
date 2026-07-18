import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CommandIcon, SidebarLeftIcon } from '@hugeicons/core-free-icons';

import ManyIcon from '@/components/many/ManyIcon';
import DomeTabBar from '@/components/shell/DomeTabBar';
import TranscriptionPill from '@/components/transcription/TranscriptionPill';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TitleBarProps {
  leftSidebarCollapsed: boolean;
  onToggleLeftSidebar: () => void;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  onNewChat?: () => void;
  /** Settings mode: hide Many toggle (panel is unavailable). */
  settingsMode?: boolean;
}

/**
 * Unified draggable window titlebar — the single place that reserves the
 * native traffic-light / window-controls safe zone. Height and inset never
 * change with sidebar state, so nothing the app renders can ever sit behind
 * OS-drawn window controls (unlike the previous grid-based header, which
 * shrank its left inset when the sidebar collapsed).
 */
export default function TitleBar({
  leftSidebarCollapsed,
  onToggleLeftSidebar,
  rightSidebarOpen,
  onToggleRightSidebar,
  onNewChat,
  settingsMode = false,
}: TitleBarProps) {
  const { t } = useTranslation();

  const isElectron = typeof window !== 'undefined' && Boolean(window.electron);
  const isMac = isElectron && Boolean(window.electron!.isMac);
  const isWindows = isElectron && Boolean(window.electron!.isWindows);
  const isLinux = isElectron && Boolean(window.electron!.isLinux);
  const needsRightInset = isWindows || isLinux;

  return (
    <header
      className={cn(
        // Shares the sidebar surface so the top-left corner + left rail read as
        // one continuous panel (no bottom border, no internal dividers).
        'flex h-11 shrink-0 items-stretch bg-sidebar',
        '[-webkit-app-region:drag]',
        // Reserve the macOS traffic-light zone (trafficLightPosition.x=18 + 3 controls + breathing room).
        isMac && 'pl-20',
      )}
      data-tour="titlebar"
    >
      <div className="flex shrink-0 items-center gap-0.5 px-1.5 [-webkit-app-region:no-drag]">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="[-webkit-app-region:no-drag]"
          onClick={onToggleLeftSidebar}
          title={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
          aria-label={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
        >
          <HugeiconsIcon icon={SidebarLeftIcon} />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <DomeTabBar onNewChat={onNewChat} />
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 px-1.5 [-webkit-app-region:no-drag]',
          needsRightInset && 'mr-[138px]',
        )}
      >
        {!settingsMode ? (
          <Button
            type="button"
            variant={rightSidebarOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="[-webkit-app-region:no-drag]"
            onClick={onToggleRightSidebar}
            title={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
            aria-label={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
            data-tour="many"
          >
            <span aria-hidden className="inline-flex [filter:var(--logo-filter)]">
              <ManyIcon size={14} />
            </span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="[-webkit-app-region:no-drag]"
          aria-label={t('search.command_palette', 'Command')}
          data-tour="search"
          onClick={() => window.dispatchEvent(new CustomEvent('dome:open-command-palette'))}
        >
          <HugeiconsIcon icon={CommandIcon} />
        </Button>
        <TranscriptionPill />
      </div>
    </header>
  );
}
