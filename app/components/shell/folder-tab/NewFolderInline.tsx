/** Inline new-folder name input (03/T02 — extracted from FolderTabView.tsx). */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Folder, X } from 'lucide-react';

export default function NewFolderInline({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleConfirm = () => { if (value.trim()) onConfirm(value.trim()); };

  return (
    <div
      className="flex flex-col w-full rounded-xl overflow-hidden"
      style={{ border: '1.5px dashed var(--dome-border)', background: 'var(--dome-surface)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 min-w-0">
        <Folder className="size-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('folder.folderNamePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          className="text-sm outline-none bg-transparent flex-1 min-w-0 truncate"
          style={{ color: 'var(--dome-text)', border: 'none', padding: 0 }}
        />
      </div>
      <div
        className="flex items-center justify-end gap-1 px-2 py-1.5"
        style={{ borderTop: '1px solid var(--dome-border)' }}
      >
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!value.trim()}
          className="flex items-center justify-center size-6 rounded-md transition-colors disabled:opacity-40"
          style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: value.trim() ? 'pointer' : 'default' }}
          onMouseEnter={(e) => { if (value.trim()) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,111,205,0.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center size-6 rounded-md transition-colors"
          style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── AddMenu ─────────────────────────────────────────────────────────────────

