'use client';

import {
  FileText,
  Notebook,
  Upload,
  Link2,
  FolderOpen,
  ChevronRight,
  Home as HomeIcon,
  Plus,
} from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';

interface DocumentToolbarProps {
  breadcrumbPath: Resource[];
  onNavigateToRoot: () => void;
  onNavigateToFolder: (folderId: string) => void;
  onCreateNote: () => void;
  onCreateNotebook: () => void;
  onImportFiles: (filePaths: string[]) => void;
  onAddUrl: () => void;
  onCreateFolder: () => void;
  /** Cuando true, el breadcrumb se oculta (se muestra en el panel de carpetas) */
  hidePath?: boolean;
}

export default function DocumentToolbar({
  breadcrumbPath,
  onNavigateToRoot,
  onNavigateToFolder,
  onCreateNote,
  onCreateNotebook,
  onImportFiles,
  onAddUrl,
  onCreateFolder,
  hidePath = false,
}: DocumentToolbarProps) {
  const handleUploadClick = async () => {
    if (typeof window !== 'undefined' && window.electron?.selectFiles) {
      const filePaths = await window.electron.selectFiles({
        properties: ['openFile', 'multiSelections'],
      });
      if (filePaths && filePaths.length > 0) {
        onImportFiles(filePaths);
      }
    }
  };

  const handleAddUrlClick = () => {
    onAddUrl();
  };

  return (
    <div className="flex items-center justify-between gap-4 py-3 mb-6 border-b border-[var(--dome-border)]">
      {/* Path bar — oculto cuando el breadcrumb está en el panel de carpetas */}
      {!hidePath ? (
        <nav
          className="flex items-center gap-1.5 min-w-0"
          aria-label="Folder path"
        >
          <button
            type="button"
            onClick={onNavigateToRoot}
            className="flex items-center gap-1.5 px-1.5 py-1 text-sm font-medium text-[var(--dome-text-secondary)] hover:text-[var(--dome-text)] hover:bg-[var(--dome-bg-secondary)] rounded-md transition-colors"
            aria-label="All documents"
          >
            <HomeIcon size={14} />
            <span className="hidden sm:inline">All</span>
          </button>

          {breadcrumbPath.length > 0 && (
            <ChevronRight size={14} className="text-[var(--dome-text-muted)] flex-shrink-0" />
          )}

          {breadcrumbPath.map((folder, index) => {
            const isLast = index === breadcrumbPath.length - 1;
            return (
              <div key={folder.id} className="flex items-center gap-1.5 min-w-0">
                {isLast ? (
                  <span
                    className="px-1.5 py-1 text-sm font-semibold text-[var(--dome-text)] truncate max-w-[200px]"
                  >
                    {folder.title}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigateToFolder(folder.id)}
                      className="px-1.5 py-1 text-sm font-medium text-[var(--dome-text-secondary)] hover:text-[var(--dome-text)] hover:bg-[var(--dome-bg-secondary)] rounded-md transition-colors truncate max-w-[150px]"
                    >
                      {folder.title}
                    </button>
                    <ChevronRight size={14} className="text-[var(--dome-text-muted)] flex-shrink-0" />
                  </>
                )}
              </div>
            );
          })}
        </nav>
      ) : (
        <div /> /* Spacer if path is hidden */
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <ToolbarButton onClick={onCreateNote} icon={<FileText size={16} />} label="Note" variant="primary" />
        <div className="h-4 w-px bg-[var(--dome-border)] mx-1" />
        <ToolbarButton onClick={onCreateNotebook} icon={<Notebook size={16} />} label="Notebook" />
        <ToolbarButton onClick={handleUploadClick} icon={<Upload size={16} />} label="Import" />
        <ToolbarButton onClick={handleAddUrlClick} icon={<Link2 size={16} />} label="Link" />
        <ToolbarButton onClick={onCreateFolder} icon={<FolderOpen size={16} />} label="Folder" />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
  variant = 'secondary',
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-2 h-8 px-3 rounded-lg text-sm font-medium transition-all
        ${variant === 'primary'
          ? 'bg-[var(--dome-accent)] text-white hover:bg-[var(--dome-accent-hover)] hover:text-white shadow-sm hover:shadow'
          : 'text-[var(--dome-text-secondary)] hover:text-[var(--dome-text)] hover:bg-[var(--dome-bg-secondary)] border border-transparent hover:border-[var(--dome-border)]'
        }
      `}
      aria-label={label}
      title={label}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
      {/* Show icon only on small screens if needed, but here we keep labels for clarity or hide on extremely small screens */}
    </button>
  );
}
