import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  File,
  Video,
  Music,
  Image,
  Link2,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/types';

function getTypeIcon(type: string, size = 14) {
  const props = { size, className: 'shrink-0' };
  switch (type) {
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

function collectResourceIds(node: FolderNode | Resource): string[] {
  if (node.type !== 'folder') return [node.id];
  const folder = node as FolderNode;
  return folder.children.flatMap(collectResourceIds);
}

const TOKEN_BUDGET = 128_000;

function estimateResourceTokens(resource: Resource): number {
  const meta = resource.metadata as { content_length?: number; char_count?: number } | undefined;
  const chars =
    meta?.content_length ??
    meta?.char_count ??
    (resource.title?.length ?? 0) + 1200;
  return Math.max(1, Math.round(chars / 4));
}

function flattenResources(items: (FolderNode | Resource)[]): Resource[] {
  const out: Resource[] = [];
  for (const item of items) {
    if (item.type === 'folder') {
      out.push(...flattenResources((item as FolderNode).children));
    } else {
      out.push(item as Resource);
    }
  }
  return out;
}

function filterTree(items: (FolderNode | Resource)[], query: string): (FolderNode | Resource)[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const walk = (item: FolderNode | Resource): FolderNode | Resource | null => {
    if (item.type === 'folder') {
      const folder = item as FolderNode;
      const children = folder.children.map(walk).filter(Boolean) as (FolderNode | Resource)[];
      const titleMatch = folder.title.toLowerCase().includes(q);
      if (titleMatch || children.length > 0) {
        return { ...folder, children: titleMatch ? folder.children : children };
      }
      return null;
    }
    const res = item as Resource;
    return res.title.toLowerCase().includes(q) ? res : null;
  };

  return items.map(walk).filter(Boolean) as (FolderNode | Resource)[];
}

export interface StepSourcePickerProps {
  projectId: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function StepSourcePicker({ projectId, selectedIds, onChange }: StepSourcePickerProps) {
  const { t } = useTranslation();
  const [allItems, setAllItems] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

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
        setAllItems(result.success && result.data ? (result.data as Resource[]) : []);
      } catch (err) {
        console.error('[StepSourcePicker] Failed to fetch:', err);
        setAllItems([]);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchResources();
  }, [projectId]);

  const tree = useMemo(() => buildFolderTree(allItems), [allItems]);
  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search]);
  const allResources = useMemo(() => flattenResources(tree), [tree]);

  const estimatedTokens = useMemo(() => {
    const selected = allResources.filter((r) => selectedIds.includes(r.id));
    return selected.reduce((sum, r) => sum + estimateResourceTokens(r), 0);
  }, [allResources, selectedIds]);

  const overBudget = estimatedTokens > TOKEN_BUDGET;

  const toggleResource = useCallback(
    (id: string) => {
      onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    },
    [onChange, selectedIds],
  );

  const toggleFolder = useCallback(
    (node: FolderNode) => {
      const ids = collectResourceIds(node);
      const allSelected = ids.every((id) => selectedIds.includes(id));
      if (allSelected) {
        onChange(selectedIds.filter((id) => !ids.includes(id)));
      } else {
        onChange([...new Set([...selectedIds, ...ids])]);
      }
    },
    [onChange, selectedIds],
  );

  const folderCheckState = (node: FolderNode): 'on' | 'off' | 'partial' => {
    const ids = collectResourceIds(node);
    if (ids.length === 0) return 'off';
    const selectedCount = ids.filter((id) => selectedIds.includes(id)).length;
    if (selectedCount === 0) return 'off';
    if (selectedCount === ids.length) return 'on';
    return 'partial';
  };

  const toggleExpand = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  function renderItem(item: FolderNode | Resource, depth: number): React.ReactNode {
    if (item.type === 'folder') {
      const folder = item as FolderNode;
      const isExpanded = expandedFolderIds.has(folder.id) || search.trim().length > 0;
      const check = folderCheckState(folder);

      return (
        <div key={folder.id}>
          <div
            className={`lr-source-row${depth > 0 ? ' indent' : ''}${depth > 1 ? ' indent2' : ''}`}
            style={{ paddingLeft: 12 + depth * 24 }}
          >
            <button
              type="button"
              className={`lr-source-check${check === 'on' ? ' on' : check === 'partial' ? ' partial' : ''}`}
              aria-label={t('studio.folder', 'Folder')}
              onClick={() => toggleFolder(folder)}
            >
              {check === 'on' ? <Check size={10} /> : null}
            </button>
            <button
              type="button"
              className="lr-source-folder"
              onClick={() => toggleExpand(folder.id)}
              aria-expanded={isExpanded}
            >
              {folder.children.length > 0 ? (
                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <span style={{ width: 14 }} />
              )}
            </button>
            <FolderOpen
              size={14}
              className="lr-source-folder"
              style={{ color: (folder.metadata?.color as string) || 'var(--accent)' }}
            />
            <span className="lr-source-name">{folder.title}</span>
            <span className="lr-source-meta">{collectResourceIds(folder).length}</span>
          </div>
          {isExpanded ? folder.children.map((child) => renderItem(child, depth + 1)) : null}
        </div>
      );
    }

    const res = item as Resource;
    const isSelected = selectedIds.includes(res.id);
    return (
      <button
        key={res.id}
        type="button"
        className={`lr-source-row${isSelected ? ' selected' : ''}${depth > 0 ? ' indent' : ''}${depth > 1 ? ' indent2' : ''}`}
        style={{ paddingLeft: 12 + depth * 24, width: '100%', border: 'none', background: 'transparent' }}
        onClick={() => toggleResource(res.id)}
      >
        <span className={`lr-source-check${isSelected ? ' on' : ''}`}>
          {isSelected ? <Check size={10} /> : null}
        </span>
        {getTypeIcon(res.type)}
        <span className="lr-source-name">{res.title}</span>
      </button>
    );
  }

  return (
    <div>
      <div className="lr-source-list">
        <div className="lr-source-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('learn.source_search', 'Search sources…')}
          />
        </div>
        <div className="lr-source-tree">
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="lr-source-row">
              <span className="lr-source-name muted">
                {projectId ? t('studio.no_sources_in_project', 'No resources in project') : t('studio.select_project', 'Select a project')}
              </span>
            </div>
          ) : (
            filteredTree.map((item) => renderItem(item, 0))
          )}
        </div>
      </div>
      <p className="lr-field-hint" style={{ marginTop: 8, color: overBudget ? 'var(--warning-text)' : undefined }}>
        {t('learn.source_token_estimate', '~{{tokens}} tokens estimated', { tokens: estimatedTokens.toLocaleString() })}
        {' · '}
        {t('learn.source_selected_count', '{{count}} selected', { count: selectedIds.length })}
        {overBudget
          ? ` · ${t('learn.source_over_budget', 'May exceed model context budget')}`
          : ''}
      </p>
    </div>
  );
}
