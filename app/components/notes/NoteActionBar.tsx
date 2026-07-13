import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronRightIcon,
  EyeIcon,
  InformationCircleIcon,
  Maximize02Icon,
  Comment01Icon,
  MoreHorizontalIcon,
  PanelRightIcon,
  BookOpen01Icon,
  Share08Icon,
  SplitIcon,
} from '@hugeicons/core-free-icons';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NoteSavePill, { type NoteSavePillState } from '@/components/notes/NoteSavePill';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';

export type NoteViewMode = 'standard' | 'focused';

export interface ActionBarCrumbSegment {
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  /** Segmento actual (nota) — no navegable. */
  current?: boolean;
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
  /** Sin projectId no hay recursos que elegir para split. */
  canOpenSplit?: boolean;
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

export default function NoteActionBar({
  crumbs,
  saveState,
  lastSavedAt,
  onSave,
  viewMode,
  onViewModeChange,
  onOpenSplit,
  canOpenSplit = true,
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
      <nav className="note-crumbs no-drag" aria-label={t('folder.breadcrumb', 'Ruta')}>
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 ? (
              <HugeiconsIcon icon={ChevronRightIcon} size={12} strokeWidth={2} className="note-crumb-sep" aria-hidden />
            ) : null}
            {c.current ? (
              <span
                className="note-crumb note-crumb--current"
                title={c.label}
                aria-current="page"
              >
                {c.icon ? (
                  <span className="note-crumb-icon" aria-hidden>
                    {c.icon}
                  </span>
                ) : null}
                <span className="note-crumb-text">{c.label}</span>
              </span>
            ) : c.onClick ? (
              <button
                type="button"
                className="note-crumb note-crumb--interactive"
                title={c.label}
                onClick={c.onClick}
              >
                {c.icon ? (
                  <span className="note-crumb-icon" aria-hidden>
                    {c.icon}
                  </span>
                ) : null}
                <span className="note-crumb-text">{c.label}</span>
              </button>
            ) : (
              <span className="note-crumb" title={c.label}>
                {c.icon ? (
                  <span className="note-crumb-icon" aria-hidden>
                    {c.icon}
                  </span>
                ) : null}
                <span className="note-crumb-text">{c.label}</span>
              </span>
            )}
          </Fragment>
        ))}
      </nav>

      <NoteSavePill state={saveState} lastSavedAt={lastSavedAt} onClickSave={onSave} />

      <span className="note-actionbar-sep" aria-hidden />

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={t('notes.toolbar_backlinks')}
        aria-label={t('notes.toolbar_backlinks')}
        onClick={() => onOpenBacklinksPanel?.()}
      >
        <HugeiconsIcon icon={Comment01Icon} size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={t('notes.metadata')}
        aria-label={t('notes.metadata')}
        onClick={() => onOpenMetadata()}
      >
        <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={t('notes.share_copy_tooltip')}
        aria-label={t('notes.share_copy_tooltip')}
        disabled={!domeLinkToCopy}
        onClick={handleCopyShareLink}
      >
        <HugeiconsIcon icon={Share08Icon} size={14} strokeWidth={2} />
      </button>

      <span className="note-actionbar-sep" aria-hidden />

      {!hideWindowControls ? (
        <button
          type="button"
          className="note-icon-btn note-icon-btn-sm no-drag"
          title={t('focused_editor.open_reference')}
          aria-label={t('focused_editor.open_reference')}
          disabled={!canOpenSplit}
          onClick={onOpenSplit}
        >
          <HugeiconsIcon icon={SplitIcon} size={14} strokeWidth={2} />
        </button>
      ) : null}

      <button
        type="button"
        className={`note-icon-btn note-icon-btn-sm no-drag${viewMode === 'focused' ? ' active' : ''}`}
        title={t('notes.mode_focused_tooltip')}
        aria-pressed={viewMode === 'focused'}
        onClick={() => onViewModeChange(viewMode === 'focused' ? 'standard' : 'focused')}
      >
        <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={sourcesOpen ? t('notes.hide_sources_panel') : t('notes.show_sources_panel')}
        aria-label={sourcesOpen ? t('notes.hide_sources_panel') : t('notes.show_sources_panel')}
        aria-pressed={sourcesOpen}
        style={
          sourcesOpen ? { color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)' } : undefined
        }
        onClick={() => toggleSources()}
      >
        <HugeiconsIcon icon={PanelRightIcon} size={14} strokeWidth={2} />
      </button>

      {!hideWindowControls ? (
        <button
          type="button"
          className="note-icon-btn note-icon-btn-sm no-drag"
          title={t('notes.popout_tooltip')}
          aria-label={t('notes.popout_tooltip')}
          onClick={onOpenPopout}
        >
          <HugeiconsIcon icon={Maximize02Icon} size={14} strokeWidth={2} />
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
        <HugeiconsIcon icon={BookOpen01Icon} size={14} strokeWidth={2} />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="note-icon-btn note-icon-btn-sm no-drag"
              aria-label={t('notes.more_actions')}
              title={t('notes.more_actions')}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="min-w-[220px]">
          <DropdownMenuItem onClick={() => onOpenMetadata()}>
            <HugeiconsIcon icon={InformationCircleIcon} size={14} />
            {t('notes.metadata')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleSources()}>
            {sourcesOpen ? t('notes.hide_sources_panel') : t('notes.show_sources_panel')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggleSidePanel()}>
            {sidePanelOpen ? t('notes.hide_insights_panel') : t('notes.show_insights_panel')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}