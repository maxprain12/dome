import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  Eye,
  History,
  Info,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  BookOpen,
  Share2,
  Sparkles,
  SplitSquareHorizontal,
} from 'lucide-react';
import { Menu } from '@mantine/core';
import NoteSavePill, { type NoteSavePillState } from '@/components/notes/NoteSavePill';
import { useAppStore } from '@/lib/store/useAppStore';
import { HOME_TAB_ID, useTabStore } from '@/lib/store/useTabStore';
import { showToast } from '@/lib/store/useToastStore';

export type NoteViewMode = 'standard' | 'focused';

export interface ActionBarCrumbSegment {
  icon?: React.ReactNode;
  label: string;
  /** Ocultar label en muy estrecho; el icono queda como PWA. */
  iconOnlyBreakpoint?: boolean;
}

interface NoteActionBarProps {
  /** Nave trail: Workspace + carpeta/proyecto. */
  crumbs: ActionBarCrumbSegment[];
  saveState: NoteSavePillState;
  lastSavedAt: number | null;
  onSave: () => void;
  viewMode: NoteViewMode;
  onViewModeChange: (m: NoteViewMode) => void;
  onOpenSplit: () => void;
  onOpenPopout: () => void;
  onOpenMetadata: () => void;
  /** enlaces dome://… para pegar/compartir (notas: resource id) */
  domeLinkToCopy?: string | null;
  /** Abrir panel lateral en pestaña “backlinks”. */
  onOpenBacklinksPanel?: () => void;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  hideWindowControls?: boolean;
}

function goHome() {
  useTabStore.getState().activateTab(HOME_TAB_ID);
}

function openManySidebar() {
  window.dispatchEvent(new CustomEvent('dome:many-sidebar-open'));
}

