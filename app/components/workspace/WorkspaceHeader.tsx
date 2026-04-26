import { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import IndexStatusBadge from '@/components/viewers/shared/IndexStatusBadge';
import {
  Info,
  FileText,
  Video,
  Music,
  Image,
  FileEdit,
  Folder,
  Notebook,
  ExternalLink,
  FolderOpen,
  BookOpen,
  Sparkles,
  Network,
  PanelRight,
  PanelRightOpen,
  MoreHorizontal,
  FileDown,
  Presentation,
  Maximize2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import SplitResourcePicker from '@/components/workspace/SplitResourcePicker';
import { type Resource } from '@/types';

interface EditableTitle {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder?: string;
}

interface WorkspaceHeaderProps {
  resource: Resource;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onShowMetadata: () => void;
  editableTitle?: EditableTitle;
  savingIndicator?: React.ReactNode;
  subtitle?: string;
  onExportPdf?: () => void | Promise<void>;
  onExportDocx?: () => void | Promise<void>;
  onExport?: () => void;
  onPresentationMode?: () => void;
  onOpenWorkspacePanel?: () => void;
  notebookWorkspacePath?: string;
  notebookVenvPath?: string;
  /** Oculta fuentes / estudio / grafo para un encabezado más limpio en audio y vídeo */
  mediaFocusMode?: boolean;
}

// ── Type metadata ──────────────────────────────────────────────────────────
interface TypeMeta {
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
}

function getTypeMeta(type: string): TypeMeta {
  const base = { size: 13, strokeWidth: 2 };
  switch (type) {
    case 'note':     return { icon: <FileEdit {...base} />,   color: 'var(--dome-accent)',   bg: 'var(--dome-accent-bg)',  label: 'Nota' };
    case 'pdf':      return { icon: <FileText {...base} />,   color: 'var(--dome-error, #e85c4a)',              bg: 'rgba(232,92,74,0.1)',    label: 'PDF' };
    case 'video':    return { icon: <Video {...base} />,      color: 'var(--accent, #7c6fcd)',              bg: 'rgba(124,111,205,0.1)',  label: 'Video' };
    case 'audio':    return { icon: <Music {...base} />,      color: 'var(--secondary, #9b6fcd)',           bg: 'rgba(155,111,205,0.1)', label: 'Audio' };
    case 'image':    return { icon: <Image {...base} />,       color: 'var(--success, #3ba68d)',            bg: 'rgba(59,166,141,0.1)',   label: 'Imagen' };
    case 'notebook': return { icon: <Notebook {...base} />,   color: 'var(--accent)',                            bg: 'rgba(74,144,217,0.1)',   label: 'Notebook' };
    case 'ppt':      return { icon: <Presentation {...base}/>, color: 'var(--warning, #e8924a)',          bg: 'rgba(232,146,74,0.1)',   label: 'Presentación' };
    case 'url':      return { icon: <ExternalLink {...base} />, color: 'var(--accent)',                         bg: 'rgba(74,144,217,0.1)',   label: 'URL' };
    case 'excel':    return { icon: <FileText {...base} />,   color: 'var(--success)',                            bg: 'rgba(59,166,104,0.1)',   label: 'Excel' };
    default:         return { icon: <Folder {...base} />,     color: 'var(--dome-text-muted)', bg: 'var(--dome-bg-hover)', label: 'Recurso' };
  }
}

// ── Small icon button ──────────────────────────────────────────────────────
function HeaderIconBtn({
  icon,
  label,
  active = false,
  activeColor,
  onClick,
  forwardRef,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  activeColor?: string;
  onClick: () => void;
  forwardRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={forwardRef}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        transition: 'all 120ms ease-in-out',
        background: active ? (activeColor ? `${activeColor}18` : 'var(--dome-accent-bg)') : 'transparent',
        color: active ? (activeColor ?? 'var(--dome-accent)') : 'var(--dome-text-muted)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--dome-bg-hover)';
        (e.currentTarget as HTMLElement).style.color = active ? (activeColor ?? 'var(--dome-accent)') : 'var(--dome-text)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = active ? (activeColor ? `${activeColor}18` : 'var(--dome-accent-bg)') : 'transparent';
        (e.currentTarget as HTMLElement).style.color = active ? (activeColor ?? 'var(--dome-accent)') : 'var(--dome-text-muted)';
      }}
    >
      {icon}
    </button>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────
function HDivider() {
  return <div style={{ width: 1, height: 18, background: 'var(--dome-border)', margin: '0 2px', flexShrink: 0 }} />;
}

export default function WorkspaceHeader({
  resource,
  sidePanelOpen,
  onToggleSidePanel,
  onShowMetadata,
  editableTitle,
  savingIndicator,
  subtitle,
  onExportDocx,
  onPresentationMode,
  onOpenWorkspacePanel,
  notebookWorkspacePath,
  notebookVenvPath,
  mediaFocusMode = false,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen  = useAppStore((s) => s.studioPanelOpen);
  const toggleSourcesPanel = useAppStore((s) => s.toggleSourcesPanel);
  const toggleStudioPanel  = useAppStore((s) => s.toggleStudioPanel);
  const openSemanticGraphTab = useTabStore((s) => s.openSemanticGraphTab);
  const closeSplit = useTabStore((s) => s.closeSplit);
  const activeTabSplitOpen = useTabStore(
    (s) => Boolean(s.tabs.find((tb) => tb.id === s.activeTabId)?.splitOpen),
  );
  const currentProject = useAppStore((s) => s.currentProject);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);

  const hasFile = !!(resource.internal_path || resource.file_path);
  const typeMeta = getTypeMeta(resource.type);
  const isWindows = typeof window !== 'undefined' && window.electron?.isWindows;

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !menuBtnRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [menuOpen]);

  const openMenu = useCallback(() => {
    if (!menuBtnRef.current) return;
    const r = menuBtnRef.current.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setMenuOpen((o) => !o);
  }, []);

  const handleOpenExternal = useCallback(async () => {
    setMenuOpen(false);
    if (!window.electron) return;
    try {
      const res = await window.electron.resource.getFilePath(resource.id);
      if (res.success && res.data) await window.electron.openPath(res.data);
    } catch (err) { console.error(err); }
  }, [resource.id]);

  const handleShowInFinder = useCallback(async () => {
    setMenuOpen(false);
    if (!window.electron) return;
    try {
      const res = await window.electron.resource.getFilePath(resource.id);
      if (res.success && res.data) await window.electron.showItemInFolder(res.data);
    } catch (err) { console.error(err); }
  }, [resource.id]);

  /**
   * Cmd/Ctrl+\ — toggles the split reference pane for note resources.
   *   - if a split is already open in the active tab → close it,
   *   - otherwise open the resource picker so the user can pick the
   *     reference to load alongside the note.
   *
   * The shortcut is intentionally limited to notes (the only resource
   * type that exposes the "Open reference" affordance in the header),
   * and is disabled inside popout windows where there is no host tab
   * to attach the split to.
   */
  useEffect(() => {
    if (resource.type !== 'note') return;
    if (window.location.pathname.startsWith('/focus/note/')) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== '\\') return;
      const target = e.target as HTMLElement | null;
      // Avoid stealing the shortcut from text inputs / contenteditable surfaces.
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
        return;
      }
      e.preventDefault();
      if (activeTabSplitOpen) {
        closeSplit();
      } else if (currentProject?.id) {
        setSplitPickerOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resource.type, activeTabSplitOpen, closeSplit, currentProject?.id]);

  const handlePopoutNote = useCallback(async () => {
    if (resource.type !== 'note') return;
    if (!window.electron?.invoke) return;
    try {
      await window.electron.invoke('window:create', {
        id: `note-focus:${resource.id}`,
        route: `/focus/note/${encodeURIComponent(resource.id)}`,
        options: {
          width: 960,
          height: 760,
          minWidth: 560,
          minHeight: 480,
          title: `${resource.title} — Dome`,
        },
      });
    } catch (err) {
      console.error('[WorkspaceHeader] Failed to open note popout:', err);
    }
  }, [resource.id, resource.type, resource.title]);

  return (
    <header
      className={`drag-region shrink-0${isWindows ? ' win-titlebar-padding' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        background: 'var(--dome-surface)',
        borderBottom: '1px solid var(--dome-border)',
        minHeight: 52,
        paddingTop: `calc(10px + var(--safe-area-inset-top))`,
        paddingBottom: 10,
        paddingLeft: 16,
        paddingRight: 12,
      }}
    >
      {/* ── Left: type badge + title + saving ─────────────────────────── */}
      <div className="no-drag flex items-center gap-2.5 min-w-0 flex-1 mr-3">
        {/* Type badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 7,
            background: typeMeta.bg,
            color: typeMeta.color,
            flexShrink: 0,
            border: `1px solid ${typeMeta.color}26`,
          }}
          title={typeMeta.label}
        >
          {typeMeta.icon}
        </div>

        {/* Title */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {editableTitle ? (
            <input
              type="text"
              value={editableTitle.value}
              onChange={(e) => editableTitle.onChange(e.target.value)}
              onBlur={editableTitle.onBlur}
              placeholder={editableTitle.placeholder ?? 'Sin título'}
              aria-label="Título del recurso"
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--dome-text)',
                fontFamily: 'var(--font-sans)',
                padding: '2px 4px',
                borderRadius: 4,
                letterSpacing: '-0.01em',
              }}
              onFocus={(e) => {
                (e.currentTarget).style.background = 'var(--dome-bg-hover)';
              }}
              onBlurCapture={(e) => {
                (e.currentTarget).style.background = 'transparent';
              }}
            />
          ) : (
            <div className="flex items-baseline gap-2 min-w-0">
              <h1
                title={resource.title}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--dome-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 400,
                  letterSpacing: '-0.01em',
                }}
              >
                {resource.title}
              </h1>
              {subtitle && (
                <span style={{ fontSize: 11, color: 'var(--dome-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {subtitle}
                </span>
              )}
            </div>
          )}

          {/* Saving indicator slot */}
          {savingIndicator && <div className="flex-shrink-0">{savingIndicator}</div>}
        </div>

        {/* Notebook workspace button */}
        {resource.type === 'notebook' && onOpenWorkspacePanel && (
          <button
            type="button"
            onClick={onOpenWorkspacePanel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 26,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--dome-border)',
              background: 'transparent',
              fontSize: 11,
              fontWeight: 500,
              color: notebookWorkspacePath || notebookVenvPath ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
            title="Configurar carpeta de trabajo y entorno Python"
          >
            <FolderOpen size={12} />
            <span>
              {notebookWorkspacePath ? 'Carpeta' : notebookVenvPath ? 'Venv' : 'Workspace'}
            </span>
          </button>
        )}
      </div>

      {/* ── Right: panels + tools ─────────────────────────────────────── */}
      <div className="no-drag flex items-center gap-0.5 flex-shrink-0">
        {/* AI index status */}
        <IndexStatusBadge resourceId={resource.id} resourceType={resource.type} />

        <HDivider />

        {/* Panel toggles: ocultos en modo multimedia para reducir ruido */}
        {!mediaFocusMode && (
          <>
            <HeaderIconBtn
              icon={<BookOpen size={14} strokeWidth={2} />}
              label={t('workspace.sources')}
              active={sourcesPanelOpen}
              onClick={toggleSourcesPanel}
            />
            <HeaderIconBtn
              icon={<Sparkles size={14} strokeWidth={2} />}
              label={t('workspace.studio')}
              active={studioPanelOpen}
              activeColor="var(--accent)"
              onClick={toggleStudioPanel}
            />
            <HeaderIconBtn
              icon={<Network size={14} strokeWidth={2} />}
              label={t('workspace.graph')}
              active={false}
              activeColor="var(--accent)"
              onClick={() => openSemanticGraphTab(resource.id)}
            />
          </>
        )}
        <HeaderIconBtn
          icon={<PanelRight size={14} strokeWidth={2} />}
          label={t('workspace.sidePanel')}
          active={sidePanelOpen}
          onClick={onToggleSidePanel}
        />

        {/* Note-only actions: split reference + popout. Grouped after a
            divider so they read as a separate cluster from the panel
            toggles above. Hidden inside the popout window itself to
            avoid recursive open-in-window controls. */}
        {resource.type === 'note' && !window.location.pathname.startsWith('/focus/note/') && (
          <>
            <HDivider />
            {currentProject?.id && (
              <HeaderIconBtn
                icon={<PanelRightOpen size={14} strokeWidth={2} />}
                label={t('focused_editor.open_reference', 'Abrir referencia')}
                onClick={() => setSplitPickerOpen(true)}
              />
            )}
            <HeaderIconBtn
              icon={<Maximize2 size={14} strokeWidth={2} />}
              label={t('focused_editor.popout', 'Abrir en ventana')}
              onClick={handlePopoutNote}
            />
          </>
        )}

        <HDivider />

        {/* Presentation mode */}
        {resource.type === 'ppt' && onPresentationMode && (
          <HeaderIconBtn
            icon={<Presentation size={14} strokeWidth={2} />}
            label={t('workspace.presentation_mode')}
            onClick={onPresentationMode}
          />
        )}

        {/* More options */}
        <HeaderIconBtn
          icon={<MoreHorizontal size={14} strokeWidth={2} />}
          label={t('workspace.more_options')}
          active={menuOpen}
          forwardRef={menuBtnRef}
          onClick={openMenu}
        />
      </div>

      {/* ── Dropdown menu (portal) ─────────────────────────────────────── */}
      {menuOpen && ReactDOM.createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            zIndex: 'var(--z-max)' as string,
            minWidth: 196,
            background: 'var(--dome-surface)',
            border: '1px solid var(--dome-border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            padding: 6,
            animation: 'dropdown-appear 0.12s ease-out',
          }}
          role="menu"
        >
          <MenuItem icon={<Info size={14} />} label={t('viewer.resource_info')} onClick={() => { setMenuOpen(false); onShowMetadata(); }} />

          {resource.type === 'ppt' && onExportDocx && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<FileDown size={14} />}
                label="Exportar a PPTX"
                onClick={async () => { setMenuOpen(false); await onExportDocx(); }}
              />
            </>
          )}

          {hasFile && (
            <>
              <MenuDivider />
              <MenuItem icon={<ExternalLink size={14} />} label={t('viewer.open_with_default_app')} onClick={handleOpenExternal} />
              <MenuItem icon={<FolderOpen size={14} />} label={t('viewer.show_in_finder')} onClick={handleShowInFinder} />
            </>
          )}
        </div>,
        document.body,
      )}

      {/* Picker modal for opening a sibling resource as a split reference. */}
      {currentProject?.id && (
        <SplitResourcePicker
          opened={splitPickerOpen}
          onClose={() => setSplitPickerOpen(false)}
          projectId={currentProject.id}
          excludeResourceId={resource.id}
        />
      )}
    </header>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '8px 10px',
        border: 'none',
        borderRadius: 6,
        background: hovered ? 'var(--dome-bg-hover)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 12.5,
        fontWeight: 500,
        color: 'var(--dome-text)',
        transition: 'background 80ms',
      }}
    >
      <span style={{ color: 'var(--dome-text-muted)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--dome-border)', margin: '4px 0' }} />;
}
