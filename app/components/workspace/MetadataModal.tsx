'use client';

import { useState, useCallback } from 'react';
import { X, Save, FileText, Calendar, HardDrive, Hash, FolderOpen, ExternalLink, Loader2 } from 'lucide-react';
import { type Resource } from '@/types';

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
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="metadata-modal-title">
      <div className="modal-content max-w-lg animate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="metadata-modal-title" className="text-lg font-semibold font-display" style={{ color: 'var(--primary-text)' }}>
            Resource Info
          </h2>
          <button onClick={onClose} className="btn btn-ghost p-1.5 rounded-lg" aria-label="Close">
            <X size={18} style={{ color: 'var(--secondary-text)' }} />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--secondary-text)' }}>
              Title
            </label>
            <input
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
              <p className="text-sm font-medium capitalize" style={{ color: 'var(--primary-text)' }}>
                {resource.type}
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
              <button onClick={handleOpenFile} className="btn btn-secondary flex items-center gap-1.5">
                <ExternalLink size={14} />
                Open with default app
              </button>
              <button onClick={handleShowInFolder} className="btn btn-secondary flex items-center gap-1.5">
                <FolderOpen size={14} />
                Show in Finder
              </button>
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || title === resource.title}
            className="btn btn-primary flex items-center gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
