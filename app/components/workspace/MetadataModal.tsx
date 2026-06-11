
import { useState, useCallback } from 'react';
import { Save, FileText, Calendar, HardDrive, Hash, FolderOpen, ExternalLink, Loader2 } from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import { type Resource } from '@/types';
import { formatDateFull, getResourceTypeLabel } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface MetadataModalProps {
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Resource>) => Promise<boolean>;
}

export default function MetadataModal({
  resource,
  isOpen,
  onClose,
  onSave,
}: MetadataModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(resource.title);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (title === resource.title) {
      onClose();
      return;
    }

    setIsSaving(true);
    const success = await onSave({ title });
    setIsSaving(false);

    if (success) {
      onClose();
    }
  }, [title, resource.title, onSave, onClose]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp || !isFinite(timestamp)) return '—';
    return formatDateFull(timestamp);
  };

  const handleOpenFile = async () => {
    if (typeof window !== 'undefined' && window.electron) {
      try {
        const result = await window.electron.resource.getFilePath(resource.id);
        if (result.success && result.data) {
          await window.electron.openPath(result.data);
        }
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    }
  };

  const handleShowInFolder = async () => {
    if (typeof window !== 'undefined' && window.electron) {
      try {
        const result = await window.electron.resource.getFilePath(resource.id);
        if (result.success && result.data) {
          await window.electron.showItemInFolder(result.data);
        }
      } catch (err) {
        console.error('Failed to show in folder:', err);
      }
    }
  };

  return (
    <DomeModal
      open={isOpen}
      onClose={onClose}
      title="Resource Info"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || title === resource.title}
            className="btn btn-primary flex items-center gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save Changes
          </button>
        </>
      }
    >
      <div className="space-y-4">
          <div>
            <label htmlFor="metadata-title" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--secondary-text)' }}>
              Title
            </label>
            <input
              id="metadata-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
            />
          </div>

          <div className="flex items-center gap-3">
            <FileText size={16} style={{ color: 'var(--secondary-text)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                Type
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                {getResourceTypeLabel(resource.type)}
              </p>
            </div>
          </div>

          {resource.file_size ? (
            <div className="flex items-center gap-3">
              <HardDrive size={16} style={{ color: 'var(--secondary-text)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                  File Size
                </p>
                <p className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                  {formatFileSize(resource.file_size)}
                </p>
              </div>
            </div>
          ) : null}

          {resource.file_hash ? (
            <div className="flex items-center gap-3">
              <Hash size={16} style={{ color: 'var(--secondary-text)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                  Hash
                </p>
                <p
                  className="text-sm font-mono"
                  style={{ color: 'var(--primary-text)' }}
                >
                  {resource.file_hash}
                </p>
              </div>
            </div>
          ) : null}

          {resource.original_filename ? (
            <div className="flex items-center gap-3">
              <FileText size={16} style={{ color: 'var(--secondary-text)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                  Original Filename
                </p>
                <p className="text-sm" style={{ color: 'var(--primary-text)' }}>
                  {resource.original_filename}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <Calendar size={16} style={{ color: 'var(--secondary-text)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                Created
              </p>
              <p className="text-sm" style={{ color: 'var(--primary-text)' }}>
                {formatDate(resource.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Calendar size={16} style={{ color: 'var(--secondary-text)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                Modified
              </p>
              <p className="text-sm" style={{ color: 'var(--primary-text)' }}>
                {formatDate(resource.updated_at)}
              </p>
            </div>
          </div>

          {(resource.internal_path || resource.file_path) ? (
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={handleOpenFile} className="btn btn-secondary flex items-center gap-1.5">
                <ExternalLink size={14} />
                Open with default app
              </button>
              <button type="button" onClick={handleShowInFolder} className="btn btn-secondary flex items-center gap-1.5">
                <FolderOpen size={14} />
                Show in Finder
              </button>
            </div>
          ) : null}
      </div>
    </DomeModal>
  );
}
