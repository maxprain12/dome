/** Sidebar modals: delete/new-folder/url — unified on DetailDrawer. */

import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/lib/hooks/useResources';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerFooter,
  DetailDrawerHeader,
} from '@/components/shared/DetailDrawer';

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

  return (
    <DetailDrawer open onOpenChange={(next) => { if (!next) onClose(); }} direction="down">
      <DetailDrawerContent size="sm" direction="down">
        <DetailDrawerHeader
          title={t('ui.delete_confirm', { type: isFolder ? 'folder' : 'resource' })}
          description={isFolder ? t('ui.delete_content_warning') : t('ui.delete_warning')}
          icon={<HugeiconsIcon icon={Alert02Icon} className="size-4 text-destructive" />}
        />
        <DetailDrawerBody className="py-3">
          <p className="truncate text-sm font-medium text-foreground">{resource.title}</p>
        </DetailDrawerBody>
        <DetailDrawerFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {t('ui.delete')}
          </Button>
        </DetailDrawerFooter>
      </DetailDrawerContent>
    </DetailDrawer>
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
    <DetailDrawer open onOpenChange={(next) => { if (!next) onClose(); }} direction="down">
      <DetailDrawerContent size="sm" direction="down">
        <DetailDrawerHeader
          title={t('selection.bulk_delete_confirm', { count })}
          description={t('ui.delete_content_warning')}
          icon={<HugeiconsIcon icon={Alert02Icon} className="size-4 text-destructive" />}
        />
        <DetailDrawerBody className="py-3">
          <p className="m-0 text-sm text-muted-foreground">
            {t('selection.items_selected', { count })}
          </p>
        </DetailDrawerBody>
        <DetailDrawerFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('ui.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? '…' : t('ui.delete')}
          </Button>
        </DetailDrawerFooter>
      </DetailDrawerContent>
    </DetailDrawer>
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
    <DetailDrawer open onOpenChange={(next) => { if (!next) onClose(); }} direction="down">
      <DetailDrawerContent size="sm" direction="down">
        <DetailDrawerHeader title={t('ui.new_folder')} />
        <DetailDrawerBody className="py-3">
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
        </DetailDrawerBody>
        <DetailDrawerFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {t('ui.create')}
          </Button>
        </DetailDrawerFooter>
      </DetailDrawerContent>
    </DetailDrawer>
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
    <DetailDrawer open onOpenChange={(next) => { if (!next) onClose(); }} direction="down">
      <DetailDrawerContent size="sm" direction="down">
        <DetailDrawerHeader title={t('ui.add_url')} />
        <DetailDrawerBody className="py-3">
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
        </DetailDrawerBody>
        <DetailDrawerFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button onClick={submit} disabled={!url.trim()}>
            {t('ui.add')}
          </Button>
        </DetailDrawerFooter>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
