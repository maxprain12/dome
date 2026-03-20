import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  Search,
  Settings,
  Moon,
  Sun,
  Home,
  Calendar,
  BookOpen,
  Tag,
  Zap,
  Store,
  Folder,
  FileText,
  Globe,
  File,
  Image,
  Music,
  Video,
  Presentation,
  RefreshCw,
  X,
  MoreHorizontal,
  Edit3,
  Trash2,
  FolderInput,
  FolderPlus,
  Check,
  Hash,
  Plus,
  NotebookPen,
  Link,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import type { Resource } from '@/lib/hooks/useResources';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function getResourceIcon(type: string) {
  switch (type) {
    case 'note': return <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'notebook': return <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'url': return <Globe className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'youtube':
    case 'video': return <Video className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'pdf':
    case 'document': return <File className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'image': return <Image className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'audio': return <Music className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'ppt': return <Presentation className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case 'folder': return <Folder className="w-3.5 h-3.5" strokeWidth={1.75} />;
    default: return <File className="w-3.5 h-3.5" strokeWidth={1.75} />;
  }
}

// ---------------------------------------------------------------------------
// Folder colors
// ---------------------------------------------------------------------------
const FOLDER_COLOR_OPTIONS = [
  { label: 'Oliva',    value: '#596037' },
  { label: 'Violeta',  value: '#7b76d0' },
  { label: 'Verde',    value: '#22c55e' },
  { label: 'Azul',     value: '#3b82f6' },
  { label: 'Gris',     value: '#6b7280' },
  { label: 'Rojo',     value: '#ef4444' },
  { label: 'Naranja',  value: '#f97316' },
  { label: 'Rosa',     value: '#ec4899' },
  { label: 'Amarillo', value: '#eab308' },
  { label: 'Cian',     value: '#06b6d4' },
];

const NAMED_FOLDER_COLORS: Record<string, string> = {
  blue: '#5B9BD5', purple: '#8B7EC8', green: '#5BA85A',
  yellow: '#D4A843', red: '#D05C5C', orange: '#D47B3F',
  pink: '#C45C8E', cyan: '#4BA3B5',
};

function parseMeta(resource: Resource): Record<string, unknown> {
  const m = resource.metadata;
  if (!m) return {};
  if (typeof m === 'string') { try { return JSON.parse(m) as Record<string, unknown>; } catch { return {}; } }
  return m as Record<string, unknown>;
}

function getFolderColor(resource: Resource): string {
  const color = parseMeta(resource).color as string | undefined;
  if (!color) return 'var(--dome-accent)';
  if (color.startsWith('#')) return color;
  return NAMED_FOLDER_COLORS[color] ?? 'var(--dome-accent)';
}

// ---------------------------------------------------------------------------
// Tree data
// ---------------------------------------------------------------------------
interface TreeNodeData {
  id: string;
  name: string;
  type: 'folder' | 'note' | 'notebook' | 'url' | 'youtube' | 'pdf' | 'document' | 'image' | 'audio' | 'video' | 'ppt' | 'file';
  children?: TreeNodeData[];
  resource?: Resource;
}

