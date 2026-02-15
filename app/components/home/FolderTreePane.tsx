'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import { ChevronRight, ChevronDown, Folder, Home as HomeIcon } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import { buildFolderTree, type FolderNode } from '@/lib/utils/folder-tree';

interface FolderTreePaneProps {
  allFolders: Resource[];
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  moveToFolder: (resourceId: string, folderId: string | null) => Promise<boolean>;
  refetch: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const FolderTreeItem = memo(function FolderTreeItem({
  node,
  depth,
  currentFolderId,
  expandedIds,
  onToggleExpand,
  onFolderSelect,
  moveToFolder,
  refetch,
  dragOverFolderId,
  setDragOverFolderId,
}: {
  node: FolderNode<Resource>;
  depth: number;
  currentFolderId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onFolderSelect: (id: string | null) => void;
  moveToFolder: (resourceId: string, folderId: string | null) => Promise<boolean>;
  refetch: () => void;
  dragOverFolderId: string | null;
  setDragOverFolderId: (id: string | null) => void;
}) {
  const { folder, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isActive = currentFolderId === folder.id;
  const isDragOver = dragOverFolderId === folder.id;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const hasDome =
        e.dataTransfer.types.includes('application/x-dome-resource-id') ||
        e.dataTransfer.types.includes('application/x-dome-resource-ids');
      if (!hasDome) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId(folder.id);
    },
    [folder.id, setDragOverFolderId]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      const related = e.relatedTarget as Node | null;
      const current = e.currentTarget;
      if (related && current.contains(related)) return;
      setDragOverFolderId(null);
    },
    [setDragOverFolderId]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverFolderId(null);
      const multi = e.dataTransfer.getData('application/x-dome-resource-ids');
      const ids: string[] = multi
        ? (() => {
            try {
              const arr = JSON.parse(multi) as string[];
              return Array.isArray(arr) ? arr : [];
            } catch {
              return [];
            }
          })()
        : [];
      const single = e.dataTransfer.getData('application/x-dome-resource-id');
      const resourceIds = ids.length > 0 ? ids : single ? [single] : [];
      if (resourceIds.length === 0) return;
      let moved = 0;
      for (const rid of resourceIds) {
        const success = await moveToFolder(rid, folder.id);
        if (success) moved++;
      }
      if (moved > 0) refetch();
    },
    [folder.id, moveToFolder, refetch, setDragOverFolderId]
  );

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(folder.id);
    },
    [folder.id, onToggleExpand]
  );

  return (
    <div className="folder-tree-item-wrapper">
      <div
        className={`folder-tree-item ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: depth * 16 + 4 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-selected={isActive}
        role="row"
      >
        <div className="folder-tree-item-row">
          {hasChildren ? (
            <button
              type="button"
              className="folder-tree-expand"
              onClick={handleToggleExpand}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown size={12} strokeWidth={2} />
              ) : (
                <ChevronRight size={12} strokeWidth={2} />
              )}
            </button>
          ) : (
            <span className="folder-tree-expand-placeholder" aria-hidden="true" />
          )}
          <button
            type="button"
            className="folder-tree-item-btn"
            onClick={() => onFolderSelect(folder.id)}
            aria-label={`Open ${folder.title}`}
          >
            <Folder size={16} strokeWidth={1.5} className="folder-tree-icon" aria-hidden />
            <span className="folder-tree-label">{folder.title}</span>
          </button>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="folder-tree-children">
          {children.map((child) => (
            <FolderTreeItem
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onFolderSelect={onFolderSelect}
              moveToFolder={moveToFolder}
              refetch={refetch}
              dragOverFolderId={dragOverFolderId}
              setDragOverFolderId={setDragOverFolderId}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default function FolderTreePane({
  allFolders,
  currentFolderId,
  onFolderSelect,
  moveToFolder,
  refetch,
  isCollapsed = false,
  onToggleCollapse,
}: FolderTreePaneProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (currentFolderId) {
      let id: string | null = currentFolderId;
      const byId = new Map(allFolders.map((f) => [f.id, f]));
      while (id) {
        s.add(id);
        const folder = byId.get(id);
        id = folder?.folder_id ?? null;
      }
    }
    return s;
  });

  useEffect(() => {
    if (!currentFolderId) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let id: string | null = currentFolderId;
      const byId = new Map(allFolders.map((f) => [f.id, f]));
      while (id) {
        next.add(id);
        const folder = byId.get(id);
        id = folder?.folder_id ?? null;
      }
      return next;
    });
  }, [currentFolderId, allFolders]);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    const hasDome =
      e.dataTransfer.types.includes('application/x-dome-resource-id') ||
      e.dataTransfer.types.includes('application/x-dome-resource-ids');
    if (!hasDome) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRoot(true);
  }, []);

  const handleRootDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget;
    if (related && current.contains(related)) return;
    setDragOverRoot(false);
  }, []);

  const handleRootDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverRoot(false);
      const multi = e.dataTransfer.getData('application/x-dome-resource-ids');
      const ids: string[] = multi
        ? (() => {
            try {
              const arr = JSON.parse(multi) as string[];
              return Array.isArray(arr) ? arr : [];
            } catch {
              return [];
            }
          })()
        : [];
      const single = e.dataTransfer.getData('application/x-dome-resource-id');
      const resourceIds = ids.length > 0 ? ids : single ? [single] : [];
      if (resourceIds.length === 0) return;
      let moved = 0;
      for (const rid of resourceIds) {
        const success = await moveToFolder(rid, null);
        if (success) moved++;
      }
      if (moved > 0) refetch();
    },
    [moveToFolder, refetch]
  );

  const tree = buildFolderTree(allFolders);

  if (isCollapsed) {
    return (
      <div
        className="folder-tree-pane collapsed"
        style={{
          width: 28,
          minWidth: 28,
          background: 'transparent',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 10,
        }}
      >
        {onToggleCollapse && (
          <button
            type="button"
            className="folder-tree-pane-toggle"
            onClick={onToggleCollapse}
            aria-label="Expand folder tree"
            title="Show folders"
          >
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  }

  return (
    <aside
      className="folder-tree-pane"
      style={{
        width: '180px',
        minWidth: '180px',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        className="folder-tree-header"
        style={{
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}
      >
        {onToggleCollapse && (
          <button
            type="button"
            className="folder-tree-pane-toggle"
            onClick={onToggleCollapse}
            aria-label="Collapse folder tree"
            title="Hide folders"
          >
            <ChevronRight size={14} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
      </div>
      <div
        className="folder-tree-list"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2px 4px',
        }}
      >
        <div
          className={`folder-tree-root ${currentFolderId === null ? 'active' : ''} ${dragOverRoot ? 'drag-over' : ''}`}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
          <button
            type="button"
            className={`folder-tree-item-btn folder-tree-root-btn ${currentFolderId === null ? 'active' : ''}`}
            onClick={() => onFolderSelect(null)}
            aria-label="All documents (root)"
          >
            <HomeIcon size={16} strokeWidth={1.5} className="folder-tree-root-icon" aria-hidden />
            <span className="folder-tree-label">All</span>
          </button>
        </div>
        {tree.map((node) => (
          <FolderTreeItem
            key={node.folder.id}
            node={node}
            depth={0}
            currentFolderId={currentFolderId}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            onFolderSelect={onFolderSelect}
            moveToFolder={moveToFolder}
            refetch={refetch}
            dragOverFolderId={dragOverFolderId}
            setDragOverFolderId={setDragOverFolderId}
          />
        ))}
        {allFolders.length === 0 && (
          <div
            className="text-xs py-4 px-4"
            style={{ color: 'var(--dome-text-secondary)' }}
          >
            No folders yet
          </div>
        )}
      </div>
    </aside>
  );
}
