import { memo, type ReactNode } from 'react';
import { X, Plus, Clock, Maximize2, Minimize2, ExternalLink, MoreHorizontal, Check } from 'lucide-react';
import { Menu } from '@mantine/core';
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
  /** When true (sidebar mode), shows the X close button */
  showClose?: boolean;
  /** Sidebar Many: overlay; fullscreen: columna derecha interna */
  showHistoryToggle?: boolean;
  /** Standalone popout window — drag region + safe insets for OS chrome */
  isPopout?: boolean;
  /** Show expand-to-tab / shrink-to-sidebar control */
  showFullscreenToggle?: boolean;
  isFullscreenActive?: boolean;
  onToggleFullscreen?: () => void;
  /** Show undock-to-separate-window control */
  showPopoutToggle?: boolean;
  onPopout?: () => void;
  children?: ReactNode;
}

type TranslateFn = ReturnType<typeof useTranslation>['t'];

interface HeaderPresentation {
  isThinking: boolean;
  isSpeaking: boolean;
  titleText: string;
  statusBadgeLabel: string | null;
  subtitleText: string | null;
  fullscreenLabel: string;
  headerClass: string;
}

function deriveHeaderPresentation(
  props: Pick<
    ManyChatHeaderProps,
    'status' | 'sessionTitle' | 'loadingHint' | 'isPopout' | 'isFullscreenActive'
  >,
  t: TranslateFn,
): HeaderPresentation {
  const { status, sessionTitle, loadingHint, isPopout, isFullscreenActive } = props;
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

  const headerClass = cn(
    'many-chat-header flex items-center gap-3 shrink-0 border-b',
    !isPopout && 'many-chat-header--docked',
    isPopout && 'many-chat-header--popout drag-region',
    isPopout && isMac && 'nav-mac',
    isPopout && needsRightChromeInset && 'win-titlebar-padding',
  );

  return { isThinking, isSpeaking, titleText, statusBadgeLabel, subtitleText, fullscreenLabel, headerClass };
}

