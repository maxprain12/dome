import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Info,
  PanelRightClose,
  PanelRightOpen,
  FileText,
  Video,
  Music,
  Image,
  FileEdit,
  File,
  Folder,
  Notebook,
  MoreHorizontal,
  ExternalLink,
  FolderOpen,
  BookOpen,
  Sparkles,
  Network,
  ChevronDown,
  Check,
  FileDown,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
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
  onExportPdf?: () => void | Promise<void>;
}

export default function WorkspaceHeader({
  resource,
  sidePanelOpen,
  onToggleSidePanel,
  onShowMetadata,
  editableTitle,
  savingIndicator,
  onExportPdf,
}: WorkspaceHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);

  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const toggleSourcesPanel = useAppStore((s) => s.toggleSourcesPanel);
  const toggleStudioPanel = useAppStore((s) => s.toggleStudioPanel);
  const toggleGraphPanel = useAppStore((s) => s.toggleGraphPanel);

  const hasFile = !!(resource.internal_path || resource.file_path);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen && !panelsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target) || menuButtonRef.current?.contains(target);
      const inPanels = panelsRef.current?.contains(target);
      if (!inMenu) setMenuOpen(false);
      if (!inPanels) setPanelsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, panelsOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen && !panelsOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setPanelsOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [menuOpen, panelsOpen]);

  const handleOpenExternal = useCallback(async () => {
    setMenuOpen(false);
    if (typeof window === 'undefined' || !window.electron) return;
    try {
      const result = await window.electron.resource.getFilePath(resource.id);
      if (result.success && result.data) {
        await window.electron.openPath(result.data);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, [resource.id]);

  const handleShowInFinder = useCallback(async () => {
    setMenuOpen(false);
    if (typeof window === 'undefined' || !window.electron) return;
    try {
      const result = await window.electron.resource.getFilePath(resource.id);
      if (result.success && result.data) {
        await window.electron.showItemInFolder(result.data);
      }
    } catch (err) {
      console.error('Failed to show in folder:', err);
    }
  }, [resource.id]);

  const handleShowInfo = useCallback(() => {
    setMenuOpen(false);
    onShowMetadata();
  }, [onShowMetadata]);

  const getTypeIcon = () => {
    const iconProps = { size: 18, className: 'shrink-0' };
    switch (resource.type) {
      case 'pdf': return <FileText {...iconProps} />;
      case 'video': return <Video {...iconProps} />;
      case 'audio': return <Music {...iconProps} />;
      case 'image': return <Image {...iconProps} />;
      case 'note': return <FileEdit {...iconProps} />;
      case 'notebook': return <Notebook {...iconProps} />;
      case 'document': return <File {...iconProps} />;
      case 'url': return <ExternalLink {...iconProps} />;
      default: return <Folder {...iconProps} />;
    }
  };

  // Calculate dropdown position from button ref
  const getMenuPosition = () => {
    if (!menuButtonRef.current) return { top: 0, right: 0 };
    const rect = menuButtonRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    };
  };

  const isWindows = typeof window !== 'undefined' && window.electron?.isWindows;

  return (
    <header
      className={`flex items-center justify-between px-4 py-3 border-b app-region-drag shrink-0${isWindows ? ' win-titlebar-padding' : ''}`}
      style={{
        background: 'var(--bg)',
        borderColor: 'var(--border)',
        minHeight: '56px',
        paddingTop: 'calc(12px + var(--safe-area-inset-top))',
      }}
    >
      {/* Left section */}
      <div className="flex items-center gap-3 min-w-0 app-region-no-drag">
        <div className="flex items-center gap-2 min-w-0">
          <div style={{ color: 'var(--secondary-text)' }} className="shrink-0">
            {getTypeIcon()}
          </div>

          {editableTitle ? (
            <input
              type="text"
              value={editableTitle.value}
              onChange={(e) => editableTitle.onChange(e.target.value)}
              onBlur={editableTitle.onBlur}
              className="text-sm font-medium bg-transparent border-none outline-none min-w-0 font-display focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{ color: 'var(--primary-text)' }}
              placeholder={editableTitle.placeholder || 'Untitled'}
              aria-label="Resource title"
            />
          ) : (
            <h1
              className="text-sm font-medium truncate max-w-md font-display"
              style={{ color: 'var(--primary-text)' }}
              title={resource.title}
            >
              {resource.title}
            </h1>
          )}

          {savingIndicator}
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 app-region-no-drag">
        {/* Panels selector dropdown */}
        <div ref={panelsRef} className="relative">
          <button
            onClick={() => setPanelsOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{
              background: sourcesPanelOpen || studioPanelOpen || graphPanelOpen || sidePanelOpen
                ? 'var(--bg-secondary)'
                : 'transparent',
              border: '1px solid var(--border)',
              color: sourcesPanelOpen || studioPanelOpen || graphPanelOpen || sidePanelOpen
                ? 'var(--primary-text)'
                : 'var(--secondary-text)',
            }}
            title="Paneles"
            aria-expanded={panelsOpen}
            aria-haspopup="listbox"
          >
            <PanelRightOpen size={16} />
            <span>Paneles</span>
            <ChevronDown
              size={14}
              style={{
                opacity: 0.7,
                transform: panelsOpen ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s',
              }}
            />
          </button>

          {panelsOpen && (
            <div
              className="absolute right-0 top-full mt-1 py-1 min-w-[180px] rounded-lg z-dropdown shadow-lg"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <button
                onClick={() => { toggleSourcesPanel(); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  color: 'var(--primary-text)',
                }}
              >
                <BookOpen size={16} style={{ color: 'var(--secondary-text)' }} />
                <span className="flex-1">Sources</span>
                {sourcesPanelOpen && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </button>
              <button
                onClick={() => { toggleStudioPanel(); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--primary-text)' }}
              >
                <Sparkles size={16} style={{ color: 'var(--secondary-text)' }} />
                <span className="flex-1">Studio</span>
                {studioPanelOpen && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </button>
              <button
                onClick={() => { toggleGraphPanel(); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--primary-text)' }}
              >
                <Network size={16} style={{ color: 'var(--secondary-text)' }} />
                <span className="flex-1">Graph</span>
                {graphPanelOpen && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button
                onClick={() => { onToggleSidePanel(); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--primary-text)' }}
              >
                <PanelRightOpen size={16} style={{ color: 'var(--secondary-text)' }} />
                <span className="flex-1">Panel lateral</span>
                {sidePanelOpen && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </button>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* More options menu */}
        <div className="relative">
          <button
            ref={menuButtonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{
              background: menuOpen ? 'var(--bg-secondary)' : 'transparent',
              color: 'var(--secondary-text)',
            }}
            title="More options"
            aria-label="More options"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className="dropdown-menu"
              style={{
                position: 'fixed',
                ...getMenuPosition(),
                zIndex: 'var(--z-max)',
                minWidth: '200px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                padding: '6px',
                animation: 'dropdown-appear 0.15s ease-out',
              }}
              role="menu"
            >
              <button
                onClick={handleShowInfo}
                className="dropdown-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--primary-text)',
                  width: '100%',
                  border: 'none',
                  textAlign: 'left',
                }}
                role="menuitem"
              >
                <Info size={16} style={{ color: 'var(--secondary-text)' }} />
                Resource info
              </button>

              {resource.type === 'note' && onExportPdf && (
                <>
                  <div
                    style={{
                      height: '1px',
                      background: 'var(--border)',
                      margin: '4px 0',
                    }}
                  />
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      await onExportPdf();
                    }}
                    className="dropdown-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--primary-text)',
                      width: '100%',
                      border: 'none',
                      textAlign: 'left',
                    }}
                    role="menuitem"
                  >
                    <FileDown size={16} style={{ color: 'var(--secondary-text)' }} />
                    Exportar a PDF
                  </button>
                </>
              )}

              {hasFile && (
                <>
                  <div
                    style={{
                      height: '1px',
                      background: 'var(--border)',
                      margin: '4px 0',
                    }}
                  />
                  <button
                    onClick={handleOpenExternal}
                    className="dropdown-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--primary-text)',
                      width: '100%',
                      border: 'none',
                      textAlign: 'left',
                    }}
                    role="menuitem"
                  >
                    <ExternalLink size={16} style={{ color: 'var(--secondary-text)' }} />
                    Open with default app
                  </button>
                  <button
                    onClick={handleShowInFinder}
                    className="dropdown-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--primary-text)',
                      width: '100%',
                      border: 'none',
                      textAlign: 'left',
                    }}
                    role="menuitem"
                  >
                    <FolderOpen size={16} style={{ color: 'var(--secondary-text)' }} />
                    Show in Finder
                  </button>
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
