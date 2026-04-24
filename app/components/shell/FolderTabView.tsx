import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Modal, ScrollArea, Stack, UnstyledButton, Text, Group, Button } from '@mantine/core';
import { formatDistanceToNow } from 'date-fns';
import {
  FolderOpen, Folder, FileText, FileEdit, BookOpen, Globe, File as FileIcon,
  Image, Music, Video, Plus, Home, ChevronRight, FileQuestion,
  MoreVertical, Trash2, Pencil, X, Check, Presentation, Upload, Link2, ChevronDown,
  Palette, FolderInput,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResources, type Resource } from '@/lib/hooks/useResources';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import MoveToProjectModal, { filterMoveProjectRoots } from '@/components/workspace/MoveToProjectModal';
import SelectionActionBar from '@/components/home/SelectionActionBar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolderTabViewProps {
  folderId: string;
  folderTitle: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFolderColor(folder: Resource): string {
  const meta = folder.metadata as { color?: string } | undefined;
  return meta?.color ?? 'var(--dome-text-muted)';
}

function ResourceTypeIcon({ type, className }: { type: string; className?: string }) {
  const cls = className ?? 'w-4 h-4 shrink-0';
  switch (type) {
    case 'note':     return <FileEdit className={cls} />;
    case 'notebook': return <BookOpen className={cls} />;
    case 'url':      return <Globe className={cls} />;
    case 'image':    return <Image className={cls} />;
    case 'audio':    return <Music className={cls} />;
    case 'video':    return <Video className={cls} />;
    case 'pdf':      return <FileIcon className={cls} />;
    case 'ppt':      return <Presentation className={cls} />;
    default:         return <FileQuestion className={cls} />;
  }
}

const TYPE_LABELS: Record<string, string> = {
  note: 'Nota', notebook: 'Cuaderno', url: 'URL',
  pdf: 'PDF', image: 'Imagen', video: 'Video',
  audio: 'Audio', document: 'Documento', ppt: 'Presentación',
};

const TYPE_COLORS: Record<string, string> = {
  note: 'var(--accent)', notebook: '#3b82f6', url: '#10b981',
  pdf: 'var(--error)', image: '#f59e0b', video: '#ec4899', audio: '#8b5cf6', ppt: '#d47b3f',
};

// ─── ColorPickerPopover ───────────────────────────────────────────────────────

const SWATCHES = [
  '#596037', '#6d7a42', '#7d8b52', '#8a9668',
  '#7b76d0', '#998eec', '#3b82f6', '#22c55e',
  '#f97316', '#ef4444', '#ec4899', '#6b7280',
];

