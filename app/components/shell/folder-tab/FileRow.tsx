/** Resource row with inline rename and context menu (03/T02 — extracted from FolderTabView.tsx). */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Check, FolderInput, MoreVertical, Pencil, Trash2, X } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import { ResourceTypeIcon, TYPE_COLORS, TYPE_LABELS } from './folderTabShared';

export default function FileRow({
  file,
  isLast,
  onOpen,
  onDelete,
  onRename,
  onMoveToProject,
  selected,
  showSelectionChrome,
  onToggleSelect,
}: {
  file: Resource;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onMoveToProject: () => void;
  selected: boolean;
  showSelectionChrome: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(file.title ?? '');
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const typeColor = TYPE_COLORS[file.type] ?? 'var(--dome-text-muted)';
  const typeLabel = TYPE_LABELS[file.type] ?? file.type;
  const timeAgo = file.updated_at
    ? formatDistanceToNow(new Date(file.updated_at), { addSuffix: true })
    : null;

  const commitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== file.title) {
      onRename(renameValue.trim());
    }
    setRenaming(false);
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 transition-colors relative"
      style={{
        borderBottom: isLast ? undefined : '1px solid var(--dome-border)',
        background: hovered ? 'var(--dome-bg-hover)' : 'var(--dome-surface)',
        outline: selected ? '1px solid var(--dome-accent)' : undefined,
        outlineOffset: -1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
    >
      {showSelectionChrome ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => {}}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
          className="rounded border shrink-0 cursor-pointer"
          style={{ accentColor: 'var(--dome-accent)' }}
          aria-label={t('selection.deselect')}
        />
      ) : null}
      <div className="size-1.5 rounded-full shrink-0" style={{ background: typeColor }} />
      <div style={{ color: typeColor }}>
        <ResourceTypeIcon type={file.type} name={file.title} />
      </div>

      {renaming ? (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="flex-1 text-[13px] font-medium rounded px-2 py-0.5 outline-none"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-accent)', color: 'var(--dome-text)' }}
          />
          <button type="button" onClick={commitRename} style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Check className="size-3.5" />
          </button>
          <button type="button" onClick={() => setRenaming(false)} style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              onToggleSelect(e);
              return;
            }
            onOpen();
          }}
          className="flex-1 text-left text-[13px] font-medium truncate hover:underline underline-offset-2 min-w-0"
          style={{ color: 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {file.title || t('folder.untitled')}
        </button>
      )}

      <span
        className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0 font-medium"
        style={{ background: `${typeColor}18`, color: typeColor }}
      >
        {typeLabel}
      </span>

      {timeAgo && (
        <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
          {timeAgo}
        </span>
      )}

      {hovered && !renaming && (
        <div className="shrink-0">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!menuOpen && menuBtnRef.current) {
                const rect = menuBtnRef.current.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setMenuOpen((v) => !v);
            }}
            className="flex items-center justify-center rounded p-0.5"
            style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <MoreVertical className="size-3.5" />
          </button>
          {menuOpen && menuPos && (
            <div
              role="menu"
              tabIndex={-1}
              className="fixed z-[var(--z-popover)] rounded-lg shadow-lg py-1 min-w-[130px]"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)', top: menuPos.top, right: menuPos.right }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setRenaming(true); setRenameValue(file.title ?? ''); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                style={{ color: 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <Pencil className="size-3" /> {t('folder.rename')}
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onMoveToProject(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                style={{ color: 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <FolderInput className="size-3" /> {t('selection.move_to_project')}
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                style={{ color: 'var(--dome-error)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <Trash2 className="size-3" /> {t('folder.delete')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NewFolderInline ──────────────────────────────────────────────────────────

