import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  SaveIcon,
  File02Icon,
  Calendar03Icon,
  HardDriveIcon,
  HashIcon,
  FolderOpenIcon,
  ExternalLinkIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons';
import { type Resource } from '@/types';
import { formatDateFull, getResourceTypeLabel } from '@/lib/utils';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { Input } from '@/components/ui/input';

interface MetadataModalProps {
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Resource>) => Promise<boolean>;
}

function formatMetadataFileSize(bytes?: number) {
  if (!bytes) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatMetadataDate(timestamp?: number) {
  if (!timestamp || !isFinite(timestamp)) return '—';
  return formatDateFull(timestamp);
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
    <AppModal
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="md">
        <AppModalHeader title="Resource Info" />
        <AppModalBody>
          <div className="flex flex-col gap-y-4">
            <div>
              <label htmlFor="metadata-title" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Title
              </label>
              <Input
                id="metadata-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <HugeiconsIcon icon={File02Icon} size={16} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm font-medium text-foreground">
                  {getResourceTypeLabel(resource.type)}
                </p>
              </div>
            </div>

            {resource.file_size ? (
              <div className="flex items-center gap-3">
                <HugeiconsIcon icon={HardDriveIcon} size={16} className="text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">File Size</p>
                  <p className="text-sm font-medium text-foreground">
                    {formatMetadataFileSize(resource.file_size)}
                  </p>
                </div>
              </div>
            ) : null}

            {resource.file_hash ? (
              <div className="flex items-center gap-3">
                <HugeiconsIcon icon={HashIcon} size={16} className="text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Hash</p>
                  <p className="font-mono text-sm text-foreground">{resource.file_hash}</p>
                </div>
              </div>
            ) : null}

            {resource.original_filename ? (
              <div className="flex items-center gap-3">
                <HugeiconsIcon icon={File02Icon} size={16} className="text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Original Filename</p>
                  <p className="text-sm text-foreground">{resource.original_filename}</p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <HugeiconsIcon icon={Calendar03Icon} size={16} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm text-foreground">{formatMetadataDate(resource.created_at)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <HugeiconsIcon icon={Calendar03Icon} size={16} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Modified</p>
                <p className="text-sm text-foreground">{formatMetadataDate(resource.updated_at)}</p>
              </div>
            </div>

            {resource.internal_path || resource.file_path ? (
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    void handleOpenFile().catch(() => {});
                  }}
                  variant="outline"
                  className="flex items-center gap-1.5"
                >
                  <HugeiconsIcon icon={ExternalLinkIcon} size={14} />
                  Open with default app
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleShowInFolder().catch(() => {});
                  }}
                  variant="outline"
                  className="flex items-center gap-1.5"
                >
                  <HugeiconsIcon icon={FolderOpenIcon} size={14} />
                  Show in Finder
                </Button>
              </div>
            ) : null}
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button type="button" onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSave().catch(() => {});
            }}
            disabled={isSaving || title === resource.title}
            className="flex items-center gap-1.5"
          >
            {isSaving ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
            ) : (
              <HugeiconsIcon icon={SaveIcon} size={14} />
            )}
            Save Changes
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
