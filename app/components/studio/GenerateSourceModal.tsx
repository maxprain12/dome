'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  File,
  Video,
  Music,
  Image,
  Link2,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { type Resource } from '@/types';

function getTypeIcon(type: string, size = 14) {
  const props = { size, className: 'shrink-0' };
  switch (type) {
    case 'note':
      return <FileText {...props} />;
    case 'pdf':
      return <File {...props} />;
    case 'video':
      return <Video {...props} />;
    case 'audio':
      return <Music {...props} />;
    case 'image':
      return <Image {...props} />;
    case 'url':
      return <Link2 {...props} />;
    case 'document':
      return <File {...props} />;
    default:
      return <File {...props} />;
  }
}

interface FolderNode {
  id: string;
  title: string;
  type: 'folder';
  folder_id: string | null;
  metadata?: { color?: string };
  children: (FolderNode | Resource)[];
}

function buildFolderTree(all: Resource[]): (FolderNode | Resource)[] {
  const folders = all.filter((r) => r.type === 'folder') as (Resource & { metadata?: { color?: string } })[];
  const resources = all.filter((r) => r.type !== 'folder');

  const byParent = new Map<string | null, (FolderNode | Resource)[]>();
  byParent.set(null, []);

  for (const f of folders) {
    const node: FolderNode = {
      id: f.id,
      title: f.title,
      type: 'folder',
      folder_id: f.folder_id ?? null,
      metadata: f.metadata as { color?: string } | undefined,
      children: [],
    };
    const parentId = f.folder_id ?? null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(node);
  }

  for (const r of resources) {
    const parentId = r.folder_id ?? null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(r);
  }

  function populateChildren(parentId: string | null): (FolderNode | Resource)[] {
    const items = byParent.get(parentId) ?? [];
    const result: (FolderNode | Resource)[] = [];
    for (const item of items) {
      if (item.type === 'folder') {
        (item as FolderNode).children = populateChildren((item as FolderNode).id);
        result.push(item);
      } else {
        result.push(item);
      }
    }
    result.sort((a, b) => {
      const aIsFolder = a.type === 'folder';
      const bIsFolder = b.type === 'folder';
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return String((a as { title?: string }).title ?? '').localeCompare(String((b as { title?: string }).title ?? ''));
    });
    return result;
  }

  return populateChildren(null);
}

export interface GenerateSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sourceIds: string[]) => void;
  projectId: string | null;
  /** Tile type for the modal title, e.g. "Mind Map" */
  tileTitle: string;
  /** When set (e.g. from workspace), pre-select this resource */
  focusResourceId?: string | null;
}

