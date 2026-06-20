/** Sidebar file tree: recursive TreeNode + FileTree (03/T02 — extracted from UnifiedSidebar.tsx). */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Folder, FolderOpen, X, MoreHorizontal, Trash2, Check } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import { useTabStore } from '@/lib/store/useTabStore';

import DomeResourceIcon from '@/components/ui/DomeResourceIcon';
import { pickFolderColor, parseMeta, getFolderColor, buildTree, type TreeNodeData, type CtxState } from './sidebarHelpers';
import ContextMenu from './SidebarContextMenu';
import { MoveFolderModal, DeleteConfirmModal, NewFolderModal } from './SidebarModals';

export interface TreeNodeProps {
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
  /** Selection mode props */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function TreeNode({
  node, depth, expandedIds, onToggle, onSelect, onOpenFolder, renameId, dragOverId,
  onContextMenu, onRenameCommit, onRenameCancel,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  selectedIds, onToggleSelect,
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
    if (isRenaming) { setRenameValue(node.name); const timer = setTimeout(() => renameRef.current?.select(), 10); return () => clearTimeout(timer); }
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

  const isSelected = selectedIds?.has(node.id) ?? false;
  const inSelectionMode = Boolean(onToggleSelect);

  let rowBg = 'transparent';
  if (isSelected) rowBg = 'color-mix(in srgb, var(--dome-accent) 10%, transparent)';
  else if (isDragOver && isFolder) rowBg = `${folderColor}22`;
  else if (hovered) rowBg = 'var(--dome-bg-hover)';

  return (
    <div>
      <div
        className="flex items-center w-full relative rounded transition-colors"
        style={{
          paddingLeft: 6 + depth * 16,
          paddingRight: 4,
          height: 28,
          background: rowBg,
          minWidth: 0,
          outline: isSelected ? '1px solid color-mix(in srgb, var(--dome-accent) 40%, transparent)' : isDragOver && isFolder ? `1.5px dashed ${folderColor}` : 'none',
          outlineOffset: -1,
        }}
        draggable={!isRenaming && !inSelectionMode}
        onDragStart={() => !inSelectionMode && onDragStart(node)}
        onDragOver={(e) => !inSelectionMode && onDragOver(e, node)}
        onDragLeave={onDragLeave}
        onDrop={(e) => !inSelectionMode && onDrop(e, node)}
        onDragEnd={onDragEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => { if (node.resource && !inSelectionMode) { e.preventDefault(); onContextMenu(e, node.resource); } }}
      >
        {/* Selection checkbox — only shown in selection mode */}
        {inSelectionMode && (
          <button
            type="button"
            role="checkbox"
            onClick={(e) => { e.stopPropagation(); onToggleSelect!(node.id); }}
            className="shrink-0 flex items-center justify-center rounded mr-1 transition-colors"
            style={{
              width: 14, height: 14,
              border: `1.5px solid ${isSelected ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
              background: isSelected ? 'var(--dome-accent)' : 'var(--dome-bg)',
              flexShrink: 0,
            }}
            aria-checked={isSelected}
          >
            {isSelected && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={inSelectionMode ? () => onToggleSelect!(node.id) : handleClick}
          className="flex items-center flex-1 text-left min-w-0"
          style={{ gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: hovered ? 'var(--dome-text)' : 'var(--dome-text-secondary)', padding: 0, minWidth: 0 }}
        >
          <span className="shrink-0 flex items-center justify-center" style={{ width: 14, height: 14 }}>
            {isFolder
              ? <ChevronDown className={`size-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} strokeWidth={2.5} />
              : null}
          </span>

          {/* Folder icon: closed when collapsed (or empty), open when expanded */}
          {isFolder ? (
            <span className="shrink-0 relative flex items-center justify-center">
              {isExpanded && hasChildren ? (
                <FolderOpen className="size-3.5" style={{ color: folderColor }} strokeWidth={1.75} fill={`${folderColor}33`} />
              ) : (
                <Folder className="size-3.5" style={{ color: folderColor }} strokeWidth={1.75} fill={`${folderColor}33`} />
              )}
            </span>
          ) : (
            <span className="shrink-0" style={{ color: 'var(--dome-text-muted)' }}>
              <DomeResourceIcon type={node.type} name={node.name} size={14} className="size-3.5" strokeWidth={1.75} />
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
            <span className="truncate flex-1 dome-fs-tree-name" style={{ fontSize: 12, fontWeight: isFolder ? 500 : 400 }}>{node.name}</span>
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
            <MoreHorizontal className="size-3.5" />
          </button>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div style={{ borderLeft: '1px solid var(--dome-border)', marginLeft: 6 + depth * 16 + 7 }}>
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
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
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
export interface FileTreeProps {
  resources: Resource[];
  onRefresh: () => void;
}

export default function FileTree({ resources, onRefresh }: FileTreeProps) {
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

  // ── Multi-selection ────────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await window.electron?.resource?.delete(id);
      }
      exitSelectionMode();
      onRefresh();
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, exitSelectionMode, onRefresh]);

  const { openResourceTab, openFolderTab } = useTabStore.getState();
  const folders = resources.filter((r) => r.type === 'folder');

  /**
   * Whether there's an active tab capable of hosting a split. We avoid
   * splitting the home tab because it has no primary resource.
   */
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const openResourceInSplit = useTabStore((s) => s.openResourceInSplit);
  const canOpenInSplit = activeTabId !== null && activeTabId !== 'home' &&
    Boolean(tabs.find((tb) => tb.id === activeTabId)?.resourceId);

  const handleOpenInSplit = useCallback((r: Resource) => {
    openResourceInSplit(r.id, r.type, r.title || '');
  }, [openResourceInSplit]);

  const handleOpenInWindow = useCallback(async (r: Resource) => {
    if (!window.electron?.invoke) return;
    if (r.type !== 'note') return;
    try {
      await window.electron.invoke('window:create', {
        id: `note-focus:${r.id}`,
        route: `/focus/note/${encodeURIComponent(r.id)}`,
        options: {
          width: 960,
          height: 760,
          minWidth: 560,
          minHeight: 480,
          title: `${r.title || 'Nota'} — Dome`,
          transparent: false,
        },
      });
    } catch (err) {
      console.error('[UnifiedSidebar] Failed to open popout:', err);
    }
  }, []);

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
      type: 'folder' as Resource['type'],
      title: name,
      folder_id: parentId,
      project_id: (resources[0]?.project_id) || 'default',
      metadata: { color: pickFolderColor() },
      created_at: now,
      updated_at: now,
    });
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
      {/* Search + selection toggle */}
      <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5">
        <div className="flex-1 flex items-center gap-1.5 rounded px-2" style={{ height: 26, background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
          <Search className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={2} />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workspace.search_resources')} className="flex-1 bg-transparent outline-none border-none"
            style={{ fontSize: 12, color: 'var(--dome-text)', caretColor: 'var(--dome-accent)' }}
          />
        </div>
        {!selectionMode ? (
          <button
            type="button"
            title={t('common.select')}
            onClick={() => setSelectionMode(true)}
            className="shrink-0 flex items-center justify-center rounded"
            style={{ width: 24, height: 26, background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
          >
            <Check className="size-3" />
          </button>
        ) : (
          <button
            type="button"
            title={t('common.cancel')}
            onClick={exitSelectionMode}
            className="shrink-0 flex items-center justify-center rounded"
            style={{ width: 24, height: 26, background: 'color-mix(in srgb, var(--dome-accent) 12%, transparent)', border: '1px solid var(--dome-accent)', cursor: 'pointer', color: 'var(--dome-accent)' }}
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Selection action bar */}
      {selectionMode && (
        <div className="px-3 pb-1.5 flex items-center gap-1.5">
          <span className="flex-1 text-[12px]" style={{ color: 'var(--dome-text-muted)' }}>
            {selectedIds.size > 0 ? `${selectedIds.size} sel.` : t('common.select')}
          </span>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleting}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium"
              style={{
                background: 'color-mix(in srgb, var(--dome-error) 10%, transparent)',
                color: 'var(--dome-error)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Trash2 className="size-3" />
              {t('common.delete')}
            </button>
          )}
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredTree.length === 0 ? (
          <p className="text-center py-4" style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>
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
              selectedIds={selectionMode ? selectedIds : undefined}
              onToggleSelect={selectionMode ? handleToggleSelect : undefined}
            />
          ))
        )}
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
        onOpenInSplit={handleOpenInSplit}
        onOpenInWindow={(r) => { void handleOpenInWindow(r); }}
        canOpenInSplit={canOpenInSplit}
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

      {/* Bulk delete confirm modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="rounded-xl shadow-xl border p-4 flex flex-col gap-3" style={{ width: 270, background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}>
            <p className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>
              {t('ui.delete_confirm', { type: 'items' })}
            </p>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {selectedIds.size} {t('common.select')}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setBulkDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-md text-xs"
                style={{ background: 'var(--dome-bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}>
                {t('ui.cancel')}
              </button>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => void handleBulkDelete()}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{ background: 'var(--dome-error)', border: 'none', cursor: 'pointer', color: 'var(--base-text)', opacity: bulkDeleting ? 0.6 : 1 }}>
                {bulkDeleting ? '...' : t('ui.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL input modal
// ---------------------------------------------------------------------------
