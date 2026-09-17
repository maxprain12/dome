/** Sidebar file tree: recursive TreeNode + FileTree (03/T02 — extracted from UnifiedSidebar.tsx). */

import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  Folder01Icon,
  FolderOpenIcon,
  Cancel01Icon,
  MoreHorizontalIcon,
  CheckIcon,
  ArrowRight01Icon,
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
import ListState from '@/components/shared/ListState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  beginExplorerDrag,
  canDropExplorerItems,
  endExplorerDrag,
  explorerDragIdsForItem,
  getActiveExplorerDrag,
  isInternalResourceDrag,
  isOsFileDrag,
  setExplorerDragGhost,
  writeExplorerDrag,
  type ExplorerNode,
} from '@/lib/workspace/explorerDnD';
import { classifyExplorerKey } from '@/lib/workspace/explorerKeyboard';
import { importPathsIntoFolderView } from '@/components/shell/folder-tab/folderTabViewHelpers';
import { flattenVisibleTree, nextVisibleTreeId, treeParentId } from './sidebarTreeNav';

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
  onDragStart: (node: TreeNodeData, event: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, node: TreeNodeData) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetNode: TreeNodeData) => void;
  onDragEnd: () => void;
  /** Selection mode props */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

// ── Pure helpers (kept outside the component so they don't add to its complexity) ──

function pickFolderColor(
  isFolder: boolean,
  resource: Resource | undefined,
): string {
  return isFolder && resource ? getFolderColor(resource) : 'var(--primary)';
}

function buildDragHandlers(
  node: TreeNodeData,
  onDragStart: (n: TreeNodeData, e: React.DragEvent) => void,
  onDragOver: (e: React.DragEvent, n: TreeNodeData) => void,
  onDragLeave: () => void,
  onDrop: (e: React.DragEvent, n: TreeNodeData) => void,
  onDragEnd: () => void,
  onContextMenu: (e: React.MouseEvent, r: Resource) => void,
) {
  return {
    onDragStart: (e: React.DragEvent) => onDragStart(node, e),
    onDragOver: (e: React.DragEvent) => onDragOver(e, node),
    onDragLeave: onDragLeave,
    onDrop: (e: React.DragEvent) => onDrop(e, node),
    onDragEnd: onDragEnd,
    onContextMenu: (e: React.MouseEvent) => {
      if (node.resource) {
        e.preventDefault();
        onContextMenu(e, node.resource);
      }
    },
  };
}

// ── JSX sections ──

function SelectionCheckbox({
  isSelected,
  onToggleSelect,
  nodeId,
}: {
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  nodeId: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect(nodeId);
      }}
      className="shrink-0 flex items-center justify-center rounded mr-1 transition-colors"
      style={{
        width: 14,
        height: 14,
        border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
        background: isSelected ? 'var(--primary)' : 'var(--background)',
        flexShrink: 0,
      }}
      aria-checked={isSelected}
    >
      {isSelected ? (
        <HugeiconsIcon icon={CheckIcon} className="size-2.5 text-primary-foreground" strokeWidth={2.5} />
      ) : null}
    </button>
  );
}

function ChevronToggle({ isFolder, isExpanded }: { isFolder: boolean; isExpanded: boolean }) {
  if (!isFolder) {
    return <span className="dome-fs-sidebar-chevron" aria-hidden />;
  }
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      className={cn(
        'dome-fs-sidebar-chevron-icon',
        isExpanded && 'dome-fs-sidebar-chevron-icon--open',
      )}
      strokeWidth={2.5}
    />
  );
}

