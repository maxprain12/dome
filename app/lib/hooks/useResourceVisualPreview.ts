import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtifactRecord, Resource } from '@/types';
import { loadNoteMarkdown } from '@/lib/notes/loadNoteMarkdown';

/**
 * Lazy, cached visual previews for `ResourceCard`:
 *  - PDF: first-page PNG data URL via `window.electron.pdf.renderPage`.
 *  - artifact: record via `window.electron.artifacts.get`, exposing a short
 *    snippet + artifact type for the card to render a type-specific mini-visual.
 *
 * The module-level cache survives card unmounts so scrolling away and back
 * doesn't re-fetch. It is bounded (LRU-ish by insertion order) so a long
 * browsing session can't grow it without limit.
 */

const MAX_CACHE_ENTRIES = 50;
const SNIPPET_MAX = 220;

const pdfCache = new Map<string, string>();
const artifactCache = new Map<string, ArtifactPreview>();
const detailCache = new Map<string, ResourceDetailPreview>();

/** In-flight fetches deduped per resource id. */
const pdfInflight = new Map<string, Promise<string | null>>();
const artifactInflight = new Map<string, Promise<ArtifactPreview | null>>();
const detailInflight = new Map<string, Promise<ResourceDetailPreview | null>>();

interface ArtifactPreview {
  artifactType: string;
  /** Short, safe text snippet derived from the artifact's state.data. */
  snippet: string;
  /** Human-friendly title from the artifact record (falls back to resource title). */
  title: string | null;
  /** Raw HTML template, for rendering a real visual thumbnail in an iframe. */
  template: string | null;
  /** The artifact's state.data, injected as `window.DOME_DATA` for the preview. */
  data: Record<string, unknown> | null;
}

/** Lazily-fetched detail for image/text resources (content + thumbnail). */
interface ResourceDetailPreview {
  /** Thumbnail / cover image URL (data URL or file path), when available. */
  imageUrl: string | null;
  /** Short plain-text snippet of the resource content, when available. */
  snippet: string | null;
  /** Raw Markdown source (vault notes), for rendered card previews. */
  markdown: string | null;
}

/** Types that get a content/text snippet preview. */
const TEXT_TYPES = new Set([
  'note', 'notebook', 'document', 'docx', 'excel', 'csv', 'ppt',
  'transcription', 'markdown', 'youtube',
]);
/** Types that get an image/thumbnail preview. */
const IMAGE_TYPES = new Set(['image', 'video', 'url']);

function stripToPlainText(input: string): string {
  const trimmed = input.trim();
  // Tiptap/ProseMirror JSON → collect text nodes.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parts: string[] = [];
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const n = node as { text?: unknown; content?: unknown };
        if (typeof n.text === 'string') parts.push(n.text);
        if (Array.isArray(n.content)) {
          for (const c of n.content) walk(c);
          parts.push(' ');
        }
      };
      walk(JSON.parse(trimmed));
      const text = parts.join('').replace(/\s+/g, ' ').trim();
      if (text) return text;
    } catch {
      /* not JSON — fall through to HTML strip */
    }
  }
  return trimmed.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const MARKDOWN_MAX = 1500;

/**
 * Vault notes store raw Markdown in `content`; older notes may hold Tiptap
 * JSON and imported pages may hold HTML — only pass through actual Markdown
 * so cards can render it formatted.
 */
function extractMarkdownSource(content: unknown): string | null {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('<')) return null;
  return trimmed.slice(0, MARKDOWN_MAX);
}

