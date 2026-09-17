import type { Resource } from '@/types';
import { loadNoteMarkdown } from '@/lib/notes/loadNoteMarkdown';
import { classifyPreviewContent } from '@/components/search/commandPalettePreviewBody';

const CACHE_MAX = 40;

export interface ResourcePreviewData {
  title: string;
  type: string;
  updatedAt: number | null;
  folderPath: string;
  markdown: string | null;
  text: string | null;
  html: string | null;
  imageUrl: string | null;
  pdfDataUrl: string | null;
}

const cache = new Map<string, ResourcePreviewData>();

function remember(id: string, data: ResourcePreviewData): void {
  if (cache.has(id)) cache.delete(id);
  cache.set(id, data);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function getCachedResourcePreview(resourceId: string): ResourcePreviewData | undefined {
  return cache.get(resourceId);
}

async function fetchFolderPath(folderId: unknown): Promise<string> {
  const parts: string[] = [];
  let current = typeof folderId === 'string' ? folderId : null;
  const seen = new Set<string>();
  while (current && !seen.has(current) && parts.length < 4) {
    seen.add(current);
    const res = await window.electron?.db?.resources?.getById?.(current);
    if (!res?.success || !res.data) break;
    const row = res.data as { title?: string; folder_id?: string | null };
    if (row.title) parts.unshift(row.title);
    current = typeof row.folder_id === 'string' ? row.folder_id : null;
  }
  return parts.join(' / ');
}

async function fillTypedPreview(
  data: ResourcePreviewData,
  resourceId: string,
  row: Record<string, unknown>,
): Promise<void> {
  const type = data.type;
  if (type === 'note' || type === 'notebook') {
    try {
      const md = await loadNoteMarkdown(row as unknown as Resource);
      Object.assign(data, classifyPreviewContent(md));
    } catch {
      /* fall through */
    }
    return;
  }
  if (type === 'pdf') {
    try {
      const page = await window.electron?.pdf?.renderPage?.({ resourceId, pageNumber: 1, scale: 1 });
      if (page && typeof page === 'object' && 'success' in page && page.success) {
        const url = (page as { dataUrl?: string }).dataUrl;
        if (typeof url === 'string' && url) data.pdfDataUrl = url;
      }
    } catch {
      /* fall through */
    }
    return;
  }
  if ((type === 'image' || type === 'video') && typeof row.thumbnail_data === 'string' && row.thumbnail_data) {
    data.imageUrl = row.thumbnail_data;
    return;
  }
  if (type === 'artifact') {
    try {
      const result = await window.electron?.artifacts?.get?.(resourceId);
      const record = result && typeof result === 'object' && 'success' in result && result.success
        ? (result as { data?: { template?: unknown; state?: { html?: unknown } } }).data
        : null;
      const template = typeof record?.template === 'string' ? record.template : '';
      const stateHtml = typeof record?.state?.html === 'string' ? record.state.html : '';
      Object.assign(data, classifyPreviewContent(template || stateHtml));
    } catch {
      /* fall through */
    }
  }
}

export async function loadResourcePreview(resourceId: string): Promise<ResourcePreviewData | null> {
  const cached = cache.get(resourceId);
  if (cached) return cached;

  const res = await window.electron?.db?.resources?.getById?.(resourceId);
  if (!res?.success || !res.data) return null;
  const row = res.data as unknown as Record<string, unknown>;
  const type = String(row.type ?? 'note');

  const data: ResourcePreviewData = {
    title: String(row.title ?? ''),
    type,
    updatedAt: typeof row.updated_at === 'number' ? row.updated_at : null,
    folderPath: await fetchFolderPath(row.folder_id),
    markdown: null,
    text: null,
    html: null,
    imageUrl: null,
    pdfDataUrl: null,
  };

  await fillTypedPreview(data, resourceId, row);

  if (!data.markdown && !data.pdfDataUrl && !data.imageUrl && !data.html) {
    const text =
      (typeof row.content_text === 'string' && row.content_text.trim()) ||
      (typeof row.content === 'string' && row.content.trim()) ||
      '';
    Object.assign(data, classifyPreviewContent(text || null));
  }

  remember(resourceId, data);
  return data;
}