function NodeIcon({
  isFolder,
  isExpanded,
  hasChildren,
  folderColor,
  nodeType,
  nodeName,
}: {
  isFolder: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  folderColor: string;
  nodeType: TreeNodeData['type'];
  nodeName: string;
}) {
  if (!isFolder) {
    return (
      <span className="shrink-0 text-muted-foreground">
        <ResourceIcon
          type={nodeType}
          name={nodeName}
          size={14}
          className="size-3.5"
          strokeWidth={1.75}
        />
      </span>
    );
  }
  // Folder icon: closed when collapsed (or empty), open when expanded
  const icon = isExpanded && hasChildren ? FolderOpenIcon : Folder01Icon;
  return (
    <span className="shrink-0 relative flex items-center justify-center">
      <HugeiconsIcon
        icon={icon}
        className="size-3.5"
        style={{ color: folderColor }}
        strokeWidth={1.75}
      />
    </span>
  );
}

function NodeNameField({
  isRenaming,
  isFolder,
  renameRef,
  renameValue,
  setRenameValue,
  handleRenameKeyDown,
  onRenameCommit,
  nodeId,
  nodeName,
}: {
  isRenaming: boolean;
  isFolder: boolean;
  renameRef: React.RefObject<HTMLInputElement>;
  renameValue: string;
  setRenameValue: (v: string) => void;
  handleRenameKeyDown: (e: React.KeyboardEvent) => void;
  onRenameCommit: (id: string, value: string) => void;
  nodeId: string;
  nodeName: string;
}) {
  const { t } = useTranslation();
  if (isRenaming) {
    return (
      <Input
        ref={renameRef}
        type="text"
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onKeyDown={handleRenameKeyDown}
        onBlur={() => onRenameCommit(nodeId, renameValue)}
        onClick={(e) => e.stopPropagation()}
        aria-label={t('folder.rename')}
        className="h-6 flex-1 px-1 text-xs"
      />
    );
  }
  return (
    <span className={cn('truncate min-w-0 flex-1 text-xs', isFolder && 'font-medium')}>
      {nodeName}
    </span>
  );
}

function RowMoreButton({
  visible,
  onContextMenu,
  resource,
}: {
  visible: boolean;
  onContextMenu: (e: React.MouseEvent, r: Resource) => void;
  resource: Resource | undefined;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (resource) onContextMenu(e, resource);
      }}
      className="shrink-0 flex items-center justify-center rounded-md transition-colors"
      style={{
        width: 20,
        height: 20,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--muted-foreground)',
        flexShrink: 0,
      }}
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
  );
}

function TreeChildren({
  node,
  depth,
  expandedIds,
  onToggle,
  onSelect,
  onOpenFolder,
  renameId,
  dragOverId,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  selectedIds,
  onToggleSelect,
}: TreeNodeProps) {
  if (!isExpandedWithChildren(node, expandedIds)) return null;
  // Constant per-level offset (containers nest, so indentation stays
  // linear even in deep trees); the guide line sits under the chevron.
  return (
    <div className="dome-fs-sidebar-group" role="group">
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
  );
}

/** True only for folders that are expanded AND have children to render. */
function isExpandedWithChildren(node: TreeNodeData, expandedIds: Set<string>): boolean {
  if (node.type !== 'folder') return false;
  if (!expandedIds.has(node.id)) return false;
  return Boolean(node.children && node.children.length > 0);
}

