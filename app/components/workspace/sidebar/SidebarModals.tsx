/** Sidebar modals: delete/new-folder/url — centered dialogs. */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { Resource } from '@/lib/hooks/useResources';

export function DeleteConfirmModal({
  resource,
  onConfirm,
  onClose,
}: {
  resource: Resource;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isFolder = resource.type === 'folder';
  const warning = isFolder ? t('ui.delete_content_warning') : t('ui.delete_warning');

  return (
    <ConfirmDialog
      isOpen
      title={t('ui.delete_confirm', { type: isFolder ? 'folder' : 'resource' })}
      message={`${resource.title} — ${warning}`}
      confirmLabel={t('ui.delete')}
      cancelLabel={t('ui.cancel')}
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

export function BulkDeleteConfirmModal({
  count,
  busy = false,
  onConfirm,
  onClose,
}: {
  count: number;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      isOpen
      title={t('selection.bulk_delete_confirm', { count })}
      message={`${t('selection.items_selected', { count })} — ${t('ui.delete_content_warning')}`}
      confirmLabel={busy ? '…' : t('ui.delete')}
      cancelLabel={t('ui.cancel')}
      variant="danger"
      onConfirm={() => {
        if (!busy) onConfirm();
      }}
      onCancel={onClose}
    />
  );
}

export function NewFolderModal({
  parentId,
  onConfirm,
  onClose,
}: {
  parentId: string | null;
  onConfirm: (name: string, parentId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onConfirm(trimmed, parentId);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('ui.new_folder')}</DialogTitle>
          <DialogDescription className="sr-only">{t('ui.folder_name')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-folder-name">{t('ui.folder_name')}</Label>
          <Input
            ref={inputRef}
            id="new-folder-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={t('ui.folder_name')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {t('ui.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UrlInputModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (url: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = url.trim();
    if (trimmed) {
      onConfirm(trimmed);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('ui.add_url')}</DialogTitle>
          <DialogDescription className="sr-only">{t('ui.add_url')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="url-input">{t('ui.add_url')}</Label>
          <Input
            ref={inputRef}
            id="url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="https://..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button onClick={submit} disabled={!url.trim()}>
            {t('ui.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
