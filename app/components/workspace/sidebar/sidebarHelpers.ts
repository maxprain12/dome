/**
 * UnifiedSidebar helpers and tree types (03/T02 — extracted from UnifiedSidebar.tsx).
 */

import type { Resource } from '@/lib/hooks/useResources';
import { FOLDER_COLOR_OPTIONS, NAMED_FOLDER_COLORS } from '@/lib/ui/palettes';

export const FOLDER_AUTO_PALETTE = FOLDER_COLOR_OPTIONS.map((o) => o.value);

export function pickFolderColor(): string {
  return FOLDER_AUTO_PALETTE[Math.floor(Math.random() * FOLDER_AUTO_PALETTE.length)];
}

export function parseMeta(resource: Resource): Record<string, unknown> {
  const m = resource.metadata;
  if (!m) return {};
  if (typeof m === 'string') { try { return JSON.parse(m) as Record<string, unknown>; } catch { return {}; } }
  return m as Record<string, unknown>;
}

export function getFolderColor(resource: Resource): string {
  const color = parseMeta(resource).color as string | undefined;
  if (!color) return 'var(--dome-accent)';
  if (color.startsWith('#')) return color;
  return NAMED_FOLDER_COLORS[color] ?? 'var(--dome-accent)';
}

// ---------------------------------------------------------------------------
// Tree data
// ---------------------------------------------------------------------------
export interface TreeNodeData {
  id: string;
  name: string;
  type: 'folder' | 'notebook' | 'url' | 'youtube' | 'pdf' | 'image' | 'audio' | 'video' | 'ppt' | 'file' | 'artifact';
  children?: TreeNodeData[];
  resource?: Resource;
}

export function buildTree(resources: Resource[]): TreeNodeData[] {
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
export interface CtxState {
  visible: boolean;
  x: number;
  y: number;
  resource: Resource | null;
}