export function TreeNode({
  node,
  depth,
  expandedIds,
  onToggle,
  onSelect,
  onOpenFolder,
  renameId,
  dragOverId,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  selectedIds,
  onToggleSelect,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = isFolder && Boolean(node.children && node.children.length > 0);
  const isRenaming = renameId === node.id;
  const isDragOver = dragOverId === node.id;
  const [hovered, setHovered] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const renameRef = useRef<HTMLInputElement>(null);
  const isSelected = selectedIds?.has(node.id) ?? false;
  const inSelectionMode = Boolean(onToggleSelect);
  const folderColor = pickFolderColor(isFolder, node.resource);

  useEffect(() => {
    if (!isRenaming) return;
    setRenameValue(node.name);
    const timer = setTimeout(() => renameRef.current?.select(), 10);
    return () => clearTimeout(timer);
  }, [isRenaming, node.name]);

  const handleClick = () => {
    if (isRenaming) return;
    if (isFolder) {
      onToggle(node.id);
      onOpenFolder(node.id, node.name, node.resource?.project_id);
      return;
    }
    onSelect(node);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onRenameCommit(node.id, renameValue);
    } else if (e.key === 'Escape') {
      onRenameCancel();
    }
  };

  const dragHandlers = buildDragHandlers(
    node,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    onContextMenu,
  );

  return (
    <div>
      <div
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={isFolder ? isExpanded : undefined}
        className={cn(
          'dome-fs-sidebar-row',
          isSelected && 'dome-fs-sidebar-row--selected',
          isDragOver && isFolder && 'dome-fs-sidebar-row--drop',
          hovered && 'dome-fs-sidebar-row--hovered',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        tabIndex={-1}
        draggable={!isRenaming}
        onDragStart={dragHandlers.onDragStart}
        onDragOver={dragHandlers.onDragOver}
        onDragLeave={dragHandlers.onDragLeave}
        onDrop={dragHandlers.onDrop}
        onDragEnd={dragHandlers.onDragEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={dragHandlers.onContextMenu}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            handleClick();
          }
        }}
      >
        {depth > 0 ? (
          <span
            className="dome-fs-sidebar-guide"
            style={{ left: `${(depth - 1) * 16 + 16}px` }}
            aria-hidden
          />
        ) : null}
        {inSelectionMode ? (
          <SelectionCheckbox
            isSelected={isSelected}
            onToggleSelect={onToggleSelect!}
            nodeId={node.id}
          />
        ) : null}

        <button
          type="button"
          onClick={inSelectionMode ? () => onToggleSelect!(node.id) : handleClick}
          className={cn(
            'dome-fs-sidebar-row__main',
            isFolder ? 'font-medium text-sidebar-foreground' : 'text-sidebar-foreground',
          )}
        >
          <span className="dome-fs-sidebar-chevron-slot">
            <ChevronToggle isFolder={isFolder} isExpanded={isExpanded} />
          </span>

          <NodeIcon
            isFolder={isFolder}
            isExpanded={isExpanded}
            hasChildren={hasChildren}
            folderColor={folderColor}
            nodeType={node.type}
            nodeName={node.name}
          />

          <NodeNameField
            isRenaming={isRenaming}
            isFolder={isFolder}
            renameRef={renameRef}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            handleRenameKeyDown={handleRenameKeyDown}
            onRenameCommit={onRenameCommit}
            nodeId={node.id}
            nodeName={node.name}
          />
        </button>

        <RowMoreButton
          visible={hovered && !isRenaming && Boolean(node.resource)}
          onContextMenu={onContextMenu}
          resource={node.resource}
        />
      </div>

      <TreeChildren
        node={node}
        depth={depth}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileTree — tree container with all state and operations
// ---------------------------------------------------------------------------
export interface FileTreeProps {
  resources: Resource[];
  onRefresh: () => void;
  /** Folder ids to expand when resources move/create under them (agent runs). */
  autoExpandFolderIds?: string[];
  error?: string | null;
  onRetry?: () => void;
}

export default function FileTree({ resources, onRefresh, autoExpandFolderIds = [], error, onRetry }: FileTreeProps) {
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

  const explorerById = useMemo(() => {
    const map = new Map<string, ExplorerNode>();
    for (const resource of resources) {
      map.set(resource.id, {
        id: resource.id,
        type: resource.type,
        folder_id: resource.folder_id,
        project_id: resource.project_id,
      });
    }
    return map;
  }, [resources]);

  const [focusId, setFocusId] = useState<string | null>(null);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((node: TreeNodeData, event: React.DragEvent) => {
    if (!node.resource) return;
    const ids = explorerDragIdsForItem(
      node.id,
      selectionMode ? selectedIds : new Set([node.id]),
      resourcesById,
    );
    const payload = { ids, projectId };
    writeExplorerDrag(event.dataTransfer, payload);
    beginExplorerDrag(payload);
    setExplorerDragGhost(event.dataTransfer, node.name, ids.length);
    dragNodeRef.current = node;
    dragEnterCountRef.current = {};
  }, [projectId, resourcesById, selectedIds, selectionMode]);

  const handleDragOver = useCallback((e: React.DragEvent, target: TreeNodeData) => {
    const types = e.dataTransfer.types;
    if (isOsFileDrag(types) && target.type === 'folder') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dragOverId !== target.id) setDragOverId(target.id);
      setExpandedIds((prev) => new Set(prev).add(target.id));
      return;
    }
    const drag = getActiveExplorerDrag();
    if (!drag && !isInternalResourceDrag(types) && !dragNodeRef.current) return;
    const sourceIds = drag?.ids ?? (dragNodeRef.current ? [dragNodeRef.current.id] : []);
    const check = canDropExplorerItems({
      sourceIds,
      targetFolderId: target.type === 'folder' ? target.id : null,
      projectId: drag?.projectId ?? projectId,
      byId: explorerById,
    });
    if (!check.ok) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== target.id) setDragOverId(target.id);
    setExpandedIds((prev) => new Set(prev).add(target.id));
  }, [dragOverId, explorerById, projectId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const importIntoFolder = useCallback(async (folderId: string | null, event: React.DragEvent) => {
    const files = Array.from(event.dataTransfer.files ?? []);
    const paths = (globalThis.window.electron?.getPathsForFiles?.(files) ?? []).filter(Boolean) as string[];
    if (!paths.length) return;
    await importPathsIntoFolderView({
      paths,
      effectiveProjectId: projectId,
      listFolderId: folderId,
      refetch: async () => onRefresh(),
    });
  }, [onRefresh, projectId]);

  const handleDrop = useCallback(async (e: React.DragEvent, target: TreeNodeData) => {
    e.preventDefault();
    setDragOverId(null);
    if (isOsFileDrag(e.dataTransfer.types) && target.type === 'folder') {
      await importIntoFolder(target.id, e);
      endExplorerDrag();
      dragNodeRef.current = null;
      return;
    }
    const drag = getActiveExplorerDrag();
    const sourceIds = drag?.ids ?? (dragNodeRef.current ? [dragNodeRef.current.id] : []);
    const check = canDropExplorerItems({
      sourceIds,
      targetFolderId: target.type === 'folder' ? target.id : null,
      projectId: drag?.projectId ?? projectId,
      byId: explorerById,
    });
    if (!check.ok) {
      endExplorerDrag();
      dragNodeRef.current = null;
      return;
    }
    for (const id of sourceIds) {
      const result = await window.electron?.db?.resources?.moveToFolder(id, target.id);
      if (!result?.success) break;
    }
    endExplorerDrag();
    dragNodeRef.current = null;
    onRefresh();
  }, [explorerById, importIntoFolder, onRefresh, projectId]);

  const handleDragEnd = useCallback(() => {
    dragNodeRef.current = null;
    setDragOverId(null);
    setRootDragOver(false);
    endExplorerDrag();
  }, []);

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    if (e.defaultPrevented) {
      setRootDragOver(false);
      return;
    }
    if (isOsFileDrag(e.dataTransfer.types)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setRootDragOver(true);
      return;
    }
    const drag = getActiveExplorerDrag();
    const sourceIds = drag?.ids ?? (dragNodeRef.current ? [dragNodeRef.current.id] : []);
    if (sourceIds.length === 0) return;
    const check = canDropExplorerItems({
      sourceIds,
      targetFolderId: null,
      projectId: drag?.projectId ?? projectId,
      byId: explorerById,
    });
    if (!check.ok) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setRootDragOver(true);
  }, [explorerById, projectId]);

  const handleRootDrop = useCallback(async (e: React.DragEvent) => {
    setRootDragOver(false);
    if (e.defaultPrevented) return;
    if (isOsFileDrag(e.dataTransfer.types)) {
      e.preventDefault();
      await importIntoFolder(null, e);
      return;
    }
    const drag = getActiveExplorerDrag();
    const sourceIds = drag?.ids ?? (dragNodeRef.current ? [dragNodeRef.current.id] : []);
    dragNodeRef.current = null;
    setDragOverId(null);
    endExplorerDrag();
    if (sourceIds.length === 0) return;
    e.preventDefault();
    for (const id of sourceIds) {
      const result = await window.electron?.db?.resources?.moveToFolder(id, null);
      if (!result?.success) break;
    }
    onRefresh();
  }, [importIntoFolder, onRefresh]);

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
  const visibleRows = flattenVisibleTree(filteredTree, expandedIds);

  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const command = classifyExplorerKey(event.nativeEvent);
    if (!command) return;
    if (command === 'arrowDown' || command === 'arrowUp') {
      event.preventDefault();
      const nextId = nextVisibleTreeId(visibleRows, focusId, command === 'arrowDown' ? 1 : -1);
      if (nextId) setFocusId(nextId);
      return;
    }
    if (command === 'arrowRight' && focusId) {
      event.preventDefault();
      const row = visibleRows.find((item) => item.id === focusId);
      if (row?.node.type === 'folder' && !expandedIds.has(focusId)) handleToggle(focusId);
      return;
    }
    if (command === 'arrowLeft' && focusId) {
      event.preventDefault();
      if (expandedIds.has(focusId)) {
        handleToggle(focusId);
        return;
      }
      const parentId = treeParentId(visibleRows, focusId);
      if (parentId) setFocusId(parentId);
      return;
    }
    if (command === 'open' && focusId) {
      event.preventDefault();
      const row = visibleRows.find((item) => item.id === focusId);
      if (!row) return;
      if (row.node.type === 'folder') handleOpenFolder(row.node.id, row.node.name, row.node.resource?.project_id);
      else handleSelect(row.node);
      return;
    }
    if (command === 'rename' && focusId) {
      event.preventDefault();
      setRenameId(focusId);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden">
      <div className="flex min-w-0 items-center gap-1.5 px-1 pb-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2" style={{ height: 26, background: 'var(--accent)', border: '1px solid var(--border)' }}>
          <HugeiconsIcon icon={Search01Icon} className="size-3 shrink-0 text-muted-foreground" strokeWidth={2} />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workspace.search_workspace')}
            aria-label={t('workspace.search_workspace')}
            className="min-w-0 flex-1 bg-transparent outline-none border-none"
            style={{ fontSize: 12, color: 'var(--foreground)', caretColor: 'var(--primary)' }}
          />
        </div>
        {!selectionMode ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title={t('common.select')}
            onClick={() => setSelectionMode(true)}
            className="size-[26px] shrink-0"
          >
            <HugeiconsIcon icon={CheckIcon} className="size-3" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            title={t('common.cancel')}
            onClick={exitSelectionMode}
            className="size-[26px] shrink-0"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </Button>
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
        role="tree"
        aria-label={t('workspace.search_workspace')}
        tabIndex={0}
        className={cn('dome-fs-sidebar-tree', rootDragOver && 'dome-fs-sidebar-tree--drop')}
        onDragOver={handleRootDragOver}
        onDragLeave={() => setRootDragOver(false)}
        onDrop={(event) => {
          void handleRootDrop(event);
        }}
        onKeyDown={handleTreeKeyDown}
      >
        {error ? (
          <ListState
            variant="error"
            compact
            errorMessage={error}
            onRetry={onRetry}
          />
        ) : filteredTree.length === 0 && q ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('folder.treeNoResults')}
          </p>
        ) : filteredTree.length === 0 ? (
          <ListState
            variant="empty"
            compact
            title={t('folder.treeEmpty')}
            description={t('folder.emptyHint')}
          />
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
              selectedIds={selectionMode ? selectedIds : (focusId ? new Set([focusId]) : undefined)}
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
          onConfirm={handleBulkDelete}
          onClose={() => setBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL input modal
// ---------------------------------------------------------------------------
