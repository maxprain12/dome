/** Folder card with rename/color/move context menu (03/T02 — extracted from FolderTabView.tsx). */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Folder, FolderInput, MoreVertical, Palette, Pencil, Trash2, X } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import ColorPickerPopover from './ColorPickerPopover';
import { getFolderColor, FOLDER_COLOR_DEFAULT } from './folderTabShared';

export default function SubfolderCard({
  folder,
  onClick,
  onRename,
  onDelete,
  onChangeColor,
  onMoveToProject,
  selected,
  showSelectionChrome,
  onToggleSelect,
}: {
  folder: Resource;
  onClick: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onChangeColor: (color: string) => void;
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
  const [renameValue, setRenameValue] = useState(folder.title ?? '');
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const color = getFolderColor(folder);
  const folderSelectId = `folder-tab-row-select-${folder.id}`;

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const commitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== folder.title) {
      onRename(renameValue.trim());
    }
    setRenaming(false);
  };

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen((v) => !v);
  };

  const menuItem = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); action(); }}
      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
      style={{ color: danger ? 'var(--dome-error)' : 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div
      className="relative flex flex-col rounded-xl transition-all"
      style={{
        background: hovered ? 'var(--dome-bg-hover)' : 'var(--dome-surface)',
        border: `1px solid ${selected ? 'var(--dome-accent)' : hovered ? color : 'var(--dome-border)'}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
    >
      {showSelectionChrome ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- stopPropagation barrier so the card click doesn't fire
        <label
          className="absolute left-2 top-2 z-[2] flex items-center cursor-pointer"
          htmlFor={folderSelectId}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            id={folderSelectId}
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
            className="rounded border cursor-pointer"
            style={{ accentColor: 'var(--dome-accent)' }}
            aria-label={t('selection.deselect')}
          />
        </label>
      ) : null}
      {/* Main clickable area */}
      {renaming ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Folder className="size-4 shrink-0" style={{ color }} />
          <input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(folder.title ?? ''); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm outline-none rounded px-1.5 py-0.5"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-accent)', color: 'var(--dome-text)' }}
          />
          <button type="button" onClick={(e) => { e.stopPropagation(); commitRename(); }}
            style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Check className="size-3.5" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setRenaming(false); setRenameValue(folder.title ?? ''); }}
            style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
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
            onClick();
          }}
          className="flex items-center gap-2.5 px-3 py-2.5 text-left w-full"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            paddingLeft: showSelectionChrome ? 36 : undefined,
          }}
        >
          <Folder className="size-4 shrink-0" style={{ color }} />
          <span className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: 'var(--dome-text)' }}>
            {folder.title}
          </span>
        </button>
      )}

      {/* 3-dot menu button */}
      {!renaming && (hovered || menuOpen) && (
        <div className="absolute top-1.5 right-1.5">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={openMenu}
            className="flex items-center justify-center size-5 rounded-md transition-colors"
            style={{ color: 'var(--dome-text-muted)', background: menuOpen ? 'var(--dome-bg-hover)' : 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
            onMouseLeave={(e) => { if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <MoreVertical className="size-3" />
          </button>

          {menuOpen && menuPos && (
            <div
              role="menu"
              tabIndex={-1}
              className="fixed z-[var(--z-popover)] rounded-lg shadow-lg py-1 min-w-[150px]"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)', top: menuPos.top, right: menuPos.right }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {menuItem(<Pencil className="size-3" />, t('folder.rename'), () => { setRenaming(true); setRenameValue(folder.title ?? ''); })}
              {menuItem(<Palette className="size-3" />, t('folder.changeColor', 'Cambiar color'), () => {
                if (menuBtnRef.current) {
                  const rect = menuBtnRef.current.getBoundingClientRect();
                  setColorPickerPos({ top: rect.bottom + 4, left: Math.max(4, rect.right - 220) });
                }
              })}
              {menuItem(<FolderInput className="size-3" />, t('selection.move_to_project'), onMoveToProject)}
              <div style={{ height: 1, background: 'var(--dome-border)', margin: '3px 0' }} />
              {menuItem(<Trash2 className="size-3" />, t('folder.delete'), onDelete, true)}
            </div>
          )}
        </div>
      )}

      {/* Color picker popover */}
      {colorPickerPos && (
        <ColorPickerPopover
          pos={colorPickerPos}
          currentColor={color.startsWith('#') ? color : FOLDER_COLOR_DEFAULT}
          onSave={onChangeColor}
          onClose={() => setColorPickerPos(null)}
        />
      )}
    </div>
  );
}

// ─── FileRow ──────────────────────────────────────────────────────────────────

