'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  File01Icon,
  Video01Icon,
  MusicNote01Icon,
  Image01Icon,
  Link02Icon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckmarkSquare02Icon,
  SquareIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { type Resource } from '@/types';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
function getTypeIcon(type: string, size = 14) {
  const props = { size, className: 'shrink-0' };
  switch (type) {
    case 'pdf':
      return <HugeiconsIcon icon={File01Icon} {...props} />;
    case 'video':
      return <HugeiconsIcon icon={Video01Icon} {...props} />;
    case 'audio':
      return <HugeiconsIcon icon={MusicNote01Icon} {...props} />;
    case 'image':
      return <HugeiconsIcon icon={Image01Icon} {...props} />;
    case 'url':
      return <HugeiconsIcon icon={Link02Icon} {...props} />;
    default:
      return <HugeiconsIcon icon={File01Icon} {...props} />;
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
  /** When true, at least one resource must be selected to confirm */
  requireAtLeastOne?: boolean;
  /** Replaces default title `Generar ${tileTitle} — Seleccionar fuentes` */
  titleOverride?: string;
  /** Replaces default description paragraph */
  descriptionOverride?: string;
}

export default function GenerateSourceModal({
  isOpen,
  onClose,
  onConfirm,
  projectId,
  tileTitle,
  focusResourceId,
  requireAtLeastOne = false,
  titleOverride,
  descriptionOverride,
}: GenerateSourceModalProps) {
  const { t } = useTranslation();
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
  const preselectKey =
    isOpen && focusResourceId && allItems.length > 0
      ? `${focusResourceId}:${allItems.length}`
      : '';
  const prevPreselectKeyRef = useRef('');
  if (preselectKey && preselectKey !== prevPreselectKeyRef.current) {
    prevPreselectKeyRef.current = preselectKey;
    if (allItems.some((r) => r.id === focusResourceId && r.type !== 'folder')) {
      setSelectedIds((prev) =>
        focusResourceId && !prev.includes(focusResourceId) ? [...prev, focusResourceId] : prev,
      );
    }
  }

  const expandFoldersKey = focusResourceId && allItems.length > 0
    ? `${focusResourceId}:${allItems.length}`
    : '';
  const prevExpandFoldersKeyRef = useRef(expandFoldersKey);
  if (expandFoldersKey && expandFoldersKey !== prevExpandFoldersKeyRef.current) {
    prevExpandFoldersKeyRef.current = expandFoldersKey;
    const res = allItems.find((r) => r.id === focusResourceId && r.type !== 'folder');
    if (res?.folder_id) {
      const ids = new Set<string>();
      let fid: string | null = res.folder_id;
      while (fid) {
        ids.add(fid);
        const parent = allItems.find((r) => r.id === fid && r.type === 'folder');
        fid = parent?.folder_id ?? null;
      }
      setExpandedFolderIds((prev) => new Set([...prev, ...ids]));
    }
  }

  const tree = useMemo(() => buildFolderTree(allItems), [allItems]);

  const allResourceIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of allItems) {
      if (r.type === 'folder') continue;
      ids.push(r.id);
    }
    return ids;
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
    if (requireAtLeastOne && selectedIds.length === 0) return;
    onConfirm(selectedIds);
    onClose();
  }, [selectedIds, onConfirm, onClose, requireAtLeastOne]);

  const confirmDisabled = requireAtLeastOne && selectedIds.length === 0;

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
              e.currentTarget.style.background = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            aria-expanded={isExpanded}
            aria-label={`${t('studio.folder')} ${folder.title}`}
          >
            <span className="shrink-0 text-muted-foreground">
              {hasChildren ? (
                isExpanded ? (
                  <HugeiconsIcon icon={ChevronDownIcon} size={14} />
                ) : (
                  <HugeiconsIcon icon={ChevronRightIcon} size={14} />
                )
              ) : (
                <span className="w-[14px]" />
              )}
            </span>
            <HugeiconsIcon icon={FolderOpenIcon}
              size={14}
              className="shrink-0"
              style={{
                color: (folder.metadata?.color as string) || 'var(--primary)',
              }}
            />
            <span
              className="truncate flex-1 text-xs font-medium text-foreground"
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
          background: isCurrent ? 'var(--accent)' : 'transparent',
          border: 'none',
        }}
        onClick={() => handleToggle(res.id)}
        onMouseEnter={(e) => {
          if (!isCurrent) e.currentTarget.style.background = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          if (!isCurrent) e.currentTarget.style.background = 'transparent';
        }}
        aria-label={isSelected ? t('studio.sources_deselect', { title: res.title }) : t('studio.sources_select', { title: res.title })}
      >
        <span className="shrink-0 w-[14px] flex items-center justify-center">
          {isSelected ? (
            <HugeiconsIcon icon={CheckmarkSquare02Icon} size={14} className="text-primary" />
          ) : (
            <HugeiconsIcon icon={SquareIcon} size={14} className="text-muted-foreground" />
          )}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {getTypeIcon(res.type)}
        </span>
        <span
          className="truncate flex-1 text-xs"
          style={{
            color: isCurrent ? 'var(--foreground)' : 'var(--muted-foreground)',
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
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{titleOverride ??
        t('studio.generate_title', { tileTitle })}</DialogTitle></div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {descriptionOverride ??
            (requireAtLeastOne
              ? t('studio.select_at_least_one_hint', { tileTitle })
              : t('studio.select_sources_hint', { tileTitle }))}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t('studio.sources_label')}
          </span>
          {allResourceIds.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-medium cursor-pointer hover:underline focus-visible:ring-2 focus-visible:ring-offset-1 rounded text-primary"
              aria-label={allSelected ? t('studio.deselect_all') : t('studio.select_all')}
            >
              {allSelected ? t('studio.deselect_all') : t('studio.select_all')}
            </button>
          )}
        </div>
        <div
          className="border rounded-lg overflow-y-auto min-h-[200px] max-h-[320px] py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <HugeiconsIcon icon={Loading03Icon} size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : tree.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              {projectId ? t('studio.no_sources_in_project') : t('studio.select_project')}
            </div>
          ) : (
            tree.map((item) => renderItem(item, 0))
          )}
        </div>
      </div>
    </div><DialogFooter className="border-t px-4 py-3">{<>
          <Button
            type="button"
            onClick={onClose}
            variant="ghost" className="min-h-[44px] px-4"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="min-h-[44px] px-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('learn.generate')}
          </Button>
        </>}</DialogFooter></DialogContent></Dialog>
  );
}
