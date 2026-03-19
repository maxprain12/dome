import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Home,
  Calendar,
  Sparkles,
  WalletCards,
  Tag,
  Zap,
  Store,
  Settings,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  BookOpen,
  Globe,
  File,
  Image,
  Search,
  Hash,
  Music,
  Video,
  Presentation,
  ChevronLeft,
  HelpCircle,
  Bell,
  Moon,
  Sun,
  MessageSquare,
  Plus,
  MoreHorizontal,
  Edit3,
  Trash2,
  FolderInput,
  Check,
  X,
  FolderPlus,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useCalendarStore } from '@/lib/store/useCalendarStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { startDomeTour } from '@/lib/tour/domeTour';
import WindowControls from '@/components/ui/WindowControls';
import { buildFolderTree, type FolderNode } from '@/lib/utils/folder-tree';
import type { Resource } from '@/lib/hooks/useResources';

const SIDEBAR_ICON_WIDTH = 52;

interface DomeSidebarProps {
  width: number;
  collapsed: boolean;
  onWidthChange: (w: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
  sidebarRef: React.RefObject<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// Resource type → icon
// ---------------------------------------------------------------------------
function getResourceIcon(type: string) {
  switch (type) {
    case 'note':
      return <FileText className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'notebook':
      return <BookOpen className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'url':
      return <Globe className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'youtube':
      return <Video className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'pdf':
    case 'document':
    case 'docx':
      return <File className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'image':
      return <Image className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'audio':
      return <Music className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'ppt':
      return <Presentation className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    case 'video':
      return <Video className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
    default:
      return <File className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />;
  }
}

// ---------------------------------------------------------------------------
// Folder color helper (reads metadata.color)
// ---------------------------------------------------------------------------
const FOLDER_COLOR_OPTIONS = [
  { label: 'Oliva',   value: '#596037' },
  { label: 'Violeta', value: '#7b76d0' },
  { label: 'Verde',   value: '#22c55e' },
  { label: 'Azul',    value: '#3b82f6' },
  { label: 'Gris',    value: '#6b7280' },
  { label: 'Rojo',    value: '#ef4444' },
  { label: 'Naranja', value: '#f97316' },
  { label: 'Rosa',    value: '#ec4899' },
];

// Legacy named-color map for backwards compatibility
const NAMED_FOLDER_COLORS: Record<string, string> = {
  blue: '#5B9BD5', purple: '#8B7EC8', green: '#5BA85A',
  yellow: '#D4A843', red: '#D05C5C', orange: '#D47B3F',
  pink: '#C45C8E', cyan: '#4BA3B5',
};

function getFolderColor(resource: Resource): string {
  const color = resource.metadata?.color as string | undefined;
  if (!color) return 'var(--dome-accent)';
  if (color.startsWith('#')) return color;
  return NAMED_FOLDER_COLORS[color] ?? 'var(--dome-accent)';
}

// ---------------------------------------------------------------------------
// SidebarContextMenu — fixed-position context menu
// ---------------------------------------------------------------------------
interface CtxMenuState {
  visible: boolean;
  x: number;
  y: number;
  resource: Resource | null;
  showColors?: boolean;
}

interface SidebarContextMenuProps {
  state: CtxMenuState;
  allFolders: Resource[];
  onClose: () => void;
  onRename: (r: Resource) => void;
  onMove: (r: Resource) => void;
  onColorChange: (r: Resource, color: string) => void;
  onDelete: (r: Resource) => void;
  onNewFolder: (parentId: string | null) => void;
}

function SidebarContextMenu({
  state, allFolders: _allFolders, onClose, onRename, onMove, onColorChange, onDelete, onNewFolder,
}: SidebarContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);

  useEffect(() => {
    if (!state.visible) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [state.visible, onClose]);

  if (!state.visible || !state.resource) return null;

  const r = state.resource;
  const isFolder = r.type === 'folder';
  const currentColor = r.metadata?.color as string | undefined;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] rounded-lg shadow-xl border overflow-hidden"
      style={{
        left: Math.min(state.x, window.innerWidth - 200),
        top: Math.min(state.y, window.innerHeight - 240),
        minWidth: 180,
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
      }}
    >
      <div style={{ padding: '4px 0' }}>
        {/* Rename */}
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors"
          style={{ fontSize: 13, color: 'var(--dome-text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          onClick={() => { onRename(r); onClose(); }}
        >
          <Edit3 className="w-3.5 h-3.5 shrink-0" />
          <span>Renombrar</span>
        </button>

        {/* Move to folder */}
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors"
          style={{ fontSize: 13, color: 'var(--dome-text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          onClick={() => { onMove(r); onClose(); }}
        >
          <FolderInput className="w-3.5 h-3.5 shrink-0" />
          <span>Mover a carpeta</span>
        </button>

        {/* New subfolder (folders only) */}
        {isFolder && (
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors"
            style={{ fontSize: 13, color: 'var(--dome-text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            onClick={() => { onNewFolder(r.id); onClose(); }}
          >
            <FolderPlus className="w-3.5 h-3.5 shrink-0" />
            <span>Nueva subcarpeta</span>
          </button>
        )}

        {/* Color (folders only) */}
        {isFolder && (
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors"
            style={{ fontSize: 13, color: 'var(--dome-text)', background: showColors ? 'var(--dome-bg-hover)' : 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
            onMouseLeave={(e) => { if (!showColors) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            onClick={() => setShowColors((s) => !s)}
          >
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 border"
              style={{ background: currentColor?.startsWith('#') ? currentColor : 'var(--dome-accent)', borderColor: 'var(--dome-border)' }}
            />
            <span className="flex-1">Color</span>
            <ChevronRight className="w-3 h-3 shrink-0 opacity-50" style={{ transform: showColors ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          </button>
        )}

        {/* Color swatches */}
        {isFolder && showColors && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {FOLDER_COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                onClick={() => { onColorChange(r, opt.value); onClose(); }}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                style={{ background: opt.value, border: '2px solid transparent', outline: currentColor === opt.value ? `2px solid ${opt.value}` : 'none', outlineOffset: 2 }}
              >
                {currentColor === opt.value && <Check className="w-2.5 h-2.5 text-white" />}
              </button>
            ))}
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--dome-border)', margin: '4px 0' }} />

        {/* Delete */}
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors"
          style={{ fontSize: 13, color: 'var(--dome-error, #ef4444)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          onClick={() => { onDelete(r); onClose(); }}
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>Eliminar</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MoveFolderModal — folder picker modal
// ---------------------------------------------------------------------------
interface MoveFolderModalProps {
  resource: Resource;
  allFolders: Resource[];
  onConfirm: (folderId: string | null) => void;
  onClose: () => void;
}

function MoveFolderModal({ resource, allFolders, onConfirm, onClose }: MoveFolderModalProps) {
  const [selected, setSelected] = useState<string | null>(resource.folder_id ?? null);

  // Filter out the resource itself (if folder) and its descendants
  const availableFolders = allFolders.filter((f) => f.id !== resource.id);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-xl border flex flex-col"
        style={{
          width: 320,
          maxHeight: 420,
          background: 'var(--dome-surface)',
          borderColor: 'var(--dome-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <span className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>
            Mover "{resource.title}"
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md flex items-center justify-center transition-colors hover:bg-[var(--dome-bg-hover)]"
            style={{ width: 24, height: 24, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {/* Root option */}
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left px-4 py-2 transition-colors"
            style={{
              background: selected === null ? 'var(--dome-bg-hover)' : 'transparent',
              border: 'none', cursor: 'pointer', fontSize: 13,
              color: 'var(--dome-text)',
            }}
            onClick={() => setSelected(null)}
          >
            <Hash className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            <span className="flex-1">Sin carpeta (raíz)</span>
            {selected === null && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
          </button>

          {availableFolders.map((f) => {
            const color = getFolderColor(f);
            return (
              <button
                key={f.id}
                type="button"
                className="flex items-center gap-2 w-full text-left px-4 py-2 transition-colors"
                style={{
                  background: selected === f.id ? 'var(--dome-bg-hover)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  color: 'var(--dome-text)',
                }}
                onClick={() => setSelected(f.id)}
                onMouseEnter={(e) => { if (selected !== f.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { if (selected !== f.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <Folder className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                <span className="flex-1 truncate">{f.title}</span>
                {selected === f.id && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(selected); onClose(); }}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'white' }}
          >
            Mover
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteConfirmModal — inline delete confirmation
// ---------------------------------------------------------------------------
interface DeleteConfirmModalProps {
  resource: Resource;
  onConfirm: () => void;
  onClose: () => void;
}

function DeleteConfirmModal({ resource, onConfirm, onClose }: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-xl border p-5 flex flex-col gap-3"
        style={{ width: 300, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
      >
        <div>
          <p className="font-medium text-sm mb-1" style={{ color: 'var(--dome-text)' }}>
            ¿Eliminar {resource.type === 'folder' ? 'carpeta' : 'recurso'}?
          </p>
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            "{resource.title}"
            {resource.type === 'folder' ? ' y todo su contenido serán eliminados.' : ' será eliminado permanentemente.'}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(); onClose(); }}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{ background: 'var(--dome-error, #ef4444)', border: 'none', cursor: 'pointer', color: 'white' }}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewFolderModal
// ---------------------------------------------------------------------------
interface NewFolderModalProps {
  parentId: string | null;
  onConfirm: (name: string, parentId: string | null) => void;
  onClose: () => void;
}

function NewFolderModal({ parentId, onConfirm, onClose }: NewFolderModalProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed) { onConfirm(trimmed, parentId); onClose(); }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-xl border p-5 flex flex-col gap-3"
        style={{ width: 300, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
      >
        <p className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>Nueva carpeta</p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
          placeholder="Nombre de la carpeta"
          className="rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: 'var(--dome-bg-hover)',
            border: '1px solid var(--dome-border)',
            color: 'var(--dome-text)',
          }}
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={!name.trim()} className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: 'var(--dome-accent)', border: 'none', cursor: 'pointer', color: 'white', opacity: name.trim() ? 1 : 0.5 }}>
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResourceTreeNode — renders a resource file item
// ---------------------------------------------------------------------------
interface ResourceNodeProps {
  resource: Resource;
  depth: number;
  renameId: string | null;
  onContextMenu: (e: React.MouseEvent, r: Resource) => void;
  onRenameCommit: (id: string, newTitle: string) => void;
  onRenameCancel: () => void;
}

function ResourceNode({ resource, depth, renameId, onContextMenu, onRenameCommit, onRenameCancel }: ResourceNodeProps) {
  const [hovered, setHovered] = useState(false);
  const [renameValue, setRenameValue] = useState(resource.title);
  const renameRef = useRef<HTMLInputElement>(null);
  const isRenaming = renameId === resource.id;

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(resource.title);
      setTimeout(() => { renameRef.current?.select(); }, 10);
    }
  }, [isRenaming, resource.title]);

  const handleClick = () => {
    if (!isRenaming) useTabStore.getState().openResourceTab(resource.id, resource.type, resource.title);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onRenameCommit(resource.id, renameValue); }
    if (e.key === 'Escape') { onRenameCancel(); }
  };

  return (
    <div
      className="flex items-center w-full relative"
      style={{
        paddingLeft: 8 + depth * 16,
        paddingRight: 4,
        height: 30,
        borderRadius: 5,
        background: hovered ? 'var(--dome-bg-hover)' : 'transparent',
        minWidth: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, resource); }}
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center flex-1 text-left min-w-0"
        style={{ gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: hovered ? 'var(--dome-text)' : 'var(--dome-text-muted)', padding: 0, minWidth: 0 }}
        title={resource.title}
      >
        <span className="shrink-0" style={{ width: 14 }} />
        <span className="shrink-0 flex items-center" style={{ opacity: 0.75 }}>
          {getResourceIcon(resource.type)}
        </span>
        {isRenaming ? (
          <input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => onRenameCommit(resource.id, renameValue)}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 outline-none rounded px-1"
            style={{ fontSize: 12.5, background: 'var(--dome-surface)', border: '1px solid var(--dome-accent)', color: 'var(--dome-text)', minWidth: 0 }}
          />
        ) : (
          <span className="truncate flex-1" style={{ fontSize: 12.5, lineHeight: 1.3 }}>{resource.title}</span>
        )}
      </button>
      {hovered && !isRenaming && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onContextMenu(e, resource); }}
          className="shrink-0 flex items-center justify-center rounded transition-colors"
          style={{ width: 20, height: 20, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
          title="Opciones"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-surface)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <MoreHorizontal className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FolderTreeNode — folder row with expand/collapse and file children
// ---------------------------------------------------------------------------
interface FolderTreeNodeProps {
  node: FolderNode<Resource>;
  allResources: Resource[];
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  renameId: string | null;
  onContextMenu: (e: React.MouseEvent, r: Resource) => void;
  onRenameCommit: (id: string, newTitle: string) => void;
  onRenameCancel: () => void;
}

function FolderTreeNode({ node, allResources, depth, expandedIds, onToggle, renameId, onContextMenu, onRenameCommit, onRenameCancel }: FolderTreeNodeProps) {
  const { folder, children } = node;
  const isExpanded = expandedIds.has(folder.id);
  const [hovered, setHovered] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.title);
  const renameRef = useRef<HTMLInputElement>(null);
  const isRenaming = renameId === folder.id;

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(folder.title);
      setTimeout(() => { renameRef.current?.select(); }, 10);
    }
  }, [isRenaming, folder.title]);

  const resourceChildren = allResources.filter(
    (r) => r.folder_id === folder.id && r.type !== 'folder'
  );
  const hasSubfolders = children.length > 0;
  const hasAnyChildren = hasSubfolders || resourceChildren.length > 0;
  const folderColor = getFolderColor(folder);

  const handleRowClick = () => {
    if (hasAnyChildren) onToggle(folder.id);
    const appStore = useAppStore.getState();
    appStore.setCurrentFolderId(folder.id);
    appStore.setHomeSidebarSection('library');
    const { activateTab, tabs } = useTabStore.getState();
    const homeTab = tabs.find((t) => t.id === 'home');
    if (homeTab) activateTab('home');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onRenameCommit(folder.id, renameValue); }
    if (e.key === 'Escape') { onRenameCancel(); }
  };

  return (
    <div>
      <div
        className="flex items-center w-full relative"
        style={{
          paddingLeft: 8 + depth * 16,
          paddingRight: 4,
          height: 30,
          borderRadius: 5,
          background: hovered ? 'var(--dome-bg-hover)' : 'transparent',
          minWidth: 0,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, folder); }}
      >
        <button
          type="button"
          onClick={handleRowClick}
          className="flex items-center flex-1 text-left min-w-0"
          style={{ gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: hovered ? 'var(--dome-text)' : 'var(--dome-text-muted)', padding: 0, minWidth: 0 }}
          title={folder.title}
        >
          {/* Chevron */}
          <span className="shrink-0 flex items-center justify-center" style={{ width: 14, height: 14 }}>
            {hasAnyChildren ? (
              isExpanded
                ? <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
                : <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
            ) : (
              <span style={{ width: 12 }} />
            )}
          </span>
          <Folder className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} style={{ color: folderColor }} />
          {isRenaming ? (
            <input
              ref={renameRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => onRenameCommit(folder.id, renameValue)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 outline-none rounded px-1"
              style={{ fontSize: 12.5, background: 'var(--dome-surface)', border: '1px solid var(--dome-accent)', color: 'var(--dome-text)', minWidth: 0 }}
            />
          ) : (
            <span className="truncate flex-1" style={{ fontSize: 12.5, lineHeight: 1.3 }}>{folder.title}</span>
          )}
        </button>
        {hovered && !isRenaming && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onContextMenu(e, folder); }}
            className="shrink-0 flex items-center justify-center rounded transition-colors"
            style={{ width: 20, height: 20, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
            title="Opciones"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-surface)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        )}
      </div>

      {isExpanded && (
        <div>
          {children.map((child) => (
            <FolderTreeNode
              key={child.folder.id}
              node={child}
              allResources={allResources}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              renameId={renameId}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
          {resourceChildren.map((r) => (
            <ResourceNode
              key={r.id}
              resource={r}
              depth={depth + 1}
              renameId={renameId}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatHistorySection — recent chat sessions list
// ---------------------------------------------------------------------------
function ChatHistorySection() {
  const sessions = useManyStore((s) => s.sessions);
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const { openChatTab } = useTabStore.getState();
  const [expanded, setExpanded] = useState(true);

  const recent = sessions.slice(0, 12);

  const handleNewChat = () => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) openChatTab(sessionId, 'New chat');
  };

  const handleOpenSession = (session: { id: string; title: string }) => {
    useManyStore.getState().switchSession(session.id);
    useTabStore.getState().openChatTab(session.id, session.title || 'Chat');
  };

  return (
    <div className="shrink-0" style={{ borderBottom: '1px solid var(--dome-border)' }}>
      {/* Section header */}
      <div
        className="flex items-center justify-between px-2 pt-1.5 pb-0.5"
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 flex-1 text-left"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'var(--dome-text-muted)',
              textTransform: 'uppercase',
            }}
          >
            Chats
          </span>
          <span style={{ marginLeft: 2, color: 'var(--dome-text-muted)', opacity: 0.6 }}>
            {expanded ? (
              <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
            ) : (
              <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center justify-center rounded transition-colors"
          title="New chat"
          style={{
            width: 22,
            height: 22,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--dome-text-muted)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
          }}
        >
          <Plus className="w-3 h-3" strokeWidth={2.5} />
        </button>
      </div>

      {expanded && (
        <div className="pb-1 px-2">
          {recent.length === 0 ? (
            <p style={{ fontSize: 11.5, color: 'var(--dome-text-muted)', padding: '4px 8px' }}>
              Sin conversaciones
            </p>
          ) : (
            recent.map((session) => {
              const isActive = session.id === currentSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => handleOpenSession(session)}
                  className="flex items-center w-full text-left transition-colors duration-100 rounded-md"
                  style={{
                    gap: 6,
                    paddingLeft: 8,
                    paddingRight: 8,
                    height: 28,
                    fontSize: 12,
                    color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                    background: isActive ? 'var(--dome-surface)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                  title={session.title}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
                    }
                  }}
                >
                  <MessageSquare
                    className="w-[13px] h-[13px] shrink-0"
                    strokeWidth={1.75}
                    style={{ opacity: 0.7 }}
                  />
                  <span className="truncate flex-1">{session.title || 'New chat'}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResourceTree — full tree with search + context menu operations
// ---------------------------------------------------------------------------
interface ResourceTreeProps {
  activeSection: string;
}

function ResourceTree({ activeSection }: ResourceTreeProps) {
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<CtxMenuState>({ visible: false, x: 0, y: 0, resource: null });
  const [renameId, setRenameId] = useState<string | null>(null);
  const [moveResource, setMoveResource] = useState<Resource | null>(null);
  const [deleteResource, setDeleteResource] = useState<Resource | null>(null);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null | undefined>(undefined); // undefined = closed

  const fetchAll = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.resources) return;
    try {
      const result = await window.electron.db.resources.getAll(2000);
      if (result?.success && result.data) setAllResources(result.data as Resource[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    const u1 = window.electron.on('resource:created', fetchAll);
    const u2 = window.electron.on('resource:updated', fetchAll);
    const u3 = window.electron.on('resource:deleted', fetchAll);
    return () => { u1?.(); u2?.(); u3?.(); };
  }, [fetchAll]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleAllResources = () => {
    useAppStore.getState().setCurrentFolderId(null);
    useAppStore.getState().setHomeSidebarSection('library');
    const { activateTab, tabs } = useTabStore.getState();
    const homeTab = tabs.find((t) => t.id === 'home');
    if (homeTab) activateTab('home');
  };

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, r: Resource) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, resource: r });
  }, []);

  const handleRename = useCallback((r: Resource) => { setRenameId(r.id); }, []);

  const handleRenameCommit = useCallback(async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) { setRenameId(null); return; }
    const r = allResources.find((res) => res.id === id);
    if (r && trimmed !== r.title) {
      await window.electron?.db?.resources?.update({ id, title: trimmed, updated_at: Date.now() });
    }
    setRenameId(null);
  }, [allResources]);

  const handleRenameCancel = useCallback(() => { setRenameId(null); }, []);

  const handleMove = useCallback((r: Resource) => { setMoveResource(r); }, []);

  const handleMoveConfirm = useCallback(async (folderId: string | null) => {
    if (!moveResource) return;
    await window.electron?.db?.resources?.moveToFolder(moveResource.id, folderId);
    setMoveResource(null);
    fetchAll();
  }, [moveResource, fetchAll]);

  const handleColorChange = useCallback(async (r: Resource, color: string) => {
    const meta = { ...(r.metadata as object ?? {}), color };
    await window.electron?.db?.resources?.update({ id: r.id, metadata: JSON.stringify(meta), updated_at: Date.now() });
    fetchAll();
  }, [fetchAll]);

  const handleDelete = useCallback((r: Resource) => { setDeleteResource(r); }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteResource) return;
    await window.electron?.resource?.delete(deleteResource.id);
    setDeleteResource(null);
    fetchAll();
  }, [deleteResource, fetchAll]);

  const handleNewFolder = useCallback((parentId: string | null) => {
    setNewFolderParentId(parentId);
  }, []);

  const handleNewFolderConfirm = useCallback(async (name: string, parentId: string | null) => {
    await window.electron?.db?.resources?.create({
      type: 'folder',
      title: name,
      folder_id: parentId,
      project_id: (allResources[0]?.project_id) || 'default',
    } as any);
    if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId));
    fetchAll();
  }, [allResources, fetchAll]);

  // Filtered tree
  const q = searchQuery.trim().toLowerCase();
  const folders = allResources.filter((r) => r.type === 'folder');
  const nonFolders = allResources.filter((r) => r.type !== 'folder');
  const filteredFolders = q ? folders.filter((f) => f.title.toLowerCase().includes(q)) : folders;
  const filteredNonFolders = q ? nonFolders.filter((r) => r.title.toLowerCase().includes(q)) : nonFolders;
  const tree = buildFolderTree(filteredFolders);
  const folderIds = new Set(folders.map((f) => f.id));
  const rootResources = filteredNonFolders.filter((r) => !r.folder_id || !folderIds.has(r.folder_id));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 shrink-0">
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--dome-text-muted)', textTransform: 'uppercase' }}>
          Library
        </span>
        <button
          type="button"
          title="Nueva carpeta"
          onClick={() => handleNewFolder(null)}
          className="flex items-center justify-center rounded transition-colors"
          style={{ width: 20, height: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
        >
          <FolderPlus className="w-3 h-3" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pt-1 pb-1 shrink-0">
        <div className="flex items-center gap-1.5 rounded-md px-2" style={{ height: 28, background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
          <Search className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={2} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar recursos..."
            className="flex-1 bg-transparent outline-none border-none"
            style={{ fontSize: 12, color: 'var(--dome-text)', caretColor: 'var(--dome-accent)' }}
          />
        </div>
      </div>

      {/* All Resources */}
      <div className="px-2 pb-0.5 shrink-0">
        <button
          type="button"
          onClick={handleAllResources}
          className="flex items-center w-full text-left transition-colors duration-100"
          style={{ gap: 6, paddingLeft: 8, paddingRight: 8, height: 30, fontSize: 12.5, color: activeSection === 'library' ? 'var(--dome-text)' : 'var(--dome-text-muted)', borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = activeSection === 'library' ? 'var(--dome-text)' : 'var(--dome-text-muted)'; }}
        >
          <span className="shrink-0" style={{ width: 14 }} />
          <Hash className="w-[14px] h-[14px] shrink-0" strokeWidth={2} style={{ color: 'var(--dome-text-muted)' }} />
          <span className="truncate">Todos los recursos</span>
        </button>
      </div>

      {/* Tree */}
      <div className="overflow-y-auto scrollbar-none px-2 pb-2 flex-1">
        {tree.map((node) => (
          <FolderTreeNode
            key={node.folder.id}
            node={node}
            allResources={allResources}
            depth={0}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            renameId={renameId}
            onContextMenu={handleContextMenu}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={handleRenameCancel}
          />
        ))}
        {rootResources.map((r) => (
          <ResourceNode
            key={r.id}
            resource={r}
            depth={0}
            renameId={renameId}
            onContextMenu={handleContextMenu}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={handleRenameCancel}
          />
        ))}
        {tree.length === 0 && rootResources.length === 0 && (
          <p className="text-center py-3" style={{ fontSize: 11.5, color: 'var(--dome-text-muted)' }}>
            {q ? 'Sin resultados' : 'No hay recursos'}
          </p>
        )}
      </div>

      {/* Context menu */}
      <SidebarContextMenu
        state={contextMenu}
        allFolders={folders}
        onClose={() => setContextMenu((s) => ({ ...s, visible: false }))}
        onRename={handleRename}
        onMove={handleMove}
        onColorChange={handleColorChange}
        onDelete={handleDelete}
        onNewFolder={handleNewFolder}
      />

      {/* Move modal */}
      {moveResource && (
        <MoveFolderModal
          resource={moveResource}
          allFolders={folders}
          onConfirm={handleMoveConfirm}
          onClose={() => setMoveResource(null)}
        />
      )}

      {/* Delete confirm modal */}
      {deleteResource && (
        <DeleteConfirmModal
          resource={deleteResource}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteResource(null)}
        />
      )}

      {/* New folder modal */}
      {newFolderParentId !== undefined && (
        <NewFolderModal
          parentId={newFolderParentId}
          onConfirm={handleNewFolderConfirm}
          onClose={() => setNewFolderParentId(undefined)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DomeSidebar
// ---------------------------------------------------------------------------

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: 'section' | 'tab';
  section?: 'library';
  tabAction?: () => void;
  isActive?: (activeSection: string, tabType?: string) => boolean;
}

export default function DomeSidebar({
  width,
  collapsed,
  onWidthChange: _onWidthChange,
  onCollapse,
  onExpand,
  sidebarRef,
}: DomeSidebarProps) {
  const activeSection = useAppStore((s) => s.homeSidebarSection);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const theme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);

  const {
    openSettingsTab,
    openCalendarTab,
    openStudioTab,
    openFlashcardsTab,
    openLearnTab,
    openTagsTab,
    openMarketplaceTab,
    openAgentsTab,
    activeTabId,
    tabs,
  } = useTabStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const { upcomingUnreadCount, clearUpcomingUnread, upcomingEvents } = useCalendarStore();
  const [bellOpen, setBellOpen] = useState(false);

  const isWindows = typeof window !== 'undefined' && window.electron?.isWindows;
  const isMac = typeof window !== 'undefined' && window.electron?.isMac;
  const showTrafficLights = isMac && !isWindows;
  const displayWidth = collapsed ? SIDEBAR_ICON_WIDTH : width;

  // Load upcoming calendar events
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const load = async () => {
      const result = await window.electron.calendar.getUpcoming({ windowMinutes: 60, limit: 10 });
      if (result.success && result.events) {
        useCalendarStore.getState().setUpcomingEvents(result.events);
      }
    };
    load();
    const unsub = window.electron.calendar.onUpcoming((data: { events?: unknown[] }) => {
      if (data?.events) useCalendarStore.getState().setUpcomingEvents(data.events as any);
    });
    return () => unsub?.();
  }, []);

  // Close bell on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const bellEl = document.getElementById('dome-bell-area');
      if (bellEl && !bellEl.contains(target)) setBellOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [bellOpen]);

  const navItems: NavItem[] = [
    {
      id: 'library',
      label: 'Library',
      icon: <Home className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'section',
      section: 'library',
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: <Calendar className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'tab',
      tabAction: openCalendarTab,
      isActive: (_, tabType) => tabType === 'calendar',
    },
    {
      id: 'studio',
      label: 'Studio',
      icon: <Sparkles className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'tab',
      tabAction: openStudioTab,
      isActive: (_, tabType) => tabType === 'studio',
    },
    {
      id: 'flashcards',
      label: 'Flashcards',
      icon: <WalletCards className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'tab',
      tabAction: openFlashcardsTab,
      isActive: (_, tabType) => tabType === 'flashcards',
    },
    {
      id: 'learn',
      label: 'Learn',
      icon: <Sparkles className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'tab',
      tabAction: openLearnTab,
      isActive: (_, tabType) => tabType === 'learn',
    },
    {
      id: 'tags',
      label: 'Tags',
      icon: <Tag className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'tab',
      tabAction: openTagsTab,
      isActive: (_, tabType) => tabType === 'tags',
    },
    {
      id: 'agents',
      label: 'Agents & Flows',
      icon: <Zap className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'tab',
      tabAction: openAgentsTab,
      isActive: (_, tabType) => tabType === 'agents',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: <Store className="w-[16px] h-[16px]" strokeWidth={1.75} />,
      action: 'tab',
      tabAction: openMarketplaceTab,
      isActive: (_, tabType) => tabType === 'marketplace',
    },
  ];

  const getIsActive = (item: NavItem): boolean => {
    if (item.action === 'tab') {
      return item.isActive ? item.isActive(String(activeSection), activeTab?.type) : false;
    }
    if (activeTab?.type !== 'home' && activeTab?.id !== 'home') return false;
    return item.section ? activeSection === item.section : false;
  };

  const handleNavClick = (item: NavItem) => {
    if (item.action === 'tab' && item.tabAction) {
      item.tabAction();
      return;
    }
    if (item.action === 'section' && item.section) {
      setSection(item.section);
      const { activateTab, tabs: currentTabs } = useTabStore.getState();
      const homeTab = currentTabs.find((t) => t.id === 'home');
      if (homeTab && activeTabId !== 'home') activateTab('home');
    }
  };

  const isSettingsActive = activeTab?.type === 'settings';
  const isDark = theme === 'dark';

  const handleThemeToggle = () => {
    updateTheme(isDark ? 'light' : 'dark');
  };

  // Collapsed sidebar: icons only
  if (collapsed) {
    return (
      <aside
        ref={sidebarRef}
        className="flex flex-col h-full shrink-0 overflow-hidden"
        style={{
          width: SIDEBAR_ICON_WIDTH,
          minWidth: SIDEBAR_ICON_WIDTH,
          background: 'var(--dome-sidebar-bg)',
          borderRight: '1px solid var(--dome-border)',
          transition: 'width 200ms ease, min-width 200ms ease',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            height: 44,
            borderBottom: '1px solid var(--dome-border)',
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}
        >
          {showTrafficLights ? (
            <div style={{ width: 72 }} />
          ) : (
            <button
              type="button"
              onClick={onExpand}
              className="flex items-center justify-center rounded-md transition-colors hover:bg-[var(--dome-bg-hover)]"
              style={{
                width: 32,
                height: 32,
                color: 'var(--dome-text-muted)',
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties}
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Nav icons */}
        <div className="flex flex-col items-center gap-0.5 py-2 shrink-0">
          {navItems.map((item) => {
            const isActive = getIsActive(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item)}
                className="flex items-center justify-center rounded-md transition-colors duration-150"
                style={{
                  width: 36,
                  height: 32,
                  background: isActive ? 'var(--dome-surface)' : 'transparent',
                  color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                title={item.label}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
                  }
                }}
              >
                {item.icon}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer icons */}
        <div className="flex flex-col items-center gap-0.5 py-2 shrink-0" style={{ borderTop: '1px solid var(--dome-border)' }}>
          <button
            type="button"
            onClick={openSettingsTab}
            className="flex items-center justify-center rounded-md transition-colors duration-150"
            style={{
              width: 36,
              height: 32,
              background: isSettingsActive ? 'var(--dome-surface)' : 'transparent',
              color: isSettingsActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
            title="Settings"
            onMouseEnter={(e) => { if (!isSettingsActive) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; } }}
            onMouseLeave={(e) => { if (!isSettingsActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; } }}
          >
            <Settings className="w-[16px] h-[16px]" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={handleThemeToggle}
            className="flex items-center justify-center rounded-md transition-colors duration-150"
            style={{ width: 36, height: 32, background: 'transparent', color: 'var(--dome-text-muted)', border: 'none', cursor: 'pointer' }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
          >
            {isDark ? <Sun className="w-[16px] h-[16px]" strokeWidth={1.75} /> : <Moon className="w-[16px] h-[16px]" strokeWidth={1.75} />}
          </button>
        </div>
      </aside>
    );
  }

  // Expanded sidebar
  return (
    <aside
      ref={sidebarRef}
      className="flex flex-col h-full relative shrink-0 overflow-hidden"
      style={{
        width: displayWidth,
        minWidth: displayWidth,
        background: 'var(--dome-sidebar-bg)',
        borderRight: '1px solid var(--dome-border)',
        transition: 'width 200ms ease, min-width 200ms ease',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center shrink-0 px-3 gap-2 relative"
        style={{
          height: 44,
          WebkitAppRegion: 'drag',
          borderBottom: '1px solid var(--dome-border)',
        } as React.CSSProperties}
      >
        {/* macOS traffic lights spacer */}
        {showTrafficLights && (
          <div
            className="shrink-0"
            style={{ width: 72, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          />
        )}

        {/* Logo + name */}
        <div
          className="flex items-center gap-2 min-w-0 flex-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-5 h-5 shrink-0" style={{ filter: 'var(--dome-logo-filter)' }}>
            <img src="/many.png" alt="Dome" width={20} height={20} style={{ objectFit: 'contain' }} />
          </div>
          <span
            className="text-sm font-semibold truncate"
            style={{ color: 'var(--dome-text)', letterSpacing: '-0.01em', fontSize: 13 }}
          >
            Dome
          </span>
        </div>

        {/* Collapse button */}
        <button
          type="button"
          onClick={onCollapse}
          className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--dome-bg-hover)]"
          style={{
            width: 26,
            height: 26,
            color: 'var(--dome-text-muted)',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          title="Collapse sidebar"
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
        </button>

        {/* Linux window controls */}
        {!isMac && !isWindows && (
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <WindowControls />
          </div>
        )}
      </div>

      {/* ── Nav section ── */}
      <div className="shrink-0 px-2 pt-2 pb-1">
        {navItems.map((item) => {
          const isActive = getIsActive(item);
          return (
            <button
              key={item.id}
              type="button"
              data-tour={item.id}
              onClick={() => handleNavClick(item)}
              className="flex items-center w-full text-left transition-colors duration-150 rounded-md"
              style={{
                gap: 8,
                paddingLeft: 8,
                paddingRight: 8,
                height: 32,
                fontSize: 13,
                fontWeight: 500,
                background: isActive ? 'var(--dome-surface)' : 'transparent',
                color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                border: 'none',
                cursor: 'pointer',
                minWidth: 0,
              }}
              title={item.label}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
                }
              }}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'var(--dome-border)', margin: '0 8px' }} />

      {/* ── Chat history ── */}
      <ChatHistorySection />

      {/* ── Resource tree ── */}
      <ResourceTree activeSection={String(activeSection)} />

      {/* ── Footer ── */}
      <div
        className="flex flex-col shrink-0 px-2 pt-1 pb-2 gap-0.5"
        style={{ borderTop: '1px solid var(--dome-border)' }}
      >
        {/* Bell / notifications */}
        <div id="dome-bell-area" className="relative">
          <button
            type="button"
            onClick={() => {
              setBellOpen((o) => !o);
              if (!bellOpen) clearUpcomingUnread();
            }}
            className="flex items-center w-full text-left transition-colors duration-150 rounded-md relative"
            style={{
              gap: 8,
              paddingLeft: 8,
              paddingRight: 8,
              height: 32,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--dome-text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            title="Notificaciones"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
            }}
          >
            <span className="relative shrink-0">
              <Bell className="w-[16px] h-[16px]" strokeWidth={1.75} />
              {upcomingUnreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[13px] h-[13px] rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{ background: 'var(--dome-error)', color: 'white' }}
                >
                  {upcomingUnreadCount > 9 ? '9+' : upcomingUnreadCount}
                </span>
              )}
            </span>
            <span className="truncate">Notificaciones</span>
          </button>

          {/* Bell dropdown */}
          {bellOpen && (
            <div
              className="absolute left-full bottom-0 ml-2 w-72 rounded-xl shadow-xl border z-50 overflow-hidden"
              style={{
                background: 'var(--dome-surface)',
                borderColor: 'var(--dome-border)',
              }}
            >
              <div className="p-3 border-b" style={{ borderColor: 'var(--dome-border)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                  Eventos próximos
                </span>
              </div>
              <div className="max-h-64 overflow-auto">
                {upcomingEvents.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                    No hay eventos próximos
                  </div>
                ) : (
                  upcomingEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setBellOpen(false);
                        openCalendarTab();
                      }}
                      className="w-full text-left p-3 hover:bg-[var(--dome-bg-hover)] border-b last:border-b-0 transition-colors"
                      style={{ borderColor: 'var(--dome-border)' }}
                    >
                      <div
                        className="font-medium truncate text-sm"
                        style={{ color: 'var(--dome-text)' }}
                      >
                        {ev.title}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                        {new Date(ev.start_at).toLocaleString('es', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <button
          type="button"
          onClick={openSettingsTab}
          className="flex items-center w-full text-left transition-colors duration-150 rounded-md"
          style={{
            gap: 8,
            paddingLeft: 8,
            paddingRight: 8,
            height: 32,
            fontSize: 13,
            fontWeight: 500,
            background: isSettingsActive ? 'var(--dome-surface)' : 'transparent',
            color: isSettingsActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
          title="Settings"
          onMouseEnter={(e) => {
            if (!isSettingsActive) {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSettingsActive) {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
            }
          }}
        >
          <Settings className="w-[16px] h-[16px] shrink-0" strokeWidth={1.75} />
          <span>Ajustes</span>
        </button>

        {/* Help / Tour */}
        <button
          type="button"
          onClick={() => startDomeTour()}
          className="flex items-center w-full text-left transition-colors duration-150 rounded-md"
          style={{
            gap: 8,
            paddingLeft: 8,
            paddingRight: 8,
            height: 32,
            fontSize: 13,
            fontWeight: 500,
            background: 'transparent',
            color: 'var(--dome-text-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
          title="Ayuda y Tour"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
          }}
        >
          <HelpCircle className="w-[16px] h-[16px] shrink-0" strokeWidth={1.75} />
          <span>Ayuda</span>
        </button>

        {/* Branding + theme toggle */}
        <div
          className="flex items-center justify-between"
          style={{ paddingLeft: 8, paddingRight: 4, marginTop: 4 }}
        >
          <span style={{ fontSize: 11, color: 'var(--dome-text-muted)', opacity: 0.6 }}>
            Dome v2
          </span>
          <button
            type="button"
            onClick={handleThemeToggle}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 26,
              height: 26,
              color: 'var(--dome-text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
            }}
          >
            {isDark ? (
              <Sun className="w-[14px] h-[14px]" strokeWidth={1.75} />
            ) : (
              <Moon className="w-[14px] h-[14px]" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
