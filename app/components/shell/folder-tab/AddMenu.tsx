/** "Añadir" dropdown (nota/carpeta/subida/URL) (03/T02 — extracted from FolderTabView.tsx). */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileText, Folder, Link2, Plus, Upload } from 'lucide-react';

export default function AddMenu({ onNewNote, onNewFolder, onUpload, onAddUrl }: {
  onNewNote: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
  onAddUrl: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, color?: string) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(); }}
      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left transition-colors"
      style={{ color: color ?? 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
        style={{
          background: 'var(--dome-accent)',
          color: 'var(--dome-on-accent)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(124,111,205,0.35)',
        }}
      >
        <Plus className="size-3.5" />
        {t('folder.addBtn', 'Añadir')}
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1.5 z-[var(--z-popover)] rounded-xl shadow-xl py-1.5 min-w-[200px]"
          style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          {item(<FileText className="size-4" style={{ color: 'var(--dome-accent)' }} />, t('toolbar.note', 'Nueva nota'), onNewNote)}
          {item(<Upload className="size-4" style={{ color: 'var(--accent)' }} />, t('toolbar.import', 'Subir archivo'), onUpload)}
          {item(<Link2 className="size-4" style={{ color: 'var(--success)' }} />, t('toolbar.link', 'Añadir enlace'), onAddUrl)}
          <div className="my-1" style={{ height: 1, background: 'var(--dome-border)' }} />
          {item(<Folder className="size-4" style={{ color: 'var(--dome-text-muted)' }} />, t('folder.newFolderBtn', 'Nueva carpeta'), onNewFolder)}
        </div>
      )}
    </div>
  );
}

// ─── FolderTabView ────────────────────────────────────────────────────────────