function HeaderTitleBlock({
  p,
  isPopout,
  contextDescription,
}: {
  p: HeaderPresentation;
  isPopout: boolean;
  contextDescription: string;
}) {
  return (
    <div className="min-w-0 flex-1 flex flex-col" style={{ gap: 2 }}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn(
            'many-hd-title text-sm font-semibold leading-[1.3] overflow-hidden text-ellipsis whitespace-nowrap',
            isPopout ? 'text-[var(--dome-text)]' : 'text-[var(--primary-text)]',
          )}
        >
          {p.titleText}
        </span>
        {(p.isThinking || p.isSpeaking) && p.statusBadgeLabel ? (
          <span className="many-hd-status-badge text-xs text-[var(--accent)] font-medium px-2 py-px rounded-full bg-[var(--accent-bg)] leading-[1.6] shrink min-w-0 max-w-[140px] truncate">
            {p.statusBadgeLabel}
          </span>
        ) : null}
      </div>

      <div className="flex items-center flex-wrap min-w-0" style={{ gap: 5 }}>
        {/* Model selector intentionally NOT rendered here: it already lives in the
            composer/input pill, so showing it in the header too is redundant. */}
        {contextDescription ? (
          <span className="many-hd-chip many-hd-chip--accent many-hd-meta--extra">
            {contextDescription}
          </span>
        ) : null}
        {p.subtitleText ? (
          <span className="many-hd-meta--extra many-hd-subtitle">
            {p.subtitleText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface HeaderActionsProps {
  p: HeaderPresentation;
  historyOpen: boolean;
  showHistoryToggle: boolean;
  showFullscreenToggle: boolean;
  isFullscreenActive: boolean;
  onToggleFullscreen?: () => void;
  showPopoutToggle: boolean;
  onPopout?: () => void;
  onStartNewChat: () => void;
  onToggleHistory: () => void;
  t: TranslateFn;
}

function HeaderWideActions({
  p,
  historyOpen,
  showHistoryToggle,
  showFullscreenToggle,
  isFullscreenActive,
  onToggleFullscreen,
  showPopoutToggle,
  onPopout,
  onStartNewChat,
  onToggleHistory,
  t,
}: HeaderActionsProps) {
  return (
    <div className="many-hd-actions--wide flex items-center" style={{ gap: 2 }}>
      {showFullscreenToggle && onToggleFullscreen ? (
        <button
          type="button"
          className="many-icon-btn"
          onClick={onToggleFullscreen}
          title={p.fullscreenLabel}
          aria-label={p.fullscreenLabel}
        >
          {isFullscreenActive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      ) : null}
      {showPopoutToggle && onPopout ? (
        <button
          type="button"
          className="many-icon-btn"
          onClick={onPopout}
          title={t('many.open_popout')}
          aria-label={t('many.open_popout')}
        >
          <ExternalLink size={16} />
        </button>
      ) : null}
      <button
        type="button"
        className="many-icon-btn"
        onClick={onStartNewChat}
        title={t('many.newChat')}
        aria-label={t('many.newChat')}
      >
        <Plus size={16} />
      </button>
      {showHistoryToggle ? (
        <button
          type="button"
          className="many-icon-btn"
          onClick={onToggleHistory}
          title={t('many.toggle_history')}
          aria-label={t('many.toggle_history')}
          style={historyOpen ? { background: 'var(--bg-hover)', color: 'var(--accent)' } : undefined}
        >
          <Clock size={14} />
        </button>
      ) : null}
    </div>
  );
}

function HeaderCompactMenu({
  p,
  historyOpen,
  showHistoryToggle,
  showFullscreenToggle,
  isFullscreenActive,
  onToggleFullscreen,
  showPopoutToggle,
  onPopout,
  onStartNewChat,
  onToggleHistory,
  t,
}: HeaderActionsProps) {
  return (
    <div className="many-hd-actions--compact">
      <Menu shadow="md" width={236} position="bottom-end" radius="md">
        <Menu.Target>
          <button
            type="button"
            className="many-icon-btn"
            aria-label={t('many.more_actions')}
            title={t('many.more_actions')}
          >
            <MoreHorizontal size={16} strokeWidth={2} />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {/* Chat actions first — the primary, most-used ones */}
          <Menu.Item
            leftSection={<Plus size={15} />}
            onClick={onStartNewChat}
            fw={600}
          >
            {t('many.newChat')}
          </Menu.Item>
          {showHistoryToggle ? (
            <Menu.Item
              leftSection={<Clock size={15} />}
              onClick={onToggleHistory}
              rightSection={
                historyOpen ? <Check size={14} style={{ color: 'var(--accent)' }} /> : undefined
              }
              style={historyOpen ? { background: 'var(--accent-bg)', color: 'var(--accent)' } : undefined}
            >
              {t('many.toggle_history')}
            </Menu.Item>
          ) : null}

          {(showFullscreenToggle && onToggleFullscreen) || (showPopoutToggle && onPopout) ? (
            <>
              <Menu.Divider />
              <Menu.Label>{t('many.view_section')}</Menu.Label>
              {showFullscreenToggle && onToggleFullscreen ? (
                <Menu.Item
                  leftSection={isFullscreenActive ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  onClick={onToggleFullscreen}
                >
                  {p.fullscreenLabel}
                </Menu.Item>
              ) : null}
              {showPopoutToggle && onPopout ? (
                <Menu.Item leftSection={<ExternalLink size={15} />} onClick={onPopout}>
                  {t('many.open_popout')}
                </Menu.Item>
              ) : null}
            </>
          ) : null}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
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
  const p = deriveHeaderPresentation({ status, sessionTitle, loadingHint, isPopout, isFullscreenActive }, t);

  const actionsProps: HeaderActionsProps = {
    p,
    historyOpen,
    showHistoryToggle,
    showFullscreenToggle,
    isFullscreenActive,
    onToggleFullscreen,
    showPopoutToggle,
    onPopout,
    onStartNewChat,
    onToggleHistory,
    t,
  };

  return (
    <div className={p.headerClass} data-status={status}>
      <ManyAvatar size="md" state="idle" className="many-hd-avatar many-hd-avatar--wide shrink-0" />
      <ManyAvatar size="sm" state="idle" className="many-hd-avatar many-hd-avatar--compact shrink-0" />

      <HeaderTitleBlock p={p} isPopout={isPopout} contextDescription={contextDescription} />

      <div className="flex items-center shrink-0 no-drag many-hd-actions" style={{ gap: 2 }}>
        {contextUsage}

        <HeaderWideActions {...actionsProps} />

        <HeaderCompactMenu {...actionsProps} />

        {showClose ? (
          <>
            <div className="many-hd-close-sep" style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
            <button
              type="button"
              className="many-icon-btn"
              onClick={onClose}
              aria-label={t('many.close_chat_aria')}
            >
              <X size={16} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
});

const ManyChatHeaderWithSlots = Object.assign(ManyChatHeader, { ContextUsage });

export default ManyChatHeaderWithSlots;
