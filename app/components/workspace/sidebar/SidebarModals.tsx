/** Sidebar modals: move/delete/new-folder/url (03/T02 — extracted from UnifiedSidebar.tsx). */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, X, Check, Hash } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import { getFolderColor } from './sidebarHelpers';

export function MoveFolderModal({ resource, allFolders, onConfirm, onClose }: {
  resource: Resource; allFolders: Resource[];
  onConfirm: (folderId: string | null) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(resource.folder_id ?? null);
  const available = allFolders.filter((f) => f.id !== resource.id);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 min-h-full w-full cursor-pointer border-0 p-0"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        aria-label={t('ui.close')}
        onClick={onClose}
      />
      <dialog
        open
        className="relative z-10 rounded-xl shadow-xl border flex flex-col m-0 max-w-none max-h-none p-0"
        style={{ width: 300, maxHeight: 400, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
        aria-modal="true"
        aria-labelledby="move-folder-title"
        onCancel={(e) => { e.preventDefault(); onClose(); }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <span id="move-folder-title" className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>
            Mover "{resource.title}"
          </span>
          <button type="button" onClick={onClose} className="rounded flex items-center justify-center hover:bg-[var(--dome-bg-hover)]" style={{ width: 24, height: 24, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1.5">
          <button type="button" className="flex items-center gap-2 w-full text-left px-4 py-2 transition-colors"
            style={{ background: selected === null ? 'var(--dome-bg-hover)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--dome-text)' }}
            onClick={() => setSelected(null)}>
            <Hash className="size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            <span className="flex-1">{t('ui.no_folder_root')}</span>
            {selected === null && <Check className="size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
          </button>
          {available.map((f) => (
            <button key={f.id} type="button"
              className="flex items-center gap-2 w-full text-left px-4 py-2 transition-colors"
              style={{ background: selected === f.id ? 'var(--dome-bg-hover)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--dome-text)' }}
              onClick={() => setSelected(f.id)}
              onMouseEnter={(e) => { if (selected !== f.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { if (selected !== f.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
              <Folder className="size-3.5 shrink-0" style={{ color: getFolderColor(f) }} />
              <span className="flex-1 truncate">{f.title}</span>
              {selected === f.id && <Check className="size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('common.cancel')}</button>
          <button type="button" onClick={() => { onConfirm(selected); onClose(); }} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'var(--base-text)' }}>{t('common.move')}</button>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------
export function DeleteConfirmModal({ resource, onConfirm, onClose }: {
  resource: Resource; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 min-h-full w-full cursor-pointer border-0 p-0"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        aria-label={t('ui.close')}
        onClick={onClose}
      />
      <dialog
        open
        className="relative z-10 rounded-xl shadow-xl border p-5 flex flex-col gap-3 m-0 max-w-none max-h-none"
        style={{ width: 290, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        onCancel={(e) => { e.preventDefault(); onClose(); }}
      >
        <div>
          <p id="delete-confirm-title" className="font-medium text-sm mb-1" style={{ color: 'var(--dome-text)' }}>
            {t('ui.delete_confirm', { type: resource.type === 'folder' ? 'folder' : 'resource' })}
          </p>
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {resource.type === 'folder' ? t('ui.delete_content_warning') : t('ui.delete_warning')}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('ui.cancel')}</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-error)', border: 'none', cursor: 'pointer', color: 'var(--base-text)' }}>{t('ui.delete')}</button>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New folder modal
// ---------------------------------------------------------------------------
export function NewFolderModal({ parentId, onConfirm, onClose }: {
  parentId: string | null; onConfirm: (name: string, parentId: string | null) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => { const t = name.trim(); if (t) { onConfirm(t, parentId); onClose(); } };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 min-h-full w-full cursor-pointer border-0 p-0"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        aria-label={t('ui.close')}
        onClick={onClose}
      />
      <dialog
        open
        className="relative z-10 rounded-xl shadow-xl border p-5 flex flex-col gap-3 m-0 max-w-none max-h-none"
        style={{ width: 280, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
        aria-modal="true"
        aria-labelledby="new-folder-title"
        onCancel={(e) => { e.preventDefault(); onClose(); }}
      >
        <p id="new-folder-title" className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>
          {t('ui.new_folder')}
        </p>
        <input ref={inputRef} type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder={t('ui.folder_name')}
          aria-label={t('ui.folder_name')}
          className="rounded-md px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }} />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('ui.cancel')}</button>
          <button type="button" onClick={submit} disabled={!name.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'var(--base-text)', opacity: name.trim() ? 1 : 0.5 }}>{t('ui.create')}</button>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TreeNode — individual row with hover menu + inline rename + drag-and-drop
// ---------------------------------------------------------------------------

export function UrlInputModal({ onConfirm, onClose }: { onConfirm: (url: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const t = url.trim();
    if (t) { onConfirm(t); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 min-h-full w-full cursor-pointer border-0 p-0"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        aria-label={t('ui.close')}
        onClick={onClose}
      />
      <dialog
        open
        className="relative z-10 rounded-xl shadow-xl border p-5 flex flex-col gap-3 m-0 max-w-none max-h-none"
        style={{ width: 320, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
        aria-modal="true"
        aria-labelledby="url-input-title"
        onCancel={(e) => { e.preventDefault(); onClose(); }}
      >
        <p id="url-input-title" className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>
          {t('ui.add_url')}
        </p>
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder="https://..."
          aria-label={t('ui.add_url')}
          className="rounded-md px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('ui.cancel')}</button>
          <button type="button" onClick={submit} disabled={!url.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'var(--base-text)', opacity: url.trim() ? 1 : 0.5 }}>{t('ui.add')}</button>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-resource dropdown
// ---------------------------------------------------------------------------
