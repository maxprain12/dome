/** Sidebar modals: delete/new-folder/url — unified on DomeModal. */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';

export function DeleteConfirmModal({ resource, onConfirm, onClose }: {
  resource: Resource;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isFolder = resource.type === 'folder';

  return (
    <DomeModal
      open
      onClose={onClose}
      title={t('ui.delete_confirm', { type: isFolder ? 'folder' : 'resource' })}
      subtitle={isFolder ? t('ui.delete_content_warning') : t('ui.delete_warning')}
      size="sm"
      headerIcon={
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'color-mix(in srgb, var(--dome-error) 12%, transparent)' }}
        >
          <AlertTriangle className="size-4" style={{ color: 'var(--dome-error)' }} />
        </span>
      }
      footer={
        <>
          <DomeButton variant="secondary" onClick={onClose}>
            {t('ui.cancel')}
          </DomeButton>
          <DomeButton
            variant="primary"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            style={{ background: 'var(--dome-error)' }}
          >
            {t('ui.delete')}
          </DomeButton>
        </>
      }
    >
      <p className="truncate text-sm font-medium text-[var(--primary-text)]">{resource.title}</p>
    </DomeModal>
  );
}

export function NewFolderModal({ parentId, onConfirm, onClose }: {
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
    <DomeModal
      open
      onClose={onClose}
      title={t('ui.new_folder')}
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          <DomeButton variant="secondary" onClick={onClose}>
            {t('ui.cancel')}
          </DomeButton>
          <DomeButton variant="primary" onClick={submit} disabled={!name.trim()}>
            {t('ui.create')}
          </DomeButton>
        </>
      }
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={t('ui.folder_name')}
        aria-label={t('ui.folder_name')}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: 'var(--dome-bg-hover)',
          border: '1px solid var(--dome-border)',
          color: 'var(--dome-text)',
        }}
      />
    </DomeModal>
  );
}

export function UrlInputModal({ onConfirm, onClose }: {
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
    <DomeModal
      open
      onClose={onClose}
      title={t('ui.add_url')}
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          <DomeButton variant="secondary" onClick={onClose}>
            {t('ui.cancel')}
          </DomeButton>
          <DomeButton variant="primary" onClick={submit} disabled={!url.trim()}>
            {t('ui.add')}
          </DomeButton>
        </>
      }
    >
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="https://..."
        aria-label={t('ui.add_url')}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: 'var(--dome-bg-hover)',
          border: '1px solid var(--dome-border)',
          color: 'var(--dome-text)',
        }}
      />
    </DomeModal>
  );
}
