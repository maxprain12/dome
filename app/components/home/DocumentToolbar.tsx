'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  File02Icon,
  NotebookIcon,
  Upload04Icon,
  Link02Icon,
  FolderOpenIcon,
  ChevronRightIcon,
  Home01Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    <div className="flex items-center justify-between gap-4 py-3 mb-6 border-b border-border">
      {/* Path bar — oculto cuando el breadcrumb está en el panel de carpetas */}
      {!hidePath ? (
        <nav
          className="flex items-center gap-1.5 min-w-0"
          aria-label="Folder path"
        >
          <button
            type="button"
            onClick={onNavigateToRoot}
            className="flex items-center gap-1.5 px-1.5 py-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--card)] rounded-md transition-colors"
            aria-label={t('toolbar.all')}
          >
            <HugeiconsIcon icon={Home01Icon} size={14} />
            <span className="hidden sm:inline">{t('toolbar.all')}</span>
          </button>

          {breadcrumbPath.length > 0 && (
            <HugeiconsIcon icon={ChevronRightIcon} size={14} className="text-muted-foreground flex-shrink-0" />
          )}

          {breadcrumbPath.map((folder, index) => {
            const isLast = index === breadcrumbPath.length - 1;
            return (
              <div key={folder.id} className="flex items-center gap-1.5 min-w-0">
                {isLast ? (
                  <span
                    className="px-1.5 py-1 text-sm font-semibold text-foreground truncate max-w-[200px]"
                  >
                    {folder.title}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigateToFolder(folder.id)}
                      className="px-1.5 py-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--card)] rounded-md transition-colors truncate max-w-[150px]"
                    >
                      {folder.title}
                    </button>
                    <HugeiconsIcon icon={ChevronRightIcon} size={14} className="text-muted-foreground flex-shrink-0" />
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
        <ToolbarButton onClick={onCreateNote} icon={<HugeiconsIcon icon={File02Icon} size={16} />} label={t('toolbar.note')} variant="primary" />
        <ToolbarButton onClick={onCreateNotebook} icon={<HugeiconsIcon icon={NotebookIcon} size={16} />} label={t('toolbar.notebook')} />
        <ToolbarButton onClick={handleUploadClick} icon={<HugeiconsIcon icon={Upload04Icon} size={16} />} label={t('toolbar.import')} />
        <ToolbarButton onClick={handleAddUrlClick} icon={<HugeiconsIcon icon={Link02Icon} size={16} />} label={t('toolbar.link')} />
        <ToolbarButton onClick={onCreateFolder} icon={<HugeiconsIcon icon={FolderOpenIcon} size={16} />} label={t('toolbar.folder')} />
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
          ? 'bg-primary text-white hover:bg-[color-mix(in oklch, var(--primary) 85%, var(--background))] hover:text-white shadow-sm hover:shadow'
          : 'text-muted-foreground hover:text-foreground hover:bg-[var(--card)] border border-transparent hover:border-border'
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
