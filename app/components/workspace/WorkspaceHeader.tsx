'use client';

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
  MoreHorizontal,
  ExternalLink,
  FolderOpen,
  BookOpen,
  Sparkles,
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
}

export default function WorkspaceHeader({
  resource,
  sidePanelOpen,
  onToggleSidePanel,
  onShowMetadata,
  editableTitle,
  savingIndicator,
}: WorkspaceHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const toggleSourcesPanel = useAppStore((s) => s.toggleSourcesPanel);
  const toggleStudioPanel = useAppStore((s) => s.toggleStudioPanel);

  const hasFile = !!(resource.internal_path || resource.file_path);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuButtonRef.current && !menuButtonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [menuOpen]);

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
      case 'document': return <File {...iconProps} />;
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

  return (
    <header
      className="flex items-center justify-between px-4 py-3 border-b app-region-drag"
      style={{
        background: 'var(--bg)',
        borderColor: 'var(--border)',
        minHeight: '56px',
      }}
    >
      {/* Left section */}
      <div className="flex items-center gap-3 min-w-0 app-region-no-drag">
        {/* macOS traffic lights spacing */}
        <div className="w-16 shrink-0" />

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
              className="text-sm font-medium bg-transparent border-none outline-none min-w-0 font-display"
              style={{ color: 'var(--primary-text)' }}
              placeholder={editableTitle.placeholder || 'Untitled'}
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
        {/* Sources panel toggle */}
        <button
          onClick={toggleSourcesPanel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{
            background: sourcesPanelOpen ? 'var(--bg-secondary)' : 'transparent',
            color: sourcesPanelOpen ? 'var(--primary-text)' : 'var(--secondary-text)',
          }}
          title={sourcesPanelOpen ? 'Hide sources' : 'Show sources'}
          aria-label={sourcesPanelOpen ? 'Hide sources panel' : 'Show sources panel'}
          aria-expanded={sourcesPanelOpen}
        >
          <BookOpen size={16} />
          <span>Sources</span>
        </button>

        {/* Studio panel toggle */}
        <button
          onClick={toggleStudioPanel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{
            background: studioPanelOpen ? 'var(--bg-secondary)' : 'transparent',
            color: studioPanelOpen ? 'var(--primary-text)' : 'var(--secondary-text)',
          }}
          title={studioPanelOpen ? 'Hide studio' : 'Show studio'}
          aria-label={studioPanelOpen ? 'Hide studio panel' : 'Show studio panel'}
          aria-expanded={studioPanelOpen}
        >
          <Sparkles size={16} />
          <span>Studio</span>
        </button>

        {/* More options menu */}
        <div className="relative">
          <button
            ref={menuButtonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
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
                zIndex: 9999,
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
                  cursor: 'pointer',
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                role="menuitem"
              >
                <Info size={16} style={{ color: 'var(--secondary-text)' }} />
                Resource info
              </button>

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
                      cursor: 'pointer',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      transition: 'background 150ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                      cursor: 'pointer',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      transition: 'background 150ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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

        {/* Panel toggle */}
        <button
          onClick={onToggleSidePanel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{
            background: sidePanelOpen ? 'var(--bg-secondary)' : 'transparent',
            color: sidePanelOpen ? 'var(--primary-text)' : 'var(--secondary-text)',
          }}
          title={sidePanelOpen ? 'Hide panel' : 'Show panel'}
          aria-label={sidePanelOpen ? 'Ocultar panel' : 'Mostrar panel'}
          aria-expanded={sidePanelOpen}
        >
          {sidePanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          <span>Panel</span>
        </button>
      </div>
    </header>
  );
}
