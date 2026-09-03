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
 * Window titlebar. The left rail cell uses `--chrome-rail-width` (same as the
 * sidebar) so the vertical hairline is one column. Traffic-light inset lives
 * inside that cell and does not shrink when the sidebar collapses.
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
      className="flex h-11 shrink-0 items-stretch border-b border-sidebar-border bg-sidebar [-webkit-app-region:drag]"
      data-tour="titlebar"
    >
      {/* Rail cell shares --chrome-rail-width with the sidebar so the hairline is one column. */}
      <div
        className={cn(
          'flex h-full shrink-0 items-center border-r border-sidebar-border pr-2',
          isMac ? 'pl-20' : 'pl-2',
          leftSidebarCollapsed ? undefined : 'w-(--chrome-rail-width) justify-end',
        )}
      >
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
          'flex h-full shrink-0 items-center gap-0.5 border-l border-sidebar-border px-2 [-webkit-app-region:no-drag]',
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