export default function NoteActionBar({
  crumbs,
  saveState,
  lastSavedAt,
  onSave,
  viewMode,
  onViewModeChange,
  onOpenSplit,
  onOpenPopout,
  onOpenMetadata,
  domeLinkToCopy,
  onOpenBacklinksPanel,
  sidePanelOpen,
  onToggleSidePanel,
  hideWindowControls,
}: NoteActionBarProps) {
  const { t } = useTranslation();
  const sourcesOpen = useAppStore((s) => s.sourcesPanelOpen);
  const toggleSources = useAppStore((s) => s.toggleSourcesPanel);
  const isMac =
    typeof window !== 'undefined' && Boolean(window.electron?.isMac ?? window.electron?.platform === 'darwin');
  const isWin = typeof window !== 'undefined' && Boolean(window.electron?.isWindows);
  const isLinux = typeof window !== 'undefined' && Boolean(window.electron?.isLinux);
  /** Win: titleBarOverlay; Linux (frameless): WindowControls dibujados a la derecha en AppShell — mismo hueco para popout */
  const needsRightChromeInset = isWin || isLinux;

  const handleCopyShareLink = () => {
    if (!domeLinkToCopy) return;
    void navigator.clipboard.writeText(domeLinkToCopy).then(
      () => {
        showToast('success', t('notes.share_link_copied'));
      },
      () => {
        showToast('error', t('notes.share_link_copy_failed'));
      },
    );
  };

  return (
    <div
      className={[
        'note-actionbar drag-region',
        hideWindowControls ? 'note-actionbar--standalone' : '',
        hideWindowControls && isMac ? 'nav-mac' : '',
        hideWindowControls && needsRightChromeInset ? 'win-titlebar-padding' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="note-crumbs">
        <span className="note-crumb-sep note-crumb-sep-lead" aria-hidden>
          <ChevronRight size={11} strokeWidth={2} />
        </span>
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1 min-w-0">
            {i > 0 ? (
              <span className="note-crumb-sep" aria-hidden>
                <ChevronRight size={11} strokeWidth={2} />
              </span>
            ) : null}
            {i === 0 ? (
              <button
                type="button"
                className="note-crumb truncate note-crumb--interactive"
                title={c.label}
                onClick={goHome}
              >
                <span className="note-crumb-icon" aria-hidden>
                  {c.icon}
                </span>
                <span className={c.iconOnlyBreakpoint ? 'note-crumb-text sm:inline' : 'note-crumb-text'}>
                  {c.label}
                </span>
              </button>
            ) : (
              <span className="note-crumb truncate" title={c.label}>
                <span className="note-crumb-icon" aria-hidden>
                  {c.icon}
                </span>
                <span className={c.iconOnlyBreakpoint ? 'note-crumb-text sm:inline' : 'note-crumb-text'}>
                  {c.label}
                </span>
              </span>
            )}
          </span>
        ))}

      </div>

      <NoteSavePill state={saveState} lastSavedAt={lastSavedAt} onClickSave={onSave} />

      <span className="note-actionbar-sep" aria-hidden />

      <button
        type="button"
        className="note-ai-assist-btn no-drag"
        title={t('notes.open_many')}
        aria-label={t('notes.open_many')}
        onClick={openManySidebar}
      >
        <Sparkles size={13} strokeWidth={2} />
        <span>{t('notes.many')}</span>
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={t('notes.toolbar_backlinks')}
        aria-label={t('notes.toolbar_backlinks')}
        onClick={() => onOpenBacklinksPanel?.()}
      >
        <MessageSquare size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={t('notes.toolbar_timeline')}
        aria-label={t('notes.toolbar_timeline')}
        onClick={() => onOpenMetadata()}
      >
        <History size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={t('notes.share_copy_tooltip')}
        aria-label={t('notes.share_copy_tooltip')}
        disabled={!domeLinkToCopy}
        onClick={handleCopyShareLink}
      >
        <Share2 size={14} strokeWidth={2} />
      </button>

      <span className="note-actionbar-sep" aria-hidden />

      {!hideWindowControls ? (
        <button
          type="button"
          className="note-icon-btn note-icon-btn-sm no-drag"
          title={t('focused_editor.open_reference')}
          aria-label={t('focused_editor.open_reference')}
          onClick={onOpenSplit}
        >
          <SplitSquareHorizontal size={14} strokeWidth={2} />
        </button>
      ) : null}

      <button
        type="button"
        className={`note-icon-btn note-icon-btn-sm no-drag${viewMode === 'focused' ? ' active' : ''}`}
        title={t('notes.mode_focused_tooltip')}
        aria-pressed={viewMode === 'focused'}
        onClick={() => onViewModeChange(viewMode === 'focused' ? 'standard' : 'focused')}
      >
        <Eye size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={t('focused_editor.toolbar_hint')}
        aria-label={t('focused_editor.toolbar_hint')}
        aria-pressed={sourcesOpen}
        style={
          sourcesOpen ? { color: 'var(--dome-accent)', background: 'var(--dome-accent-bg)' } : undefined
        }
        onClick={() => toggleSources()}
      >
        <PanelRight size={14} strokeWidth={2} />
      </button>

      {!hideWindowControls ? (
        <button
          type="button"
          className="note-icon-btn note-icon-btn-sm no-drag"
          title={t('notes.popout_tooltip')}
          aria-label={t('notes.popout_tooltip')}
          onClick={onOpenPopout}
        >
          <Maximize2 size={14} strokeWidth={2} />
        </button>
      ) : null}

      <button
        type="button"
        className={`note-icon-btn note-icon-btn-sm no-drag${sidePanelOpen ? ' active' : ''}`}
        title={t('notes.side_insights')}
        aria-label={t('notes.side_insights')}
        aria-pressed={sidePanelOpen}
        onClick={onToggleSidePanel}
      >
        <BookOpen size={14} strokeWidth={2} />
      </button>

      <Menu shadow="md" width={220} position="bottom-end">
        <Menu.Target>
          <button
            type="button"
            className="note-icon-btn note-icon-btn-sm no-drag"
            aria-label={t('notes.more_actions')}
            title={t('notes.more_actions')}
          >
            <MoreHorizontal size={14} strokeWidth={2} />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Info size={14} />}
            onClick={() => {
              onOpenMetadata();
            }}
          >
            {t('notes.metadata')}
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              toggleSources();
            }}
          >
            {sourcesOpen ? t('notes.hide_sources_panel') : t('notes.show_sources_panel')}
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              onToggleSidePanel();
            }}
          >
            {sidePanelOpen ? t('notes.hide_insights_panel') : t('notes.show_insights_panel')}
          </Menu.Item>
          <Menu.Divider />
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}