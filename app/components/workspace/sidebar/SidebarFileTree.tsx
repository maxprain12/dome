/** Sidebar file tree: recursive TreeNode + FileTree (03/T02 — extracted from UnifiedSidebar.tsx). */

import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronDownIcon,
  Search01Icon,
  Folder01Icon,
  FolderOpenIcon,
  Cancel01Icon,
  MoreHorizontalIcon,
  CheckIcon,
} from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/lib/hooks/useResources';
import { useTabStore } from '@/lib/store/useTabStore';
import MoveToProjectModal from '@/components/workspace/MoveToProjectModal';
import MoveFolderModal from '@/components/workspace/MoveFolderModal';
import SelectionActionBar from '@/components/home/SelectionActionBar';
import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';
import { useAppStore } from '@/lib/store/useAppStore';

import ResourceIcon from '@/components/shared/ResourceIcon';
import { parseMeta, getFolderColor, buildTree, type TreeNodeData, type CtxState } from './sidebarHelpers';
import ContextMenu from './SidebarContextMenu';
import { BulkDeleteConfirmModal, DeleteConfirmModal, NewFolderModal } from './SidebarModals';

export interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNodeData) => void;
  onOpenFolder: (folderId: string, title: string, projectId?: string) => void;
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
      onOpenFolder(node.id, node.name, node.resource?.project_id);
    } else {
      onSelect(node);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onRenameCommit(node.id, renameValue); }
    if (e.key === 'Escape') onRenameCancel();
  };

  const folderColor = isFolder && node.resource ? getFolderColor(node.resource) : 'var(--primary)';

  const isSelected = selectedIds?.has(node.id) ?? false;
  const inSelectionMode = Boolean(onToggleSelect);

  let rowBg = 'transparent';
  if (isSelected) rowBg = 'color-mix(in srgb, var(--primary) 10%, transparent)';
  else if (isDragOver && isFolder) rowBg = `${folderColor}22`;
  else if (hovered) rowBg = 'var(--accent)';

  return (
    <div>
      <div
        className="flex items-center w-full relative rounded transition-colors"
        style={{
          paddingLeft: 6,
          paddingRight: 4,
          height: 28,
          background: rowBg,
          minWidth: 0,
          outline: isSelected ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' : isDragOver && isFolder ? `1.5px dashed ${folderColor}` : 'none',
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
              border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
              background: isSelected ? 'var(--primary)' : 'var(--background)',
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
          style={{ gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: hovered ? 'var(--foreground)' : 'var(--muted-foreground)', padding: 0, minWidth: 0 }}
        >
          <span className="shrink-0 flex items-center justify-center" style={{ width: 14, height: 14 }}>
            {isFolder
              ? <HugeiconsIcon icon={ChevronDownIcon} className={`size-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} strokeWidth={2.5} />
              : null}
          </span>

          {/* Folder icon: closed when collapsed (or empty), open when expanded */}
          {isFolder ? (
            <span className="shrink-0 relative flex items-center justify-center">
              {isExpanded && hasChildren ? (
                <HugeiconsIcon icon={FolderOpenIcon} className="size-3.5" style={{ color: folderColor }} strokeWidth={1.75} fill={`${folderColor}33`} />
              ) : (
                <HugeiconsIcon icon={Folder01Icon} className="size-3.5" style={{ color: folderColor }} strokeWidth={1.75} fill={`${folderColor}33`} />
              )}
            </span>
          ) : (
            <span className="shrink-0 text-muted-foreground">
              <ResourceIcon type={node.type} name={node.name} size={14} className="size-3.5" strokeWidth={1.75} />
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
              aria-label="Rename"
              className="flex-1 outline-none rounded px-1"
              style={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--primary)', color: 'var(--foreground)', minWidth: 0 }}
            />
          ) : (
            <span className="truncate flex-1 dome-fs-tree-name" style={{ fontSize: 12, fontWeight: isFolder ? 500 : 400 }}>{node.name}</span>
          )}
        </button>

        {hovered && !isRenaming && node.resource && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (node.resource) onContextMenu(e, node.resource); }}
            className="shrink-0 flex items-center justify-center rounded-md transition-colors"
            style={{ width: 20, height: 20, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', flexShrink: 0 }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--background)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
            }}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
          </button>
        )}
      </div>

      {isExpanded && hasChildren && (
        // Constant per-level offset (containers nest, so indentation stays
        // linear even in deep trees); the guide line sits under the chevron.
        <div style={{ borderLeft: '1px solid var(--border)', marginLeft: 13, minWidth: 0 }}>
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
  /** Folder ids to expand when resources move/create under them (agent runs). */
  autoExpandFolderIds?: string[];
}

export default function FileTree({ resources, onRefresh, autoExpandFolderIds = [] }: FileTreeProps) {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (autoExpandFolderIds.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of autoExpandFolderIds) {
        if (id) next.add(id);
      }
      return next;
    });
  }, [autoExpandFolderIds]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ctxMenu, setCtxMenu] = useState<CtxState>({ visible: false, x: 0, y: 0, resource: null });
  const [renameId, setRenameId] = useState<string | null>(null);
  const [moveResource, setMoveResource] = useState<Resource | null>(null);
  const [deleteResource, setDeleteResource] = useState<Resource | null>(null);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null | undefined>(undefined);
  const dragNodeRef = useRef<TreeNodeData | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Drop on the tree background = move to the workspace root (folder_id null).
  const [rootDragOver, setRootDragOver] = useState(false);
  const dragEnterCountRef = useRef<Record<string, number>>({});

  // ── Multi-selection ────────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [moveProjectIds, setMoveProjectIds] = useState<string[]>([]);
  const [folderPickOpen, setFolderPickOpen] = useState(false);

  const resourcesById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

  const folderPickRoots = useMemo(
    () => filterMoveProjectRoots(selectedIds, resourcesById),
    [selectedIds, resourcesById],
  );

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
      // Single cascade call: folder subtrees are expanded in the main process.
      await window.electron?.db?.resources?.bulkDelete([...selectedIds]);
      exitSelectionMode();
      onRefresh();
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, exitSelectionMode, onRefresh]);

  const handleBulkMoveToFolder = useCallback(
    async (targetFolderId: string | null) => {
      const roots = filterMoveProjectRoots(selectedIds, resourcesById);
      for (const id of roots) {
        const r = await window.electron?.db?.resources?.moveToFolder(id, targetFolderId);
        if (!r?.success) break;
      }
      exitSelectionMode();
      setFolderPickOpen(false);
      onRefresh();
    },
    [selectedIds, resourcesById, exitSelectionMode, onRefresh],
  );

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
    if (node.resource) openResourceTab(node.id, node.type, node.name, node.resource.project_id);
  }, [openResourceTab]);

  const handleOpenFolder = useCallback((folderId: string, title: string, projectId?: string) => {
    const resource = resources.find((r) => r.id === folderId);
    const folderColor = resource ? getFolderColor(resource) : undefined;
    const color = folderColor?.startsWith('#') ? folderColor : undefined;
    openFolderTab(folderId, title, color, projectId);
  }, [openFolderTab, resources]);

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
      metadata: {},
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
    dragNodeRef.current = node;
    dragEnterCountRef.current = {};
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, target: TreeNodeData) => {
    if (!dragNodeRef.current) return;
    if (dragNodeRef.current.id === target.id) return;
    // Only allow drop on folders; also allow drop on root (handled separately)
    if (target.type !== 'folder') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== target.id) setDragOverId(target.id);
    // Auto-expand folder after hovering
    setExpandedIds((prev) => new Set(prev).add(target.id));
  }, [dragOverId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, target: TreeNodeData) => {
    e.preventDefault();
    const dragNode = dragNodeRef.current;
    if (!dragNode || !dragNode.resource) { setDragOverId(null); dragNodeRef.current = null; return; }
    if (dragNode.id === target.id) { setDragOverId(null); dragNodeRef.current = null; return; }
    if (target.type !== 'folder') { setDragOverId(null); dragNodeRef.current = null; return; }
    // Don't move a folder into itself or its descendant
    if (dragNode.type === 'folder' && isDescendant(target, dragNode)) { setDragOverId(null); dragNodeRef.current = null; return; }
    await window.electron?.db?.resources?.moveToFolder(dragNode.id, target.id);
    dragNodeRef.current = null;
    setDragOverId(null);
    onRefresh();
  }, [onRefresh]);

  const handleDragEnd = useCallback(() => {
    dragNodeRef.current = null;
    setDragOverId(null);
    setRootDragOver(false);
  }, []);

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    if (e.defaultPrevented) {
      // A folder row already claimed this drag.
      setRootDragOver(false);
      return;
    }
    const dragNode = dragNodeRef.current;
    if (!dragNode?.resource?.folder_id) return; // nothing dragged, or already at root
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setRootDragOver(true);
  }, []);

  const handleRootDrop = useCallback(async (e: React.DragEvent) => {
    setRootDragOver(false);
    if (e.defaultPrevented) return; // handled by a folder row
    const dragNode = dragNodeRef.current;
    dragNodeRef.current = null;
    setDragOverId(null);
    if (!dragNode?.resource?.folder_id) return;
    e.preventDefault();
    await window.electron?.db?.resources?.moveToFolder(dragNode.id, null);
    onRefresh();
  }, [onRefresh]);

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
        <div className="flex-1 flex items-center gap-1.5 rounded px-2" style={{ height: 26, background: 'var(--accent)', border: '1px solid var(--border)' }}>
          <HugeiconsIcon icon={Search01Icon} className="size-3 shrink-0 text-muted-foreground" strokeWidth={2} />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workspace.search_workspace')}
            aria-label={t('workspace.search_workspace')}
            className="flex-1 bg-transparent outline-none border-none"
            style={{ fontSize: 12, color: 'var(--foreground)', caretColor: 'var(--primary)' }}
          />
        </div>
        {!selectionMode ? (
          <button
            type="button"
            title={t('common.select')}
            onClick={() => setSelectionMode(true)}
            className="shrink-0 flex items-center justify-center rounded"
            style={{ width: 24, height: 26, background: 'var(--accent)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted-foreground)' }}
          >
            <HugeiconsIcon icon={CheckIcon} className="size-3" />
          </button>
        ) : (
          <button
            type="button"
            title={t('common.cancel')}
            onClick={exitSelectionMode}
            className="shrink-0 flex items-center justify-center rounded"
            style={{ width: 24, height: 26, background: 'color-mix(in srgb, var(--primary) 12%, transparent)', border: '1px solid var(--primary)', cursor: 'pointer', color: 'var(--primary)' }}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </button>
        )}
      </div>

      {/* Selection action bar (compact: icon-only, fits the 260px sidebar) */}
      {selectionMode && selectedIds.size > 0 ? (
        <div className="px-2 pb-1">
          <SelectionActionBar
            compact
            count={selectedIds.size}
            onMoveToFolder={() => setFolderPickOpen(true)}
            onMoveToProject={() =>
              setMoveProjectIds([...filterMoveProjectRoots(selectedIds, resourcesById)])
            }
            onDelete={() => setBulkDeleteConfirm(true)}
            onDeselect={exitSelectionMode}
          />
        </div>
      ) : selectionMode ? (
        <div className="px-3 pb-1.5 flex items-center gap-1.5">
          <span className="flex-1 text-[12px] text-muted-foreground">
            {t('common.select')}
          </span>
        </div>
      ) : null}

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto px-2 pb-2 rounded"
        onDragOver={handleRootDragOver}
        onDragLeave={() => setRootDragOver(false)}
        onDrop={(e) => void handleRootDrop(e)}
        style={{
          outline: rootDragOver ? '1.5px dashed var(--primary)' : 'none',
          outlineOffset: -2,
        }}
      >
        {filteredTree.length === 0 ? (
          <p className="text-center py-4" style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
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
        onMoveToProject={(r) => setMoveProjectIds([r.id])}
        onColorChange={handleColorChange}
        onDelete={(r) => setDeleteResource(r)}
        onNewFolder={(parentId) => setNewFolderParentId(parentId)}
        onOpenInSplit={handleOpenInSplit}
        onOpenInWindow={(r) => { void handleOpenInWindow(r); }}
        canOpenInSplit={canOpenInSplit}
      />

      {moveResource ? (
        <MoveFolderModal
          open
          onClose={() => setMoveResource(null)}
          resourceIds={[moveResource.id]}
          resourceTitle={moveResource.title}
          allFolders={folders}
          projectId={projectId}
          currentFolderId={moveResource.folder_id}
          onConfirm={handleMoveConfirm}
        />
      ) : null}
      {deleteResource && (
        <DeleteConfirmModal resource={deleteResource}
          onConfirm={handleDeleteConfirm} onClose={() => setDeleteResource(null)} />
      )}
      {newFolderParentId !== undefined && (
        <NewFolderModal parentId={newFolderParentId}
          onConfirm={handleNewFolderConfirm} onClose={() => setNewFolderParentId(undefined)} />
      )}

      <MoveFolderModal
        open={folderPickOpen}
        onClose={() => setFolderPickOpen(false)}
        resourceIds={folderPickRoots}
        allFolders={folders}
        projectId={projectId}
        onConfirm={handleBulkMoveToFolder}
      />

      <MoveToProjectModal
        opened={moveProjectIds.length > 0}
        onClose={() => setMoveProjectIds([])}
        resourceIds={moveProjectIds}
        resourcesById={resourcesById}
        onCompleted={() => {
          setMoveProjectIds([]);
          exitSelectionMode();
          onRefresh();
        }}
      />

      {/* Bulk delete confirm modal */}
      {bulkDeleteConfirm && (
        <BulkDeleteConfirmModal
          count={selectedIds.size}
          busy={bulkDeleting}
          onConfirm={() => void handleBulkDelete()}
          onClose={() => setBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL input modal
// ---------------------------------------------------------------------------