export default function GenerateSourceModal({
  isOpen,
  onClose,
  onConfirm,
  projectId,
  tileTitle,
  focusResourceId,
}: GenerateSourceModalProps) {
  const [allItems, setAllItems] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchResources() {
      if (!projectId || typeof window === 'undefined' || !window.electron?.db?.resources) {
        setAllItems([]);
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const result = await window.electron.db.resources.getByProject(projectId);
        if (result.success && result.data) {
          setAllItems(result.data as Resource[]);
        } else {
          setAllItems([]);
        }
      } catch (err) {
        console.error('[GenerateSourceModal] Failed to fetch:', err);
        setAllItems([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchResources();
  }, [projectId, isOpen]);

  // Pre-select focusResourceId when in workspace
  useEffect(() => {
    if (isOpen && focusResourceId && allItems.some((r) => r.id === focusResourceId && r.type !== 'folder')) {
      setSelectedIds((prev) => (prev.includes(focusResourceId) ? prev : [...prev, focusResourceId]));
    }
  }, [isOpen, focusResourceId, allItems]);

  // Expand folders containing focusResourceId
  useEffect(() => {
    if (!focusResourceId || allItems.length === 0) return;
    const res = allItems.find((r) => r.id === focusResourceId && r.type !== 'folder');
    if (!res?.folder_id) return;
    const ids = new Set<string>();
    let fid: string | null = res.folder_id;
    while (fid) {
      ids.add(fid);
      const parent = allItems.find((r) => r.id === fid && r.type === 'folder');
      fid = parent?.folder_id ?? null;
    }
    setExpandedFolderIds((prev) => new Set([...prev, ...ids]));
  }, [focusResourceId, allItems]);

  const tree = useMemo(() => buildFolderTree(allItems), [allItems]);

  const allResourceIds = useMemo(() => {
    return allItems.filter((r) => r.type !== 'folder').map((r) => r.id);
  }, [allItems]);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.length >= allResourceIds.length ? [] : [...allResourceIds]
    );
  }, [allResourceIds]);

  const handleConfirm = useCallback(() => {
    onConfirm(selectedIds);
    onClose();
  }, [selectedIds, onConfirm, onClose]);

  const allSelected = allResourceIds.length > 0 && selectedIds.length >= allResourceIds.length;

  function renderItem(item: FolderNode | Resource, depth: number): React.ReactNode {
    if (item.type === 'folder') {
      const folder = item as FolderNode;
      const isExpanded = expandedFolderIds.has(folder.id);
      const hasChildren = folder.children.length > 0;

      return (
        <div key={folder.id}>
          <button
            type="button"
            onClick={() => toggleFolder(folder.id)}
            className="flex items-center gap-2 w-full text-left py-2 px-3 rounded transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-1 min-h-[44px]"
            style={{
              paddingLeft: 12 + depth * 16,
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            aria-expanded={isExpanded}
            aria-label={`Carpeta ${folder.title}`}
          >
            <span className="shrink-0" style={{ color: 'var(--secondary-text)' }}>
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )
              ) : (
                <span className="w-[14px]" />
              )}
            </span>
            <FolderOpen
              size={14}
              className="shrink-0"
              style={{
                color: (folder.metadata?.color as string) || 'var(--accent)',
              }}
            />
            <span
              className="truncate flex-1 text-xs font-medium"
              style={{ color: 'var(--primary-text)' }}
              title={folder.title}
            >
              {folder.title}
            </span>
          </button>
          {isExpanded && (
            <div>{folder.children.map((child) => renderItem(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    const res = item as Resource;
    const isSelected = selectedIds.includes(res.id);
    const isCurrent = res.id === focusResourceId;

    return (
      <button
        type="button"
        key={res.id}
        className="flex items-center gap-2 w-full text-left py-2 px-3 rounded transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-1 min-h-[44px]"
        style={{
          paddingLeft: 12 + depth * 16,
          background: isCurrent ? 'var(--bg-hover)' : 'transparent',
          border: 'none',
        }}
        onClick={() => handleToggle(res.id)}
        onMouseEnter={(e) => {
          if (!isCurrent) e.currentTarget.style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isCurrent) e.currentTarget.style.background = 'transparent';
        }}
        aria-label={isSelected ? `Deseleccionar ${res.title}` : `Seleccionar ${res.title}`}
      >
        <span className="shrink-0 w-[14px] flex items-center justify-center">
          {isSelected ? (
            <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
          ) : (
            <Square size={14} style={{ color: 'var(--tertiary-text)' }} />
          )}
        </span>
        <span style={{ color: 'var(--secondary-text)' }} className="shrink-0">
          {getTypeIcon(res.type)}
        </span>
        <span
          className="truncate flex-1 text-xs"
          style={{
            color: isCurrent ? 'var(--primary-text)' : 'var(--secondary-text)',
            fontWeight: isCurrent ? 500 : 400,
          }}
          title={res.title}
        >
          {res.title}
        </span>
      </button>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Generar ${tileTitle} — Seleccionar fuentes`}
      size="md"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
          Selecciona los recursos que quieres usar como fuentes para generar el {tileTitle}. Puedes dejarlo vacío para usar los recursos más recientes del proyecto.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--secondary-text)' }}>
            Fuentes
          </span>
          {allResourceIds.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-medium cursor-pointer hover:underline focus-visible:ring-2 focus-visible:ring-offset-1 rounded"
              style={{ color: 'var(--accent)' }}
              aria-label={allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
            >
              {allSelected ? 'Ninguna' : 'Todas'}
            </button>
          )}
        </div>
        <div
          className="border rounded-lg overflow-y-auto min-h-[200px] max-h-[320px] py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--tertiary-text)' }} />
            </div>
          ) : tree.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--tertiary-text)' }}>
              {projectId ? 'No hay recursos ni carpetas en el proyecto' : 'Selecciona un proyecto'}
            </div>
          ) : (
            tree.map((item) => renderItem(item, 0))
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost min-h-[44px] px-4"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn btn-primary min-h-[44px] px-4"
          >
            Generar
          </button>
        </div>
      </div>
    </Modal>
  );
}
