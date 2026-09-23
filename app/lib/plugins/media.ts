import { requestPlugin } from '@/lib/plugins/request';

export const PLUGIN_IMAGE_MIME: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
};

const DOME_MEDIA_RE = /^dome-media:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HTML_IMAGE_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

export type PluginSiteImage = {
  id: string;
  name: string;
  sitePath: string;
};

export function parseDomeMediaId(src: string): string | null {
  const match = DOME_MEDIA_RE.exec(String(src || '').trim());
  return match ? match[1].toLowerCase() : null;
}

export function pluginSiteImageMap(images: PluginSiteImage[]): Map<string, string> {
  return new Map(images.map((image) => [image.sitePath, image.id]));
}

export function pluginSiteImageFolder(sitePath: string): string {
  const parts = String(sitePath || '').replace(/^\/+/, '').split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

export function pluginSiteImageName(sitePath: string, name?: string): string {
  const file = String(name || '').trim();
  if (file) return file;
  return String(sitePath || '').split('/').filter(Boolean).pop() || '';
}

export function editorMediaSrc(url: string, siteImages?: Map<string, string>): string {
  const trimmed = String(url || '').trim();
  if (parseDomeMediaId(trimmed)) return trimmed;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return trimmed;
  const id = siteImages?.get(trimmed);
  return id ? `dome-media:${id}` : trimmed;
}

export function isLocalMediaUrl(value: string): boolean {
  const raw = String(value || '').trim();
  return /^(blob:|data:)/i.test(raw)
    || /^https?:\/\/localhost(?::\d+)?(?:\/|$)/i.test(raw)
    || /^https?:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/i.test(raw);
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

export async function resolveDomeMediaSrc(src: string): Promise<string> {
  const id = parseDomeMediaId(src);
  if (!id) return src;
  const result = await window.electron.resource.readFile(id);
  if (!result.success || !result.data) {
    throw new Error(result.error || 'CMS media is missing');
  }
  return result.data;
}

export async function resolveEditorMediaSrc(
  url: string,
  siteImages?: Map<string, string>,
): Promise<string> {
  const resolved = editorMediaSrc(url, siteImages);
  if (!parseDomeMediaId(resolved)) return url;
  return resolveDomeMediaSrc(resolved);
}

export async function attachPluginImage(
  pluginId: string,
  resourceId: string,
  file: File,
): Promise<string> {
  const mime = PLUGIN_IMAGE_MIME[file.type];
  if (!mime) throw new Error('Unsupported image type');
  const attached = await requestPlugin<{ id: string }>(pluginId, 'media.attach', {
    resourceId,
    filename: file.name,
    mime,
    content: await fileToBase64(file),
  });
  return `dome-media:${attached.id}`;
}

async function readLocalImage(url: string): Promise<{ filename: string; mime: keyof typeof PLUGIN_IMAGE_MIME; content: string } | null> {
  const data = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+=*)$/i.exec(url.trim());
  if (data) {
    const mime = PLUGIN_IMAGE_MIME[data[1].toLowerCase()];
    if (!mime) return null;
    return { filename: `image.${mime.split('/')[1]}`, mime, content: data[2] };
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const mime = PLUGIN_IMAGE_MIME[blob.type];
    if (!mime) return null;
    return {
      filename: `image.${mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1]}`,
      mime,
      content: await fileToBase64(blob),
    };
  } catch {
    return null;
  }
}

export async function ingestLocalMarkdownImages(
  pluginId: string,
  resourceId: string,
  markdown: string,
): Promise<{ markdown: string; changed: boolean }> {
  const replacements = new Map<string, string>();
  const urls = new Set<string>();
  const add = (url: string) => {
    const trimmed = url.trim();
    if (trimmed && isLocalMediaUrl(trimmed)) urls.add(trimmed);
  };
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) add(match[2] || '');
  for (const match of markdown.matchAll(HTML_IMAGE_RE)) add(match[1] || '');
  for (const url of urls) {
    const image = await readLocalImage(url);
    if (!image) continue;
    const attached = await requestPlugin<{ id: string }>(pluginId, 'media.attach', {
      resourceId,
      filename: image.filename,
      mime: image.mime,
      content: image.content,
    });
    replacements.set(url, `dome-media:${attached.id}`);
  }
  if (replacements.size === 0) return { markdown, changed: false };
  let next = markdown;
  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return { markdown: next, changed: next !== markdown };
}
