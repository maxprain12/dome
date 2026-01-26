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
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--primary)' }}>
            Resource Info
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Title (Editable) */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--secondary)' }}
            >
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--primary)',
              }}
            />
          </div>

          {/* Type */}
          <div className="flex items-center gap-3">
            <FileText size={16} style={{ color: 'var(--secondary)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--tertiary)' }}>
                Type
              </p>
              <p className="text-sm font-medium capitalize" style={{ color: 'var(--primary)' }}>
                {resource.type}
              </p>
            </div>
          </div>

          {/* File Size */}
          {resource.file_size && (
            <div className="flex items-center gap-3">
              <HardDrive size={16} style={{ color: 'var(--secondary)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--tertiary)' }}>
                  File Size
                </p>
                <p className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
                  {formatFileSize(resource.file_size)}
                </p>
              </div>
            </div>
          )}

          {/* File Hash */}
          {resource.file_hash && (
            <div className="flex items-center gap-3">
              <Hash size={16} style={{ color: 'var(--secondary)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--tertiary)' }}>
                  Hash
                </p>
                <p
                  className="text-sm font-mono"
                  style={{ color: 'var(--primary)' }}
                >
                  {resource.file_hash}
                </p>
              </div>
            </div>
          )}

          {/* Original Filename */}
          {resource.original_filename && (
            <div className="flex items-center gap-3">
              <FileText size={16} style={{ color: 'var(--secondary)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--tertiary)' }}>
                  Original Filename
                </p>
                <p className="text-sm" style={{ color: 'var(--primary)' }}>
                  {resource.original_filename}
                </p>
              </div>
            </div>
          )}

          {/* Created */}
          <div className="flex items-center gap-3">
            <Calendar size={16} style={{ color: 'var(--secondary)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--tertiary)' }}>
                Created
              </p>
              <p className="text-sm" style={{ color: 'var(--primary)' }}>
                {formatDate(resource.created_at)}
              </p>
            </div>
          </div>

          {/* Modified */}
          <div className="flex items-center gap-3">
            <Calendar size={16} style={{ color: 'var(--secondary)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--tertiary)' }}>
                Modified
              </p>
              <p className="text-sm" style={{ color: 'var(--primary)' }}>
                {formatDate(resource.updated_at)}
              </p>
            </div>
          </div>

          {/* File Actions */}
          {(resource.internal_path || resource.file_path) && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleOpenFile}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--primary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                <ExternalLink size={14} />
                Open with default app
              </button>
              <button
                onClick={handleShowInFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--primary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                <FolderOpen size={14} />
                Show in Finder
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{ color: 'var(--secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || title === resource.title}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{
              background: 'var(--brand-primary)',
              color: 'white',
            }}
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
