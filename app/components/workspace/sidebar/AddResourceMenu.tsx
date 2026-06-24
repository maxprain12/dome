/** Sidebar "add resource" menu + relative-time helper (03/T02 — from UnifiedSidebar.tsx). */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, NotebookPen, Link, Upload, Cloud, Layers } from 'lucide-react';

export interface AddResourceMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCreateNote: () => void;
  onCreateNotebook: () => void;
  onAddUrl: () => void;
  onImportFile: () => void;
  onImportFromCloud: () => void;
  onCreateArtifact: () => void;
}

export default function AddResourceMenu({ x, y, onClose, onCreateNote, onCreateNotebook, onAddUrl, onImportFile, onImportFromCloud, onCreateArtifact }: AddResourceMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('keydown', handleKey); };
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    textAlign: 'left', padding: '7px 12px', fontSize: 12.5,
    color: 'var(--dome-text)', background: 'transparent', border: 'none', cursor: 'pointer',
  };

  const ITEMS = [
    { icon: <FileText className="size-3.5" strokeWidth={1.75} />, label: t('toolbar.note'), action: onCreateNote },
    { icon: <NotebookPen className="size-3.5" strokeWidth={1.75} />, label: 'Notebook', action: onCreateNotebook },
    { icon: <Layers className="size-3.5" strokeWidth={1.75} />, label: t('artifacts.new_artifact'), action: onCreateArtifact },
    { icon: <Link className="size-3.5" strokeWidth={1.75} />, label: 'URL / Artículo', action: onAddUrl },
    { icon: <Upload className="size-3.5" strokeWidth={1.75} />, label: 'Importar fichero', action: onImportFile },
    { icon: <Cloud className="size-3.5" strokeWidth={1.75} />, label: 'Importar desde Cloud', action: onImportFromCloud },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[var(--z-popover)] rounded-lg shadow-xl border overflow-hidden"
      style={{
        left: Math.min(x, window.innerWidth - 200),
        top: Math.min(y, window.innerHeight - 160),
        minWidth: 170,
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
        padding: '4px 0',
      }}
    >
      {ITEMS.map((item) => (
        <button
          type="button"
          key={item.label}
          style={itemStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          onClick={() => { item.action(); onClose(); }}
        >
          <span style={{ color: 'var(--dome-text-muted)' }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// timeAgo helper
// ---------------------------------------------------------------------------
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Silence unused warning
void timeAgo;

// ---------------------------------------------------------------------------
// UnifiedSidebar
// ---------------------------------------------------------------------------