function ColorPickerPopover({
  pos, currentColor, onSave, onClose,
}: {
  pos: { top: number; left: number };
  currentColor: string;
  onSave: (color: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[var(--z-popover)] rounded-xl shadow-lg p-2.5"
      style={{ top: pos.top, left: pos.left, background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-6 gap-1.5">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => { onSave(color); onClose(); }}
            className="w-6 h-6 rounded-md transition-all hover:scale-110"
            style={{
              backgroundColor: color,
              border: currentColor.toLowerCase() === color.toLowerCase()
                ? '2px solid var(--dome-accent)'
                : '2px solid transparent',
              outline: currentColor.toLowerCase() === color.toLowerCase()
                ? '1px solid var(--dome-accent)'
                : 'none',
              outlineOffset: 1,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── SubfolderCard ────────────────────────────────────────────────────────────

function SubfolderCard({
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
        <div
          className="absolute left-2 top-2 z-[2] flex items-center"
          onClick={(e) => { e.stopPropagation(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
            className="rounded border cursor-pointer"
            style={{ accentColor: 'var(--dome-accent)' }}
            aria-label={t('selection.deselect')}
          />
        </div>
      ) : null}
      {/* Main clickable area */}
      {renaming ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Folder className="w-4 h-4 shrink-0" style={{ color }} />
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
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setRenaming(false); setRenameValue(folder.title ?? ''); }}
            style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X className="w-3.5 h-3.5" />
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
          <Folder className="w-4 h-4 shrink-0" style={{ color }} />
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
            className="flex items-center justify-center w-5 h-5 rounded-md transition-colors"
            style={{ color: 'var(--dome-text-muted)', background: menuOpen ? 'var(--dome-bg-hover)' : 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
            onMouseLeave={(e) => { if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <MoreVertical className="w-3 h-3" />
          </button>

          {menuOpen && menuPos && (
            <div
              className="fixed z-[var(--z-popover)] rounded-lg shadow-lg py-1 min-w-[150px]"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)', top: menuPos.top, right: menuPos.right }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {menuItem(<Pencil className="w-3 h-3" />, t('folder.rename'), () => { setRenaming(true); setRenameValue(folder.title ?? ''); })}
              {menuItem(<Palette className="w-3 h-3" />, t('folder.changeColor', 'Cambiar color'), () => {
                if (menuBtnRef.current) {
                  const rect = menuBtnRef.current.getBoundingClientRect();
                  setColorPickerPos({ top: rect.bottom + 4, left: Math.max(4, rect.right - 220) });
                }
              })}
              {menuItem(<FolderInput className="w-3 h-3" />, t('selection.move_to_project'), onMoveToProject)}
              <div style={{ height: 1, background: 'var(--dome-border)', margin: '3px 0' }} />
              {menuItem(<Trash2 className="w-3 h-3" />, t('folder.delete'), onDelete, true)}
            </div>
          )}
        </div>
      )}

      {/* Color picker popover */}
      {colorPickerPos && (
        <ColorPickerPopover
          pos={colorPickerPos}
          currentColor={color.startsWith('#') ? color : '#596037'}
          onSave={onChangeColor}
          onClose={() => setColorPickerPos(null)}
        />
      )}
    </div>
  );
}

// ─── FileRow ──────────────────────────────────────────────────────────────────

function FileRow({
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
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeColor }} />
      <div style={{ color: typeColor }}>
        <ResourceTypeIcon type={file.type} />
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
            autoFocus
            className="flex-1 text-[13px] font-medium rounded px-2 py-0.5 outline-none"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-accent)', color: 'var(--dome-text)' }}
          />
          <button type="button" onClick={commitRename} style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setRenaming(false)} style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X className="w-3.5 h-3.5" />
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
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && menuPos && (
            <div
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
                <Pencil className="w-3 h-3" /> {t('folder.rename')}
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onMoveToProject(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                style={{ color: 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <FolderInput className="w-3 h-3" /> {t('selection.move_to_project')}
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                style={{ color: 'var(--dome-error, #ef4444)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <Trash2 className="w-3 h-3" /> {t('folder.delete')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NewFolderInline ──────────────────────────────────────────────────────────

function NewFolderInline({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
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
        <Folder className="w-4 h-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
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
          className="flex items-center justify-center w-6 h-6 rounded-md transition-colors disabled:opacity-40"
          style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: value.trim() ? 'pointer' : 'default' }}
          onMouseEnter={(e) => { if (value.trim()) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,111,205,0.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
          style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── AddMenu ─────────────────────────────────────────────────────────────────

function AddMenu({ onNewNote, onNewFolder, onUpload, onAddUrl }: {
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
          color: 'var(--dome-on-accent, #fff)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(124,111,205,0.35)',
        }}
      >
        <Plus className="w-3.5 h-3.5" />
        {t('folder.addBtn', 'Añadir')}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1.5 z-[var(--z-popover)] rounded-xl shadow-xl py-1.5 min-w-[200px]"
          style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          {item(<FileText className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />, t('toolbar.note', 'Nueva nota'), onNewNote)}
          {item(<Upload className="w-4 h-4" style={{ color: 'var(--accent)' }} />, t('toolbar.import', 'Subir archivo'), onUpload)}
          {item(<Link2 className="w-4 h-4" style={{ color: 'var(--success)' }} />, t('toolbar.link', 'Añadir enlace'), onAddUrl)}
          <div className="my-1" style={{ height: 1, background: 'var(--dome-border)' }} />
          {item(<Folder className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />, t('folder.newFolderBtn', 'Nueva carpeta'), onNewFolder)}
        </div>
      )}
    </div>
  );
}

// ─── FolderTabView ────────────────────────────────────────────────────────────

export default function FolderTabView({ folderId, folderTitle }: FolderTabViewProps) {
  const { t } = useTranslation();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [moveProjectIds, setMoveProjectIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [folderPickOpen, setFolderPickOpen] = useState(false);
  const showSelectionChrome = selectedIds.size > 0;

  // Current folder header editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [headerHovered, setHeaderHovered] = useState(false);
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const {
    folders: subfolders,
    nonFolderResources: files,
    isLoading,
    createResource,
    deleteResource,
    updateResource,
    getFolderById,
    getBreadcrumbPath,
    refetch,
    allFolders,
    moveToFolder,
  } = useResources({ folderId, sortBy: 'updated_at', sortOrder: 'desc' });

  const resourceMapForSelection = useMemo(() => {
    const m = new Map<string, Resource>();
    for (const f of subfolders) m.set(f.id, f);
    for (const f of files) m.set(f.id, f);
    for (const p of getBreadcrumbPath(folderId)) m.set(p.id, p);
    const cur = getFolderById(folderId);
    if (cur) m.set(cur.id, cur);
    return m;
  }, [subfolders, files, folderId, getBreadcrumbPath, getFolderById]);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const handleBulkMoveToFolder = useCallback(
    async (targetFolderId: string | null) => {
      const roots = filterMoveProjectRoots(selectedIds, resourceMapForSelection);
      for (const rid of roots) {
        const ok = await moveToFolder(rid, targetFolderId);
        if (!ok) break;
      }
      setSelectedIds(new Set());
      setFolderPickOpen(false);
      await refetch();
    },
    [selectedIds, resourceMapForSelection, moveToFolder, refetch],
  );

  const handleBulkDelete = useCallback(async () => {
    const n = selectedIds.size;
    if (!window.confirm(t('selection.bulk_delete_confirm', { count: n }))) return;
    const res = await window.electron?.db?.resources?.bulkDelete([...selectedIds]);
    if (res?.success) {
      setSelectedIds(new Set());
      await refetch();
    }
  }, [selectedIds, refetch, t]);

  const { openResourceTab, openFolderTab, activateTab, updateTab } = useTabStore();
  const setCurrentFolderId = useAppStore((s) => s.setCurrentFolderId);
  const currentProject = useAppStore((s) => s.currentProject);

  // Keep app store in sync so Many AI knows which folder is active
  useEffect(() => {
    setCurrentFolderId(folderId);
    return () => { setCurrentFolderId(null); };
  }, [folderId, setCurrentFolderId]);

  const currentFolder = getFolderById(folderId);
  const effectiveProjectId = currentFolder?.project_id ?? currentProject?.id ?? 'default';

  const folderTargetsForMove = useMemo(
    () =>
      allFolders.filter(
        (f) =>
          f.project_id === effectiveProjectId &&
          f.id !== folderId &&
          !selectedIds.has(f.id),
      ),
    [allFolders, effectiveProjectId, folderId, selectedIds],
  );

  const breadcrumb = useMemo(
    () => getBreadcrumbPath(folderId).filter((f) => f.id !== folderId),
    [folderId, getBreadcrumbPath],
  );
  const folderColor = currentFolder ? getFolderColor(currentFolder) : 'var(--dome-accent)';
  const folderColorHex = folderColor.startsWith('#') ? folderColor : null;

  // Sync stored color to tab on mount and whenever it changes
  useEffect(() => {
    if (folderColorHex) updateTab(`folder:${folderId}`, { color: folderColorHex });
  }, [folderId, folderColorHex, updateTab]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const startEditTitle = () => {
    setTitleValue(currentFolder?.title ?? folderTitle);
    setEditingTitle(true);
  };

  const commitTitle = async () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== (currentFolder?.title ?? folderTitle)) {
      await updateResource(folderId, { title: trimmed });
      updateTab(`folder:${folderId}`, { title: trimmed });
    }
    setEditingTitle(false);
  };

  const handleCurrentFolderColor = async (color: string) => {
    const currentMeta = (currentFolder?.metadata as Record<string, unknown>) ?? {};
    await updateResource(folderId, { metadata: { ...currentMeta, color } });
    updateTab(`folder:${folderId}`, { color });
    setColorPickerPos(null);
  };

  const openCurrentFolderColorPicker = () => {
    if (colorBtnRef.current) {
      const rect = colorBtnRef.current.getBoundingClientRect();
      setColorPickerPos({ top: rect.bottom + 8, left: rect.left });
    }
  };

  const handleCreateFolder = useCallback(async (name: string) => {
    await createResource({ type: 'folder', title: name, project_id: effectiveProjectId, content: '', folder_id: folderId });
    setCreatingFolder(false);
  }, [createResource, effectiveProjectId, folderId]);

  const handleNewNote = useCallback(async () => {
    if (!window.electron?.db?.resources?.create) return;
    const now = Date.now();
    const res = {
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'note' as const,
      title: t('dashboard.untitled_note', 'Nota sin título'),
      content: '',
      project_id: effectiveProjectId,
      folder_id: folderId,
      created_at: now,
      updated_at: now,
    };
    const result = await window.electron.db.resources.create(res);
    if (result.success && result.data) {
      openResourceTab(result.data.id, 'note', result.data.title);
    }
  }, [effectiveProjectId, folderId, t, openResourceTab]);

  const handleUpload = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
    const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (paths?.length) await window.electron.resource.importMultiple(paths, effectiveProjectId);
  }, [effectiveProjectId]);

  const handleAddUrl = useCallback(() => {
    const url = prompt(t('command.please_enter_url', 'Introduce una URL'));
    if (url && window.electron?.db?.resources?.create) {
      const now = Date.now();
      void window.electron.db.resources.create({
        id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'url',
        title: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        project_id: effectiveProjectId,
        folder_id: folderId,
        content: url,
        created_at: now,
        updated_at: now,
      });
    }
  }, [effectiveProjectId, folderId, t]);

  const handleDeleteFile = useCallback(async (id: string) => {
    if (!window.confirm(t('folder.confirmDelete'))) return;
    await deleteResource(id);
  }, [deleteResource, t]);

  const handleRenameFile = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
  }, [updateResource]);

  const handleSubfolderRename = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
    updateTab(`folder:${id}`, { title: newTitle });
  }, [updateResource, updateTab]);

  const handleSubfolderDelete = useCallback(async (id: string) => {
    if (!window.confirm(t('folder.confirmDeleteFolder', '¿Eliminar esta carpeta y todo su contenido?'))) return;
    await deleteResource(id);
  }, [deleteResource, t]);

  const handleSubfolderColor = useCallback(async (id: string, color: string, folder: Resource) => {
    const currentMeta = (folder.metadata as Record<string, unknown>) ?? {};
    await updateResource(id, { metadata: { ...currentMeta, color } });
    updateTab(`folder:${id}`, { color });
  }, [updateResource, updateTab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--dome-border)', borderTopColor: 'var(--dome-accent)' }} />
      </div>
    );
  }

  const isEmpty = subfolders.length === 0 && files.length === 0 && !creatingFolder;

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
      <div className="max-w-4xl mx-auto w-full px-8 py-6 flex flex-col gap-6">

        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1 flex-wrap" style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>
          <button
            type="button"
            onClick={() => activateTab('home')}
            className="flex items-center gap-1 hover:text-[var(--dome-text)] transition-colors"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <Home className="w-3 h-3" />
            <span>{t('common.home')}</span>
          </button>
          {breadcrumb.map((folder) => (
            <>
              <ChevronRight key={`sep-${folder.id}`} className="w-3 h-3 shrink-0" />
              <button
                key={folder.id}
                type="button"
                onClick={() => openFolderTab(folder.id, folder.title, getFolderColor(folder))}
                className="hover:text-[var(--dome-text)] transition-colors truncate"
                style={{ maxWidth: 120, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                title={folder.title}
              >
                {folder.title}
              </button>
            </>
          ))}
          {breadcrumb.length > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
          <span style={{ color: 'var(--dome-text)' }}>{currentFolder?.title ?? folderTitle}</span>
        </nav>

        {/* ── Folder header ── */}
        <div
          className="flex items-start justify-between gap-4"
          onMouseEnter={() => setHeaderHovered(true)}
          onMouseLeave={() => setHeaderHovered(false)}
        >
          <div className="flex items-center gap-3">
            {/* Clickable color icon */}
            <button
              ref={colorBtnRef}
              type="button"
              onClick={openCurrentFolderColorPicker}
              title={t('folder.changeColor', 'Cambiar color')}
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all"
              style={{
                background: folderColorHex ? `${folderColorHex}20` : 'var(--dome-bg-hover)',
                border: 'none',
                cursor: 'pointer',
                outline: colorPickerPos ? `2px solid ${folderColor}` : 'none',
                outlineOffset: 2,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = folderColorHex ? `${folderColorHex}35` : 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = folderColorHex ? `${folderColorHex}20` : 'var(--dome-bg-hover)'; }}
            >
              <FolderOpen className="w-6 h-6" style={{ color: folderColor }} />
            </button>

            <div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTitle();
                      if (e.key === 'Escape') setEditingTitle(false);
                    }}
                    className="text-xl font-semibold outline-none rounded-lg px-2 py-0.5"
                    style={{ color: 'var(--dome-text)', background: 'var(--dome-bg)', border: '1.5px solid var(--dome-accent)' }}
                  />
                  <button type="button" onClick={commitTitle}
                    className="flex items-center justify-center w-7 h-7 rounded-md"
                    style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setEditingTitle(false)}
                    className="flex items-center justify-center w-7 h-7 rounded-md"
                    style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <h1 className="text-xl font-semibold" style={{ color: 'var(--dome-text)' }}>
                    {currentFolder?.title ?? folderTitle}
                  </h1>
                  {headerHovered && (
                    <button
                      type="button"
                      onClick={startEditTitle}
                      title={t('folder.rename')}
                      className="flex items-center justify-center w-6 h-6 rounded-md transition-colors opacity-60 hover:opacity-100"
                      style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                {t('folder.itemCount', { count: subfolders.length + files.length })}
                {subfolders.length > 0 && ` · ${t('folder.subfolderCount', { count: subfolders.length })}`}
              </p>
            </div>
          </div>

          {/* ── Actions ── */}
          <AddMenu
            onNewNote={handleNewNote}
            onNewFolder={() => setCreatingFolder(true)}
            onUpload={handleUpload}
            onAddUrl={handleAddUrl}
          />
        </div>

        <SelectionActionBar
          count={selectedIds.size}
          onMoveToFolder={() => setFolderPickOpen(true)}
          onMoveToProject={() =>
            setMoveProjectIds([...filterMoveProjectRoots(selectedIds, resourceMapForSelection)])
          }
          onDelete={() => void handleBulkDelete()}
          onDeselect={() => setSelectedIds(new Set())}
        />

        {/* ── Current folder color picker popover ── */}
        {colorPickerPos && (
          <ColorPickerPopover
            pos={colorPickerPos}
            currentColor={folderColorHex ?? 'var(--accent)'}
            onSave={handleCurrentFolderColor}
            onClose={() => setColorPickerPos(null)}
          />
        )}

        {/* ── Empty state ── */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--dome-surface)' }}>
              <FolderOpen className="w-8 h-8" style={{ color: 'var(--dome-text-muted)', opacity: 0.4 }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{t('folder.emptyFolder')}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--dome-text-muted)' }}>{t('folder.emptyFolderHint')}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleNewNote}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,111,205,0.3)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('toolbar.note', 'Nueva nota')}
              </button>
              <button
                type="button"
                onClick={handleUpload}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-border)'; }}
              >
                <Upload className="w-3.5 h-3.5" />
                {t('toolbar.import', 'Subir archivo')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Subfolders ── */}
            {(subfolders.length > 0 || creatingFolder) && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('folder.foldersHeading')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {subfolders.map((folder) => (
                    <SubfolderCard
                      key={folder.id}
                      folder={folder}
                      onClick={() => openFolderTab(folder.id, folder.title, getFolderColor(folder))}
                      onRename={(newTitle) => handleSubfolderRename(folder.id, newTitle)}
                      onDelete={() => handleSubfolderDelete(folder.id)}
                      onChangeColor={(color) => handleSubfolderColor(folder.id, color, folder)}
                      onMoveToProject={() => setMoveProjectIds([folder.id])}
                      selected={selectedIds.has(folder.id)}
                      showSelectionChrome={showSelectionChrome}
                      onToggleSelect={(e) => {
                        e.stopPropagation();
                        toggleSelectId(folder.id);
                      }}
                    />
                  ))}
                  {creatingFolder && (
                    <NewFolderInline onConfirm={handleCreateFolder} onCancel={() => setCreatingFolder(false)} />
                  )}
                </div>
              </section>
            )}

            {/* ── Files ── */}
            {files.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('folder.filesHeading')}
                </h2>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--dome-border)' }}>
                  {files.map((file, idx) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      isLast={idx === files.length - 1}
                      onOpen={() => openResourceTab(file.id, file.type, file.title ?? 'Sin título')}
                      onDelete={() => handleDeleteFile(file.id)}
                      onRename={(newTitle) => handleRenameFile(file.id, newTitle)}
                      onMoveToProject={() => setMoveProjectIds([file.id])}
                      selected={selectedIds.has(file.id)}
                      showSelectionChrome={showSelectionChrome}
                      onToggleSelect={(e) => {
                        e.stopPropagation();
                        toggleSelectId(file.id);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

          </>
        )}

      </div>

      <Modal
        opened={folderPickOpen}
        onClose={() => setFolderPickOpen(false)}
        title={t('selection.move_to_folder')}
        centered
        size="sm"
      >
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t('selection.items_selected_other', { count: selectedIds.size })}
          </Text>
          <ScrollArea.Autosize mah={280}>
            <Stack gap={4}>
              <UnstyledButton
                type="button"
                onClick={() => void handleBulkMoveToFolder(null)}
                p="sm"
                style={{
                  borderRadius: 8,
                  border: '1px solid var(--dome-border)',
                  textAlign: 'left',
                  background: 'var(--dome-surface)',
                }}
              >
                <Text size="sm" fw={500}>
                  {t('selection.move_to_root')}
                </Text>
              </UnstyledButton>
              {folderTargetsForMove.map((f) => (
                <UnstyledButton
                  key={f.id}
                  type="button"
                  onClick={() => void handleBulkMoveToFolder(f.id)}
                  p="sm"
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--dome-border)',
                    textAlign: 'left',
                    background: 'var(--dome-surface)',
                  }}
                >
                  <Text size="sm" fw={500} truncate>
                    {f.title}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setFolderPickOpen(false)}>
              {t('common.cancel')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <MoveToProjectModal
        opened={moveProjectIds.length > 0}
        onClose={() => setMoveProjectIds([])}
        resourceIds={moveProjectIds}
        resourcesById={resourceMapForSelection}
        onCompleted={() => void refetch()}
      />
    </div>
  );
}
