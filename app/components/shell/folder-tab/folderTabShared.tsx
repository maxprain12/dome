/**
 * FolderTabView shared bits (03/T02 — extracted from FolderTabView.tsx):
 * folder color helper, resource-type icon and label/color maps.
 */

import { CONTENT_PINK, FOLDER_COLOR_DEFAULT } from '@/lib/ui/palettes';
import type { Resource } from '@/lib/hooks/useResources';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';

export function getFolderColor(folder: Resource): string {
  const meta = folder.metadata as { color?: string } | undefined;
  return meta?.color ?? 'var(--dome-text-muted)';
}


export function ResourceTypeIcon({ type, name, className }: { type: string; name?: string; className?: string }) {
  return (
    <DomeResourceIcon
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
};

export const TYPE_COLORS: Record<string, string> = {
  note: 'var(--accent)', notebook: 'var(--accent)', url: 'var(--success)',
  pdf: 'var(--error)', image: 'var(--warning)', video: CONTENT_PINK, audio: 'var(--accent)', ppt: 'var(--warning)',
};

// ─── ColorPickerPopover ───────────────────────────────────────────────────────

export { FOLDER_COLOR_DEFAULT };
