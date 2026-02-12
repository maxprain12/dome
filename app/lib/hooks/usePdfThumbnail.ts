import { useEffect, useRef } from 'react';
import type { Resource } from '@/types';
import { generatePdfThumbnailFromData } from '@/lib/pdf/pdf-loader';

const generating = new Set<string>();

/**
 * Generates PDF thumbnail in renderer when resource is PDF without thumbnail_data.
 * Uses pdf.js (already loaded) + browser canvas. Saves via IPC; resource:updated
 * broadcast updates the list.
 */
export function usePdfThumbnail(resource: Resource | undefined) {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      !resource ||
      resource.type !== 'pdf' ||
      resource.thumbnail_data ||
      !resource.internal_path ||
      typeof window === 'undefined' ||
      !window.electron?.resource
    ) {
      return;
    }

    if (generating.has(resource.id)) return;
    generating.add(resource.id);

    (async () => {
      try {
        const result = await window.electron.resource.readFile(resource.id);
        if (!mounted.current || !result?.success || !result.data) return;

        const thumbnail = await generatePdfThumbnailFromData(result.data);
        if (!mounted.current || !thumbnail) return;

        const ok = await window.electron.resource.setThumbnail(resource.id, thumbnail);
        if (!ok?.success) {
          console.warn('[PDF] Failed to save thumbnail:', resource.id);
        }
      } catch (err) {
        console.warn('[PDF] Thumbnail generation failed:', resource.id, err);
      } finally {
        generating.delete(resource.id);
      }
    })();
  }, [resource?.id, resource?.type, resource?.internal_path, resource?.thumbnail_data]);
}
