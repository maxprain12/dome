'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import { ChevronRight, ChevronDown, Folder, Hash } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import { buildFolderTree, type FolderNode } from '@/lib/utils/folder-tree';

interface InlineFolderNavProps {
  allFolders: Resource[];
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  moveToFolder: (resourceId: string, folderId: string | null) => Promise<boolean>;
  refetch: () => void;
  onContextMenu?: (e: React.MouseEvent, resource: Resource) => void;
}

const InlineFolderItem = memo(function InlineFolderItem({
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
  onContextMenu,
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
  onContextMenu?: (e: React.MouseEvent, resource: Resource) => void;
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
    <div className="select-none">
      <div
        className={`folder-nav-item group flex items-center gap-2 rounded-md mx-2 px-2 h-8 min-h-8 transition-colors cursor-pointer ${isActive
            ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-text)] font-medium'
            : 'text-[var(--dome-text-secondary)] hover:bg-[var(--dome-bg-hover)]'
          } ${isDragOver ? 'ring-2 ring-[var(--dome-accent)] bg-[var(--dome-accent-bg)]' : ''}`}
        style={{
          paddingLeft: depth * 12 + 8,
          marginBottom: 1,
        }}
        onClick={() => onFolderSelect(folder.id)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, folder) : undefined}
        aria-selected={isActive}
        role="row"
      >
        <button
          type="button"
          className={`flex-shrink-0 flex items-center justify-center w-4 h-4 rounded hover:bg-[var(--dome-bg-tertiary)] transition-colors ${!hasChildren ? 'invisible' : ''
            }`}
          onClick={handleToggleExpand}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown size={12} strokeWidth={2} style={{ opacity: 0.7 }} />
          ) : (
            <ChevronRight size={12} strokeWidth={2} style={{ opacity: 0.7 }} />
          )}
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <Folder
            size={14}
            strokeWidth={2}
            className={`flex-shrink-0 ${isActive ? 'text-[var(--dome-accent)]' : 'opacity-70 group-hover:opacity-100'}`}
            style={{
              fill: isActive || folder.metadata?.color ? (folder.metadata?.color || 'currentColor') : 'none',
              fillOpacity: isActive ? 0.2 : 0,
              color: folder.metadata?.color
            }}
          />
          <span className="text-sm truncate min-w-0">{folder.title}</span>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <InlineFolderItem
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
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default function InlineFolderNav({
  allFolders,
  currentFolderId,
  onFolderSelect,
  moveToFolder,
  refetch,
  onContextMenu,
}: InlineFolderNavProps) {
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

  return (
    <nav
      className="flex-1 overflow-y-auto py-2"
      aria-label="Folder navigation"
    >
      <div className="mb-2 px-4 text-xs font-semibold text-[var(--dome-text-muted)] tracking-wider uppercase">
        Library
      </div>

      <div
        className={`folder-nav-item group flex items-center gap-2 mx-2 px-2 rounded-md transition-colors cursor-pointer mb-1 h-8 min-h-8 ${currentFolderId === null
            ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-text)] font-medium'
            : 'text-[var(--dome-text-secondary)] hover:bg-[var(--dome-bg-hover)]'
          } ${dragOverRoot ? 'ring-2 ring-[var(--dome-accent)]' : ''}`}
        onClick={() => onFolderSelect(null)}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        <div className="w-4 flex-shrink-0 flex justify-center">
          <Hash size={14} className={currentFolderId === null ? 'text-[var(--dome-accent)]' : 'opacity-70'} />
        </div>
        <span className="text-sm truncate min-w-0">All Resources</span>
      </div>

      <div className="flex flex-col gap-px">
        {tree.map((node) => (
          <InlineFolderItem
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
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </nav>
  );
}
