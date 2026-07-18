/**
 * FolderTabView shared bits (03/T02 — extracted from FolderTabView.tsx):
 * folder color helper, resource-type icon and label/color maps.
 */

import { CONTENT_PINK, FOLDER_COLOR_DEFAULT } from '@/lib/ui/palettes';
import type { Resource } from '@/lib/hooks/useResources';
import ResourceIcon from '@/components/shared/ResourceIcon';

export function getFolderColor(folder: Resource): string {
  const meta = folder.metadata as { color?: string } | undefined;
  return meta?.color ?? 'var(--muted-foreground)';
}

/**
 * Project-root tabs use a project id as tab resourceId.
 * Folder tabs use a folder resource id (`res_*` or legacy UUID from guide seed).
 */
export function isProjectRootFolderTab(
  folderId: string,
  folderResource?: Resource | null,
): boolean {
  if (folderId.startsWith('res_')) return false;
  if (folderResource?.type === 'folder') return false;
  return true;
}

export interface FolderTabViewContext {
  isProjectRoot: boolean;
  /** Folder whose children are listed (`null` = project root). */
  listFolderId: string | null;
  projectId: string;
}

export function resolveFolderTabView(
  folderId: string,
  folderResource?: Resource | null,
): FolderTabViewContext {
  if (isProjectRootFolderTab(folderId, folderResource)) {
    return { isProjectRoot: true, listFolderId: null, projectId: folderId };
  }
  return {
    isProjectRoot: false,
    listFolderId: folderId,
    projectId: folderResource?.project_id ?? '',
  };
}


export function ResourceTypeIcon({ type, name, className }: { type: string; name?: string; className?: string }) {
  return (
    <ResourceIcon
      type={type}
      name={name}
      size={16}
      className={className ?? 'size-4 shrink-0'}
      strokeWidth={1.75}
    />
  );
}

export const TYPE_LABELS: Record<string, string> = {
  note: 'Nota', notebook: 'Cuaderno', url: 'URL',
  pdf: 'PDF', image: 'Imagen', video: 'Video',
  audio: 'Audio', document: 'Documento', ppt: 'Presentación',
  excel: 'Excel', csv: 'CSV', xlsx: 'Excel', docx: 'Documento',
};

export const TYPE_COLORS: Record<string, string> = {
  note: 'var(--primary)', notebook: 'var(--primary)', url: 'var(--success)',
  pdf: 'var(--destructive)', image: 'var(--warning)', video: CONTENT_PINK, audio: 'var(--primary)', ppt: 'var(--warning)',
};

// ─── ColorPickerPopover ───────────────────────────────────────────────────────

export { FOLDER_COLOR_DEFAULT };