function parseMeta(metadata: unknown): Record<string, unknown> {
  if (metadata == null) return {};
  if (typeof metadata === 'object') return metadata as Record<string, unknown>;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function extractImageUrl(
  resource: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string | null {
  const thumb = resource.thumbnail_data;
  if (typeof thumb === 'string' && thumb.trim()) return thumb;

  for (const key of ['preview_image', 'thumbnail', 'og_image', 'cover'] as const) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  if (resource.type === 'image' && typeof resource.file_path === 'string' && resource.file_path) {
    return resource.file_path;
  }
  return null;
}

function extractSnippet(
  resource: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string | null {
  let snippet: string | null = null;
  for (const key of ['summary', 'description', 'excerpt', 'snippet', 'preview_text'] as const) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      snippet = value.trim();
      break;
    }
  }
  if (!snippet && typeof resource.content_text === 'string' && resource.content_text.trim()) {
    snippet = resource.content_text.trim();
  }
  if (!snippet && typeof resource.content === 'string' && resource.content.trim()) {
    snippet = stripToPlainText(resource.content);
  }
  if (snippet && snippet.length > SNIPPET_MAX) return `${snippet.slice(0, SNIPPET_MAX - 1)}…`;
  return snippet;
}

async function extractMarkdown(resource: Record<string, unknown>): Promise<string | null> {
  let markdown: string | null = null;
  if (resource.type === 'note') {
    try {
      const noteMarkdown = await loadNoteMarkdown(resource as unknown as Resource);
      markdown = noteMarkdown?.trim() ? noteMarkdown.trim().slice(0, MARKDOWN_MAX) : null;
    } catch { /* fall back to content-based detection */ }
  }
  return markdown || extractMarkdownSource(resource.content);
}

async function fetchResourceDetail(resourceId: string): Promise<ResourceDetailPreview | null> {
  const cached = detailCache.get(resourceId);
  if (cached) return cached;
  const inflight = detailInflight.get(resourceId);
  if (inflight) return inflight;

  const promise = (async (): Promise<ResourceDetailPreview | null> => {
    try {
      const result = await window.electron?.db?.resources?.getById?.(resourceId);
      if (!result || typeof result !== 'object' || !('success' in result) || !result.success) {
        return null;
      }
      const r = (result as { data?: Record<string, unknown> }).data;
      if (!r) return null;
      const meta = parseMeta(r.metadata);
      const imageUrl = extractImageUrl(r, meta);
      const snippet = extractSnippet(r, meta);

      // Notes keep their Markdown in the vault `.md` mirror (DB `content` is
      // empty) — load it through the same path the editor uses so the card
      // preview matches what the editor renders.
      const markdown = await extractMarkdown(r);

      const detail: ResourceDetailPreview = {
        imageUrl,
        snippet: snippet || null,
        markdown,
      };
      setBounded(detailCache, resourceId, detail);
      return detail;
    } catch {
      return null;
    } finally {
      detailInflight.delete(resourceId);
    }
  })();

  detailInflight.set(resourceId, promise);
  return promise;
}

function setBounded<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  while (map.size > MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function firstStringish(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const r = firstStringish(item, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const r = firstStringish(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

async function fetchPdfPreview(resourceId: string): Promise<string | null> {
  const cached = pdfCache.get(resourceId);
  if (cached) return cached;
  const inflight = pdfInflight.get(resourceId);
  if (inflight) return inflight;

  const promise = (async (): Promise<string | null> => {
    try {
      const result = await window.electron?.pdf?.renderPage?.({
        resourceId,
        pageNumber: 1,
        scale: 1,
      });
      const dataUrl =
        result && typeof result === 'object' && 'success' in result && result.success
          ? (result as { dataUrl?: string }).dataUrl
          : undefined;
      if (typeof dataUrl === 'string' && dataUrl.length > 0) {
        setBounded(pdfCache, resourceId, dataUrl);
        return dataUrl;
      }
      return null;
    } catch {
      return null;
    } finally {
      pdfInflight.delete(resourceId);
    }
  })();

  pdfInflight.set(resourceId, promise);
  return promise;
}

async function fetchArtifactPreview(resourceId: string): Promise<ArtifactPreview | null> {
  const cached = artifactCache.get(resourceId);
  if (cached) return cached;
  const inflight = artifactInflight.get(resourceId);
  if (inflight) return inflight;

  const promise = (async (): Promise<ArtifactPreview | null> => {
    try {
      const result = await window.electron?.artifacts?.get?.(resourceId);
      if (!result || typeof result !== 'object' || !('success' in result) || !result.success) {
        return null;
      }
      const record = (result as { data?: ArtifactRecord }).data;
      if (!record) return null;
      const state =
        record.state && typeof record.state === 'object'
          ? (record.state as Record<string, unknown>)
          : {};
      const data =
        state.data && typeof state.data === 'object' && !Array.isArray(state.data)
          ? (state.data as Record<string, unknown>)
          : null;
      const candidates: unknown[] = [
        data?.['title'],
        data?.['name'],
        data?.['question'],
        data?.['formula'],
        data?.['kpis'],
        data?.['tabs'],
        data?.['items'],
        data?.['events'],
        data?.['rows'],
        state['title'],
      ];
      let snippet: string | null = null;
      for (const c of candidates) {
        snippet = firstStringish(c);
        if (snippet) break;
      }
      if (!snippet && typeof state.html === 'string') {
        // Strip tags and grab a fragment so HTML artifacts still show something.
        const stripped = state.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (stripped) snippet = stripped;
      }
      if (!snippet) snippet = firstStringish(state);
      if (snippet && snippet.length > 140) snippet = `${snippet.slice(0, 137)}…`;

      // The renderable HTML may live in `record.template` (kind-B template) or
      // in `state.html` (HTML artifacts) — prefer whichever is present.
      const htmlSource =
        typeof record.template === 'string' && record.template.trim()
          ? record.template
          : typeof state.html === 'string' && state.html.trim()
            ? state.html
            : null;

      const preview: ArtifactPreview = {
        artifactType: record.artifactType ?? 'custom',
        snippet: snippet ?? '',
        title: record.title ?? null,
        template: htmlSource,
        data,
      };
      setBounded(artifactCache, resourceId, preview);
      return preview;
    } catch {
      return null;
    } finally {
      artifactInflight.delete(resourceId);
    }
  })();

  artifactInflight.set(resourceId, promise);
  return promise;
}

export type ResourcePreviewKind = 'pdf' | 'artifact' | 'image' | 'text' | 'none';

export interface ResourceVisualPreview {
  kind: ResourcePreviewKind;
  loading: boolean;
  /** Data URL of the first PDF page (pdf only). */
  pdfDataUrl: string | null;
  /** Artifact preview descriptor (artifact only). */
  artifact: ArtifactPreview | null;
  /** Thumbnail / cover image URL (image/url/video kinds). */
  imageUrl: string | null;
  /** Plain-text content snippet (text kinds, also a fallback for url). */
  snippet: string | null;
  /** Raw Markdown source for rendered note previews (text kinds). */
  markdown: string | null;
  /** True if the fetch failed (caller should fall back to the generic icon). */
  failed: boolean;
}

const EMPTY_PREVIEW: ResourceVisualPreview = {
  kind: 'none',
  loading: false,
  pdfDataUrl: null,
  artifact: null,
  imageUrl: null,
  snippet: null,
  markdown: null,
  failed: false,
};

function kindForType(type: string | undefined): ResourcePreviewKind {
  if (type === 'pdf') return 'pdf';
  if (type === 'artifact') return 'artifact';
  if (type && IMAGE_TYPES.has(type)) return 'image';
  if (type && TEXT_TYPES.has(type)) return 'text';
  return 'none';
}

function initialPreview(resource: Resource | null | undefined): ResourceVisualPreview {
  if (!resource) return EMPTY_PREVIEW;
  if (resource.type === 'pdf' && pdfCache.has(resource.id)) {
    return {
      ...EMPTY_PREVIEW,
      kind: 'pdf',
      pdfDataUrl: pdfCache.get(resource.id) ?? null,
    };
  }
  if (resource.type === 'artifact' && artifactCache.has(resource.id)) {
    return {
      ...EMPTY_PREVIEW,
      kind: 'artifact',
      artifact: artifactCache.get(resource.id) ?? null,
    };
  }
  const detailKind = kindForType(resource.type);
  if ((detailKind === 'image' || detailKind === 'text') && detailCache.has(resource.id)) {
    const detail = detailCache.get(resource.id) ?? null;
    return {
      ...EMPTY_PREVIEW,
      kind: detailKind,
      imageUrl: detail?.imageUrl ?? null,
      snippet: detail?.snippet ?? null,
      markdown: detail?.markdown ?? null,
    };
  }
  return EMPTY_PREVIEW;
}

function isElementInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < (typeof window !== 'undefined' ? window.innerHeight : 0) &&
    rect.left < (typeof window !== 'undefined' ? window.innerWidth : 0)
  );
}

/**
 * Returns a visual preview descriptor for the given resource plus a ref
 * callback to attach to the card's preview container.
 *
 * The fetch is gated by `IntersectionObserver` so off-screen cards don't pay
 * the IPC round-trip. Returns immediately with cached data when available.
 */
export function useResourceVisualPreview(
  resource: Resource | null | undefined,
  options: { rootMargin?: string; enabled?: boolean } = {},
): {
  preview: ResourceVisualPreview;
  ref: (node: Element | null) => void;
} {
  const [preview, setPreview] = useState<ResourceVisualPreview>(() => initialPreview(resource));
  const [, setEl] = useState<Element | null>(null);
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const kind: ResourcePreviewKind = kindForType(resource?.type);
  const enabled = options.enabled !== false;
  const rootMargin = options.rootMargin ?? '200px 0px';

  const ref = useCallback(
    (node: Element | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      setEl(node);
      if (!node || !enabled || kind === 'none') return;
      // Nested scroll containers (folder list) can report 0×0 on the first
      // paint — still kick off the fetch next frame if the card is on-screen.
      if (typeof IntersectionObserver === 'undefined' || isElementInViewport(node)) {
        setVisible(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setVisible(true);
              observer.disconnect();
              observerRef.current = null;
              break;
            }
          }
        },
        { rootMargin },
      );
      observer.observe(node);
      observerRef.current = observer;
      // Fallback: if layout settles into view without an IO callback, fetch anyway.
      requestAnimationFrame(() => {
        if (observerRef.current && isElementInViewport(node)) {
          setVisible(true);
          observer.disconnect();
          observerRef.current = null;
        }
      });
    },
    [enabled, kind, rootMargin],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const observeKey = `${kind}:${enabled}:${rootMargin}`;
  const prevObserveKeyRef = useRef(observeKey);
  if (observeKey !== prevObserveKeyRef.current) {
    prevObserveKeyRef.current = observeKey;
    if (!enabled || kind === 'none') {
      setVisible(false);
    }
  }

  useEffect(() => {
    if (!enabled || !resource || kind === 'none' || !visible) return;

    let cancelled = false;

    const run = async () => {
      // Keep the target kind while loading so consumers can show the right skeleton.
      setPreview((prev) => ({ ...prev, kind, loading: true, failed: false }));

      if (kind === 'pdf') {
        const dataUrl = await fetchPdfPreview(resource.id);
        if (cancelled) return;
        setPreview({
          ...EMPTY_PREVIEW,
          kind: 'pdf',
          pdfDataUrl: dataUrl,
          failed: dataUrl == null,
          loading: false,
        });
      } else if (kind === 'artifact') {
        const artifact = await fetchArtifactPreview(resource.id);
        if (cancelled) return;
        setPreview({
          ...EMPTY_PREVIEW,
          kind: 'artifact',
          artifact,
          failed: artifact == null,
          loading: false,
        });
      } else {
        // image / text — lazily fetch content + thumbnail + note markdown.
        const detail = await fetchResourceDetail(resource.id);
        if (cancelled) return;
        const hasVisual = Boolean(
          detail?.imageUrl || detail?.snippet || detail?.markdown,
        );
        setPreview({
          ...EMPTY_PREVIEW,
          kind,
          imageUrl: detail?.imageUrl ?? null,
          snippet: detail?.snippet ?? null,
          markdown: detail?.markdown ?? null,
          failed: detail == null || !hasVisual,
          loading: false,
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [resource, kind, enabled, visible]);

  return { preview, ref };
}