function buildTree(resources: Resource[]): TreeNodeData[] {
  const folderMap = new Map<string, TreeNodeData>();
  const roots: TreeNodeData[] = [];
  const folders = resources.filter((r) => r.type === 'folder');
  const nonFolders = resources.filter((r) => r.type !== 'folder');

  for (const f of folders) {
    folderMap.set(f.id, { id: f.id, name: f.title, type: 'folder', children: [], resource: f });
  }
  for (const r of nonFolders) {
    const node: TreeNodeData = { id: r.id, name: r.title, type: r.type as TreeNodeData['type'], resource: r };
    if (r.folder_id && folderMap.has(r.folder_id)) folderMap.get(r.folder_id)!.children!.push(node);
    else roots.push(node);
  }
  for (const f of folders) {
    const node = folderMap.get(f.id)!;
    if (f.folder_id && folderMap.has(f.folder_id)) folderMap.get(f.folder_id)!.children!.push(node);
    else roots.push(node);
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
interface CtxState {
  visible: boolean;
  x: number;
  y: number;
  resource: Resource | null;
}

interface ContextMenuProps {
  state: CtxState;
  onClose: () => void;
  onRename: (r: Resource) => void;
  onMove: (r: Resource) => void;
  onColorChange: (r: Resource, color: string) => void;
  onDelete: (r: Resource) => void;
  onNewFolder: (parentId: string | null) => void;
}

function ContextMenu({ state, onClose, onRename, onMove, onColorChange, onDelete, onNewFolder }: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);

  useEffect(() => {
    if (!state.visible) return;
    setShowColors(false);
    setHoveredColor(null);
    const handle = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('keydown', handleKey); };
  }, [state.visible, onClose]);

  if (!state.visible || !state.resource) return null;
  const r = state.resource;
  const isFolder = r.type === 'folder';
  const currentColor = parseMeta(r).color as string | undefined;

  const hoveredLabel = hoveredColor
    ? (FOLDER_COLOR_OPTIONS.find((o) => o.value === hoveredColor)?.label ?? null)
    : null;

  const menuWidth = 196;
  const left = Math.min(state.x, window.innerWidth - menuWidth - 8);
  const estimatedHeight = isFolder ? 320 : 200;
  const top = Math.min(state.y, window.innerHeight - estimatedHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] overflow-hidden"
      style={{
        left,
        top,
        width: menuWidth,
        background: 'var(--dome-surface)',
        border: '1px solid var(--dome-border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)',
      }}
    >
      {/* Resource label */}
      <div className="px-3 pt-2.5 pb-1.5" style={{ borderBottom: '1px solid var(--dome-border)' }}>
        <p className="truncate" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--dome-text-muted)' }}>
          {isFolder ? 'Carpeta' : r.type === 'note' ? 'Nota' : r.type === 'notebook' ? 'Cuaderno' : r.type === 'url' ? 'URL' : r.type === 'pdf' ? 'PDF' : 'Archivo'}
        </p>
        <p className="truncate mt-0.5" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--dome-text)' }}>{r.title}</p>
      </div>

      <div style={{ padding: '4px 0' }}>
        {/* Rename */}
        <CtxItem icon={<Edit3 className="w-3.5 h-3.5" />} label="Renombrar" onClick={() => { onRename(r); onClose(); }} />

        {/* Move */}
        <CtxItem icon={<FolderInput className="w-3.5 h-3.5" />} label="Mover a carpeta" onClick={() => { onMove(r); onClose(); }} />

        {/* New subfolder — folders only */}
        {isFolder && (
          <CtxItem icon={<FolderPlus className="w-3.5 h-3.5" />} label="Nueva subcarpeta" onClick={() => { onNewFolder(r.id); onClose(); }} />
        )}

        {/* Color picker — folders only */}
        {isFolder && (
          <>
            <div style={{ height: 1, background: 'var(--dome-border)', margin: '4px 6px' }} />
            <button
              type="button"
              className="flex items-center w-full text-left transition-colors"
              style={{
                gap: 8, padding: '6px 12px', fontSize: 12.5, border: 'none', cursor: 'pointer',
                color: 'var(--dome-text)',
                background: showColors ? 'var(--dome-bg-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { if (!showColors) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              onClick={() => setShowColors((s) => !s)}
            >
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
                style={{
                  background: currentColor?.startsWith('#') ? currentColor : 'var(--dome-accent)',
                  boxShadow: `0 0 0 1.5px ${currentColor?.startsWith('#') ? currentColor + '44' : 'transparent'}`,
                }}
              />
              <span className="flex-1" style={{ fontWeight: 500 }}>Color de carpeta</span>
              <ChevronDown
                className="w-3 h-3 shrink-0"
                style={{ color: 'var(--dome-text-muted)', transform: showColors ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}
              />
            </button>

            {showColors && (
              <div style={{ padding: '6px 12px 10px' }}>
                {/* Color grid */}
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {FOLDER_COLOR_OPTIONS.map((opt) => {
                    const isActive = currentColor === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { onColorChange(r, opt.value); onClose(); }}
                        onMouseEnter={() => setHoveredColor(opt.value)}
                        onMouseLeave={() => setHoveredColor(null)}
                        className="relative flex items-center justify-center transition-transform"
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: opt.value, border: 'none', cursor: 'pointer',
                          outline: isActive ? `2.5px solid ${opt.value}` : '2px solid transparent',
                          outlineOffset: isActive ? 2 : 0,
                          transform: hoveredColor === opt.value ? 'scale(1.18)' : 'scale(1)',
                          transition: 'transform 120ms, outline 120ms',
                          boxShadow: hoveredColor === opt.value ? `0 2px 8px ${opt.value}66` : 'none',
                        }}
                      >
                        {isActive && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>

                {/* Color label tooltip */}
                <div style={{ height: 16, display: 'flex', alignItems: 'center' }}>
                  {hoveredLabel ? (
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: hoveredColor ?? 'var(--dome-text-muted)',
                      transition: 'color 100ms',
                    }}>
                      {hoveredLabel}
                    </span>
                  ) : currentColor ? (
                    <span style={{ fontSize: 11, color: 'var(--dome-text-muted)' }}>
                      {FOLDER_COLOR_OPTIONS.find((o) => o.value === currentColor)?.label ?? 'Personalizado'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--dome-text-muted)' }}>{t('ui.no_color')}</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ height: 1, background: 'var(--dome-border)', margin: '4px 6px' }} />

        {/* Delete */}
        <CtxItem
          icon={<Trash2 className="w-3.5 h-3.5" />}
          label="Eliminar"
          onClick={() => { onDelete(r); onClose(); }}
          danger
        />
      </div>
    </div>
  );
}

// Shared context menu item
function CtxItem({ icon, label, onClick, danger = false }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      className="flex items-center w-full text-left transition-colors"
      style={{
        gap: 8, padding: '6px 12px', fontSize: 12.5, border: 'none', cursor: 'pointer',
        color: danger ? 'var(--dome-error, #ef4444)' : 'var(--dome-text)',
        background: hovered ? (danger ? 'rgba(239,68,68,0.08)' : 'var(--dome-bg-hover)') : 'transparent',
        fontWeight: 450,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <span style={{ opacity: 0.75, color: danger ? 'var(--dome-error, #ef4444)' : 'var(--dome-text-muted)', display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Move folder modal
// ---------------------------------------------------------------------------
function MoveFolderModal({ resource, allFolders, onConfirm, onClose }: {
  resource: Resource; allFolders: Resource[];
  onConfirm: (folderId: string | null) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(resource.folder_id ?? null);
  const available = allFolders.filter((f) => f.id !== resource.id);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl shadow-xl border flex flex-col" style={{ width: 300, maxHeight: 400, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <span className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>Mover "{resource.title}"</span>
          <button type="button" onClick={onClose} className="rounded flex items-center justify-center hover:bg-[var(--dome-bg-hover)]" style={{ width: 24, height: 24, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1.5">
          <button type="button" className="flex items-center gap-2 w-full text-left px-4 py-2 transition-colors"
            style={{ background: selected === null ? 'var(--dome-bg-hover)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--dome-text)' }}
            onClick={() => setSelected(null)}>
            <Hash className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            <span className="flex-1">{t('ui.no_folder_root')}</span>
            {selected === null && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
          </button>
          {available.map((f) => (
            <button key={f.id} type="button"
              className="flex items-center gap-2 w-full text-left px-4 py-2 transition-colors"
              style={{ background: selected === f.id ? 'var(--dome-bg-hover)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--dome-text)' }}
              onClick={() => setSelected(f.id)}
              onMouseEnter={(e) => { if (selected !== f.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { if (selected !== f.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
              <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: getFolderColor(f) }} />
              <span className="flex-1 truncate">{f.title}</span>
              {selected === f.id && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('common.cancel')}</button>
          <button type="button" onClick={() => { onConfirm(selected); onClose(); }} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'white' }}>{t('common.move')}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------
function DeleteConfirmModal({ resource, onConfirm, onClose }: {
  resource: Resource; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl shadow-xl border p-5 flex flex-col gap-3" style={{ width: 290, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}>
        <div>
          <p className="font-medium text-sm mb-1" style={{ color: 'var(--dome-text)' }}>
            {t('ui.delete_confirm', { type: resource.type === 'folder' ? 'folder' : 'resource' })}
          </p>
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {resource.type === 'folder' ? t('ui.delete_content_warning') : t('ui.delete_warning')}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('ui.cancel')}</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-error, #ef4444)', border: 'none', cursor: 'pointer', color: 'white' }}>{t('ui.delete')}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New folder modal
// ---------------------------------------------------------------------------
function NewFolderModal({ parentId, onConfirm, onClose }: {
  parentId: string | null; onConfirm: (name: string, parentId: string | null) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => { const t = name.trim(); if (t) { onConfirm(t, parentId); onClose(); } };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl shadow-xl border p-5 flex flex-col gap-3" style={{ width: 280, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}>
        <p className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>{t('ui.new_folder')}</p>
        <input ref={inputRef} type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder={t('ui.folder_name')} className="rounded-md px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }} />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('ui.cancel')}</button>
          <button type="button" onClick={submit} disabled={!name.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'white', opacity: name.trim() ? 1 : 0.5 }}>{t('ui.create')}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TreeNode — individual row with hover menu + inline rename + drag-and-drop
// ---------------------------------------------------------------------------
interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNodeData) => void;
  onOpenFolder: (folderId: string, title: string) => void;
  renameId: string | null;
  dragOverId: string | null;
  onContextMenu: (e: React.MouseEvent, r: Resource) => void;
  onRenameCommit: (id: string, newTitle: string) => void;
  onRenameCancel: () => void;
  onDragStart: (node: TreeNodeData) => void;
  onDragOver: (e: React.DragEvent, node: TreeNodeData) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetNode: TreeNodeData) => void;
  onDragEnd: () => void;
}

function TreeNode({
  node, depth, expandedIds, onToggle, onSelect, onOpenFolder, renameId, dragOverId,
  onContextMenu, onRenameCommit, onRenameCancel,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = isFolder && node.children && node.children.length > 0;
  const isRenaming = renameId === node.id;
  const isDragOver = dragOverId === node.id;
  const [hovered, setHovered] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) { setRenameValue(node.name); setTimeout(() => renameRef.current?.select(), 10); }
  }, [isRenaming, node.name]);

  const handleClick = () => {
    if (isRenaming) return;
    if (isFolder) {
      onToggle(node.id);
      onOpenFolder(node.id, node.name);
    } else {
      onSelect(node);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onRenameCommit(node.id, renameValue); }
    if (e.key === 'Escape') onRenameCancel();
  };

  const folderColor = isFolder && node.resource ? getFolderColor(node.resource) : 'var(--dome-accent)';

  let rowBg = 'transparent';
  if (isDragOver && isFolder) rowBg = `${folderColor}22`;
  else if (hovered) rowBg = 'var(--dome-bg-hover)';

  return (
    <div>
      <div
        className="flex items-center w-full relative rounded transition-colors"
        style={{
          paddingLeft: 8 + depth * 14,
          paddingRight: 4,
          height: 28,
          background: rowBg,
          minWidth: 0,
          outline: isDragOver && isFolder ? `1.5px dashed ${folderColor}` : 'none',
          outlineOffset: -1,
        }}
        draggable={!isRenaming}
        onDragStart={() => onDragStart(node)}
        onDragOver={(e) => onDragOver(e, node)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, node)}
        onDragEnd={onDragEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => { if (node.resource) { e.preventDefault(); onContextMenu(e, node.resource); } }}
      >
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center flex-1 text-left min-w-0"
          style={{ gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: hovered ? 'var(--dome-text)' : 'var(--dome-text-secondary)', padding: 0, minWidth: 0 }}
        >
          <span className="shrink-0 flex items-center justify-center" style={{ width: 14, height: 14 }}>
            {isFolder
              ? <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} strokeWidth={2.5} />
              : null}
          </span>

          {/* Folder icon with color swatch */}
          {isFolder ? (
            <span className="shrink-0 relative flex items-center justify-center">
              <Folder className="w-3.5 h-3.5" style={{ color: folderColor }} strokeWidth={1.75} fill={`${folderColor}33`} />
            </span>
          ) : (
            <span className="shrink-0" style={{ color: 'var(--dome-text-muted)' }}>
              {getResourceIcon(node.type)}
            </span>
          )}

          {isRenaming ? (
            <input
              ref={renameRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => onRenameCommit(node.id, renameValue)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 outline-none rounded px-1"
              style={{ fontSize: 12, background: 'var(--dome-surface)', border: '1px solid var(--dome-accent)', color: 'var(--dome-text)', minWidth: 0 }}
            />
          ) : (
            <span className="truncate flex-1" style={{ fontSize: 12, fontWeight: isFolder ? 500 : 400, color: isFolder ? folderColor : undefined }}>{node.name}</span>
          )}
        </button>

        {hovered && !isRenaming && node.resource && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (node.resource) onContextMenu(e, node.resource); }}
            className="shrink-0 flex items-center justify-center rounded-md transition-all"
            style={{ width: 20, height: 20, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)', flexShrink: 0 }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
            }}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div style={{ borderLeft: `1.5px solid ${folderColor}44`, marginLeft: 8 + depth * 14 + 7 }}>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onOpenFolder={onOpenFolder}
              renameId={renameId}
              dragOverId={dragOverId}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: check if `target` is inside `ancestor` in the tree
// ---------------------------------------------------------------------------
function isDescendant(target: TreeNodeData, ancestor: TreeNodeData): boolean {
  if (!ancestor.children) return false;
  for (const child of ancestor.children) {
    if (child.id === target.id || isDescendant(target, child)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// FileTree — tree container with all state and operations
// ---------------------------------------------------------------------------
interface FileTreeProps {
  resources: Resource[];
  onRefresh: () => void;
}

function FileTree({ resources, onRefresh }: FileTreeProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [ctxMenu, setCtxMenu] = useState<CtxState>({ visible: false, x: 0, y: 0, resource: null });
  const [renameId, setRenameId] = useState<string | null>(null);
  const [moveResource, setMoveResource] = useState<Resource | null>(null);
  const [deleteResource, setDeleteResource] = useState<Resource | null>(null);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null | undefined>(undefined);
  const [dragNode, setDragNode] = useState<TreeNodeData | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragEnterCountRef = useRef<Record<string, number>>({});

  const { openResourceTab, openFolderTab } = useTabStore.getState();
  const folders = resources.filter((r) => r.type === 'folder');

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const handleSelect = useCallback((node: TreeNodeData) => {
    if (node.resource) openResourceTab(node.id, node.type, node.name);
  }, [openResourceTab]);

  const handleOpenFolder = useCallback((folderId: string, title: string) => {
    openFolderTab(folderId, title);
  }, [openFolderTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, r: Resource) => {
    e.preventDefault();
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, resource: r });
  }, []);

  const handleRenameCommit = useCallback(async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) { setRenameId(null); return; }
    const r = resources.find((res) => res.id === id);
    if (r && trimmed !== r.title) {
      await window.electron?.db?.resources?.update({ id, title: trimmed, updated_at: Date.now() });
      onRefresh();
    }
    setRenameId(null);
  }, [resources, onRefresh]);

  const handleMoveConfirm = useCallback(async (folderId: string | null) => {
    if (!moveResource) return;
    await window.electron?.db?.resources?.moveToFolder(moveResource.id, folderId);
    setMoveResource(null);
    onRefresh();
  }, [moveResource, onRefresh]);

  const handleColorChange = useCallback(async (r: Resource, color: string) => {
    const meta = { ...parseMeta(r), color };
    await window.electron?.db?.resources?.update({ id: r.id, metadata: JSON.stringify(meta), updated_at: Date.now() });
    onRefresh();
  }, [onRefresh]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteResource) return;
    await window.electron?.resource?.delete(deleteResource.id);
    setDeleteResource(null);
    onRefresh();
  }, [deleteResource, onRefresh]);

  const handleNewFolderConfirm = useCallback(async (name: string, parentId: string | null) => {
    const now = Date.now();
    const result = await window.electron?.db?.resources?.create({
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'folder',
      title: name,
      folder_id: parentId,
      project_id: (resources[0]?.project_id) || 'default',
      content: null,
      created_at: now,
      updated_at: now,
    } as any);
    if (result?.success) {
      if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId));
      onRefresh();
    }
  }, [resources, onRefresh]);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((node: TreeNodeData) => {
    setDragNode(node);
    dragEnterCountRef.current = {};
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, target: TreeNodeData) => {
    if (!dragNode) return;
    if (dragNode.id === target.id) return;
    // Only allow drop on folders; also allow drop on root (handled separately)
    if (target.type !== 'folder') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== target.id) setDragOverId(target.id);
    // Auto-expand folder after hovering
    setExpandedIds((prev) => new Set(prev).add(target.id));
  }, [dragNode, dragOverId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, target: TreeNodeData) => {
    e.preventDefault();
    if (!dragNode || !dragNode.resource) { setDragOverId(null); setDragNode(null); return; }
    if (dragNode.id === target.id) { setDragOverId(null); setDragNode(null); return; }
    if (target.type !== 'folder') { setDragOverId(null); setDragNode(null); return; }
    // Don't move a folder into itself or its descendant
    if (dragNode.type === 'folder' && isDescendant(target, dragNode)) { setDragOverId(null); setDragNode(null); return; }
    await window.electron?.db?.resources?.moveToFolder(dragNode.id, target.id);
    setDragNode(null);
    setDragOverId(null);
    onRefresh();
  }, [dragNode, onRefresh]);

  const handleDragEnd = useCallback(() => {
    setDragNode(null);
    setDragOverId(null);
  }, []);

  const tree = buildTree(resources);
  const q = searchQuery.trim().toLowerCase();

  const filterTree = (nodes: TreeNodeData[]): TreeNodeData[] => {
    if (!q) return nodes;
    return nodes.reduce<TreeNodeData[]>((acc, node) => {
      const matches = node.name.toLowerCase().includes(q);
      const filteredChildren = node.children ? filterTree(node.children) : undefined;
      if (matches || (filteredChildren && filteredChildren.length > 0)) acc.push({ ...node, children: filteredChildren });
      return acc;
    }, []);
  };

  const filteredTree = filterTree(tree);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5 rounded px-2" style={{ height: 26, background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
          <Search className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={2} />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workspace.search_resources')} className="flex-1 bg-transparent outline-none border-none"
            style={{ fontSize: 11, color: 'var(--dome-text)', caretColor: 'var(--dome-accent)' }}
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredTree.length === 0 ? (
          <p className="text-center py-4" style={{ fontSize: 11, color: 'var(--dome-text-muted)' }}>
            {t('ui.no_results')}
          </p>
        ) : (
          filteredTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              onToggle={handleToggle}
              onSelect={handleSelect}
              onOpenFolder={handleOpenFolder}
              renameId={renameId}
              dragOverId={dragOverId}
              onContextMenu={handleContextMenu}
              onRenameCommit={handleRenameCommit}
              onRenameCancel={() => setRenameId(null)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>

      {/* Footer: refresh + new folder */}
      <div className="px-3 py-2 border-t flex items-center gap-1" style={{ borderColor: 'var(--dome-border)' }}>
        <button
          type="button"
          onClick={() => setNewFolderParentId(null)}
          className="flex items-center gap-1.5 flex-1 text-left px-2 py-1 rounded transition-colors"
          style={{ fontSize: 11, color: 'var(--dome-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
        >
          <FolderPlus className="w-3 h-3" /><span>{t('ui.new_folder')}</span>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
          style={{ fontSize: 11, color: 'var(--dome-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title={t('ui.refresh')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Context menu */}
      <ContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu((s) => ({ ...s, visible: false }))}
        onRename={(r) => setRenameId(r.id)}
        onMove={(r) => setMoveResource(r)}
        onColorChange={handleColorChange}
        onDelete={(r) => setDeleteResource(r)}
        onNewFolder={(parentId) => setNewFolderParentId(parentId)}
      />

      {moveResource && (
        <MoveFolderModal resource={moveResource} allFolders={folders}
          onConfirm={handleMoveConfirm} onClose={() => setMoveResource(null)} />
      )}
      {deleteResource && (
        <DeleteConfirmModal resource={deleteResource}
          onConfirm={handleDeleteConfirm} onClose={() => setDeleteResource(null)} />
      )}
      {newFolderParentId !== undefined && (
        <NewFolderModal parentId={newFolderParentId}
          onConfirm={handleNewFolderConfirm} onClose={() => setNewFolderParentId(undefined)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL input modal
// ---------------------------------------------------------------------------
function UrlInputModal({ onConfirm, onClose }: { onConfirm: (url: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const t = url.trim();
    if (t) { onConfirm(t); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl shadow-xl border p-5 flex flex-col gap-3" style={{ width: 320, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}>
        <p className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>{t('ui.add_url')}</p>
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder="https://..."
          className="rounded-md px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>{t('ui.cancel')}</button>
          <button type="button" onClick={submit} disabled={!url.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'white', opacity: url.trim() ? 1 : 0.5 }}>{t('ui.add')}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-resource dropdown
// ---------------------------------------------------------------------------
interface AddResourceMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCreateNote: () => void;
  onCreateNotebook: () => void;
  onAddUrl: () => void;
  onImportFile: () => void;
}

function AddResourceMenu({ x, y, onClose, onCreateNote, onCreateNotebook, onAddUrl, onImportFile }: AddResourceMenuProps) {
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
    { icon: <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />, label: 'Nota', action: onCreateNote },
    { icon: <NotebookPen className="w-3.5 h-3.5" strokeWidth={1.75} />, label: 'Notebook', action: onCreateNotebook },
    { icon: <Link className="w-3.5 h-3.5" strokeWidth={1.75} />, label: 'URL / Artículo', action: onAddUrl },
    { icon: <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />, label: 'Importar fichero', action: onImportFile },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] rounded-lg shadow-xl border overflow-hidden"
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
function timeAgo(ts: number): string {
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
interface UnifiedSidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
}

export default function UnifiedSidebar({ collapsed, onCollapse: _onCollapse }: UnifiedSidebarProps) {
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [newFolderInWorkspace, setNewFolderInWorkspace] = useState(false);

  const theme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);
  const activeSection = useAppStore((s) => s.homeSidebarSection);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const {
    openSettingsTab,
    openCalendarTab,
    openLearnTab,
    openTagsTab,
    openAgentsTab,
    openMarketplaceTab,
    activeTabId,
    tabs,
  } = useTabStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isDark = theme === 'dark';

  const fetchResources = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.resources) return;
    try {
      setLoading(true);
      const result = await window.electron.db.resources.getAll(500);
      if (result?.success && result.data) setResources(result.data as Resource[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const getDefaultProjectId = useCallback(() => {
    return resources.find((r) => r.project_id)?.project_id || 'default';
  }, [resources]);

  const handleCreateNote = useCallback(async () => {
    if (!window.electron?.db?.resources) return;
    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await window.electron.db.resources.create({
      id,
      type: 'note',
      title: 'Untitled Note',
      project_id: getDefaultProjectId(),
      content: '',
      created_at: now,
      updated_at: now,
    } as any);
    if (result?.success) {
      await fetchResources();
      useTabStore.getState().openResourceTab(id, 'note', 'Untitled Note');
    }
  }, [getDefaultProjectId, fetchResources]);

  const handleCreateNotebook = useCallback(async () => {
    if (!window.electron?.db?.resources) return;
    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const cells = [{ id: crypto.randomUUID(), type: 'code', source: '', outputs: [] }];
    const result = await window.electron.db.resources.create({
      id,
      type: 'notebook',
      title: 'Untitled Notebook',
      project_id: getDefaultProjectId(),
      content: JSON.stringify({ cells }),
      created_at: now,
      updated_at: now,
    } as any);
    if (result?.success) {
      await fetchResources();
      useTabStore.getState().openResourceTab(id, 'notebook', 'Untitled Notebook');
    }
  }, [getDefaultProjectId, fetchResources]);

  const handleAddUrl = useCallback(async (url: string) => {
    if (!window.electron?.db?.resources) return;
    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const title = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    const result = await window.electron.db.resources.create({
      id,
      type: 'url',
      title,
      project_id: getDefaultProjectId(),
      content: url,
      created_at: now,
      updated_at: now,
    } as any);
    if (result?.success) {
      await fetchResources();
      useTabStore.getState().openResourceTab(id, 'url', title ?? url);
    }
  }, [getDefaultProjectId, fetchResources]);

  const handleNewFolderAtRoot = useCallback(async (name: string) => {
    const now = Date.now();
    const result = await window.electron?.db?.resources?.create({
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'folder',
      title: name,
      folder_id: null,
      project_id: getDefaultProjectId(),
      content: null,
      created_at: now,
      updated_at: now,
    } as any);
    if (result?.success) fetchResources();
  }, [getDefaultProjectId, fetchResources]);

  const handleImportFile = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.import) return;
    const filePaths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (!filePaths || filePaths.length === 0) return;
    const projectId = getDefaultProjectId();
    await Promise.all(filePaths.map((fp: string) => {
      const ext = fp.split('.').pop()?.toLowerCase() ?? '';
      const type = ['mp4','mov','avi','mkv','webm'].includes(ext) ? 'video'
        : ['mp3','wav','ogg','m4a','flac'].includes(ext) ? 'audio'
        : ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? 'image'
        : ['pptx','ppt'].includes(ext) ? 'ppt'
        : ['ipynb'].includes(ext) ? 'notebook'
        : 'document';
      return window.electron.resource.import(fp, projectId, type);
    }));
    fetchResources();
  }, [getDefaultProjectId, fetchResources]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    const u1 = window.electron.on('resource:created', fetchResources);
    const u2 = window.electron.on('resource:updated', fetchResources);
    const u3 = window.electron.on('resource:deleted', fetchResources);
    return () => { u1?.(); u2?.(); u3?.(); };
  }, [fetchResources]);

  const navItems = [
    { id: 'library', label: 'Home', icon: <Home className="w-4 h-4" strokeWidth={1.75} />, action: 'section' as const },
    { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" strokeWidth={1.75} />, action: 'tab' as const, tabAction: openCalendarTab, tabType: 'calendar' },
    { id: 'learn', label: 'Learn', icon: <BookOpen className="w-4 h-4" strokeWidth={1.75} />, action: 'tab' as const, tabAction: openLearnTab, tabType: 'learn' },
    { id: 'tags', label: 'Tags', icon: <Tag className="w-4 h-4" strokeWidth={1.75} />, action: 'tab' as const, tabAction: openTagsTab, tabType: 'tags' },
    { id: 'agents', label: 'Agents', icon: <Zap className="w-4 h-4" strokeWidth={1.75} />, action: 'tab' as const, tabAction: openAgentsTab, tabType: 'agents' },
    { id: 'marketplace', label: 'Marketplace', icon: <Store className="w-4 h-4" strokeWidth={1.75} />, action: 'tab' as const, tabAction: openMarketplaceTab, tabType: 'marketplace' },
  ];

  const getIsActive = (item: typeof navItems[0]) => {
    if (item.action === 'tab') return activeTab?.type === item.tabType;
    return activeTab?.type === 'home' && item.id === activeSection;
  };

  const handleNavClick = (item: typeof navItems[0]) => {
    if (item.action === 'tab' && item.tabAction) { item.tabAction(); return; }
    if (item.action === 'section') {
      setSection(item.id as typeof activeSection);
      const { activateTab, tabs: currentTabs } = useTabStore.getState();
      const homeTab = currentTabs.find((t) => t.id === 'home');
      if (homeTab && activeTabId !== 'home') activateTab('home');
    }
  };

  if (collapsed) return null;

  return (
    <aside
      className="flex flex-col h-full relative shrink-0 overflow-hidden"
      style={{ width: 260, minWidth: 260, background: 'var(--dome-sidebar-bg)', borderRight: '1px solid var(--dome-border)' }}
    >
      {/* Nav */}
      <div className="shrink-0 px-2 pt-2">
        {navItems.map((item) => {
          const isActive = getIsActive(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              className="flex items-center w-full text-left transition-colors duration-150 rounded-md"
              style={{
                gap: 8, paddingLeft: 8, paddingRight: 8, height: 30, fontSize: 12.5, fontWeight: 500,
                background: isActive ? 'var(--dome-surface)' : 'transparent',
                color: isActive ? 'var(--dome-text)' : 'var(--dome-text-secondary)',
                border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Workspace tree */}
      <div className="flex-1 overflow-y-auto">
        <div className="border-b" style={{ borderColor: 'var(--dome-border)' }}>
          {/* Header row */}
          <div className="flex items-center px-2 py-1.5 gap-0.5">
            <button
              onClick={() => setWorkspaceOpen(!workspaceOpen)}
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left rounded-md px-1 py-0.5 transition-colors"
              style={{ color: 'var(--dome-text)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${workspaceOpen ? '' : '-rotate-90'}`} strokeWidth={2.5} />
              <span>Workspace</span>
            </button>

            {/* New resource button */}
            <button
              type="button"
              title="Nuevo recurso"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                setAddMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
              className="flex items-center justify-center rounded transition-colors shrink-0"
              style={{ width: 22, height: 22, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>

            {/* New folder button */}
            <button
              type="button"
              title="Nueva carpeta"
              onClick={() => setNewFolderInWorkspace(true)}
              className="flex items-center justify-center rounded transition-colors shrink-0"
              style={{ width: 22, height: 22, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
            >
              <FolderPlus className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
          {workspaceOpen && (
            <div className="pb-2">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                </div>
              ) : (
                <FileTree resources={resources} onRefresh={fetchResources} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add resource dropdown */}
      {addMenu && (
        <AddResourceMenu
          x={addMenu.x}
          y={addMenu.y}
          onClose={() => setAddMenu(null)}
          onCreateNote={handleCreateNote}
          onCreateNotebook={handleCreateNotebook}
          onAddUrl={() => setShowUrlInput(true)}
          onImportFile={handleImportFile}
        />
      )}

      {/* URL input modal */}
      {showUrlInput && (
        <UrlInputModal
          onConfirm={handleAddUrl}
          onClose={() => setShowUrlInput(false)}
        />
      )}

      {/* New folder at root */}
      {newFolderInWorkspace && (
        <NewFolderModal
          parentId={null}
          onConfirm={(name) => handleNewFolderAtRoot(name)}
          onClose={() => setNewFolderInWorkspace(false)}
        />
      )}

      {/* Footer */}
      <div className="shrink-0 px-2 py-2" style={{ borderTop: '1px solid var(--dome-border)' }}>
        <button
          type="button"
          onClick={openSettingsTab}
          className="flex items-center gap-2 w-full text-left transition-colors rounded-md px-2 py-1.5"
          style={{ fontSize: 12, color: 'var(--dome-text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <Settings className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span>Settings</span>
        </button>
        <div className="flex items-center justify-between px-2 mt-1">
          <span style={{ fontSize: 10, color: 'var(--dome-text-muted)', opacity: 0.6 }}>Dome v2</span>
          <button
            type="button"
            onClick={() => updateTheme(isDark ? 'light' : 'dark')}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: 24, height: 24, background: 'transparent', color: 'var(--dome-text-muted)', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" strokeWidth={1.75} /> : <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
