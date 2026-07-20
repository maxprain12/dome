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

/** Read an Electron desktop platform flag without nesting `typeof window` checks inline. */
function readElectronPlatformFlag(flag: 'isMac' | 'isWindows' | 'isLinux'): boolean {
  if (typeof window === 'undefined') return false;
  const e = window.electron;
  if (!e) return false;
  if (flag === 'isMac') return Boolean(e.isMac ?? e.platform === 'darwin');
  return Boolean(e[flag]);
}

/** Compose the outer action-bar class list given window-control + platform flags. */
function buildActionBarClass(
  hideWindowControls: boolean | undefined,
  isMac: boolean,
  needsRightChromeInset: boolean,
): string {
  const classes = ['note-actionbar drag-region'];
  if (hideWindowControls) classes.push('note-actionbar--standalone');
  if (hideWindowControls && isMac) classes.push('nav-mac');
  if (hideWindowControls && needsRightChromeInset) classes.push('win-titlebar-padding');
  return classes.join(' ');
}

/** Class name for toggle buttons that visualize their `active` state. */
function toggleIconClass(isActive: boolean): string {
  return `note-icon-btn note-icon-btn-sm no-drag${isActive ? ' active' : ''}`;
}

/** Inline style for the sources-panel toggle when the panel is open. */
function sourcesOpenStyle(open: boolean): React.CSSProperties | undefined {
  if (!open) return undefined;
  return {
    color: 'var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  };
}

/** Tooltip/aria label for the sources-panel toggle. */
function sourcesPanelLabel(open: boolean, t: (key: string) => string): string {
  return open ? t('notes.hide_sources_panel') : t('notes.show_sources_panel');
}

/** Dropdown label for the side-insights toggle. */
function insightsPanelLabel(open: boolean, t: (key: string) => string): string {
  return open ? t('notes.hide_insights_panel') : t('notes.show_insights_panel');
}

/** Optional icon slot rendered for a crumb segment. */
function CrumbIcon({ icon }: { icon?: React.ReactNode }) {
  if (!icon) return null;
  return (
    <span className="note-crumb-icon" aria-hidden>
      {icon}
    </span>
  );
}

/** Single breadcrumb segment (current / interactive / static). */
function CrumbItem({ crumb }: { crumb: ActionBarCrumbSegment }) {
  const icon = <CrumbIcon icon={crumb.icon} />;
  if (crumb.current) {
    return (
      <span className="note-crumb note-crumb--current" title={crumb.label} aria-current="page">
        {icon}
        <span className="note-crumb-text">{crumb.label}</span>
      </span>
    );
  }
  if (crumb.onClick) {
    return (
      <button
        type="button"
        className="note-crumb note-crumb--interactive"
        title={crumb.label}
        onClick={crumb.onClick}
      >
        {icon}
        <span className="note-crumb-text">{crumb.label}</span>
      </button>
    );
  }
  return (
    <span className="note-crumb" title={crumb.label}>
      {icon}
      <span className="note-crumb-text">{crumb.label}</span>
    </span>
  );
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
  const isMac = readElectronPlatformFlag('isMac');
  const isWin = readElectronPlatformFlag('isWindows');
  const isLinux = readElectronPlatformFlag('isLinux');
  /** Win: titleBarOverlay; Linux (frameless): WindowControls dibujados a la derecha en AppShell — mismo hueco para popout */
  const needsRightChromeInset = isWin || isLinux;
  const containerClass = buildActionBarClass(hideWindowControls, isMac, needsRightChromeInset);
  const sourcesLabel = sourcesPanelLabel(sourcesOpen, t);
  const insightsLabel = insightsPanelLabel(sidePanelOpen, t);

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

  const toggleViewMode = () =>
    onViewModeChange(viewMode === 'focused' ? 'standard' : 'focused');

  return (
    <div className={containerClass}>
      <nav className="note-crumbs no-drag" aria-label={t('folder.breadcrumb', 'Ruta')}>
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 ? <CrumbSeparator /> : null}
            <CrumbItem crumb={c} />
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
        className={toggleIconClass(viewMode === 'focused')}
        title={t('notes.mode_focused_tooltip')}
        aria-pressed={viewMode === 'focused'}
        onClick={toggleViewMode}
      >
        <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="note-icon-btn note-icon-btn-sm no-drag"
        title={sourcesLabel}
        aria-label={sourcesLabel}
        aria-pressed={sourcesOpen}
        style={sourcesOpenStyle(sourcesOpen)}
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
        className={toggleIconClass(sidePanelOpen)}
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
          <DropdownMenuItem onClick={() => toggleSources()}>{sourcesLabel}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggleSidePanel()}>{insightsLabel}</DropdownMenuItem>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Separator rendered between breadcrumb segments. */
function CrumbSeparator() {
  return (
    <HugeiconsIcon icon={ChevronRightIcon} size={12} strokeWidth={2} className="note-crumb-sep" aria-hidden />
  );
}