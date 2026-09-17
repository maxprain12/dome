import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Folder01Icon,
} from '@hugeicons/core-free-icons';
import type { Resource } from '@/types';
import ResourceIcon from '@/components/shared/ResourceIcon';
import MarkdownBody from '@/components/shared/MarkdownBody';
import { loadNoteMarkdown } from '@/lib/notes/loadNoteMarkdown';
import { formatDistanceToNow } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { type PalettePreviewTarget } from './commandPaletteTypes';
import {
  classifyPreviewContent,
  previewPlainText,
  wrapCmdkPreviewHtml,
} from './commandPalettePreviewBody';
import { CommandPaletteSourcePreview } from './CommandPaletteSourcePreview';
import { useDomeThemeSnapshot } from '@/lib/chat/useDomeThemeSnapshot';

const CACHE_MAX = 30;
const SNIPPET_RADIUS = 260;

interface PreviewData {
  title: string;
  type: string;
  updatedAt: number | null;
  folderPath: string;
  /** Note body rendered as Markdown. */
  markdown: string | null;
  /** Plain-text body (non-note text resources). */
  text: string | null;
  /** Renderable HTML document (agent reports, artifacts, imported pages). */
  html: string | null;
  /** Image cover (image/video thumbnails). */
  imageUrl: string | null;
  /** First PDF page render. */
  pdfDataUrl: string | null;
}

const cache = new Map<string, PreviewData>();

function remember(id: string, data: PreviewData): void {
  if (cache.has(id)) cache.delete(id);
  cache.set(id, data);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
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

async function fetchPreview(resourceId: string): Promise<PreviewData | null> {
  const res = await window.electron?.db?.resources?.getById?.(resourceId);
  if (!res?.success || !res.data) return null;
  const r = res.data as unknown as Record<string, unknown>;
  const type = String(r.type ?? 'note');

  const data: PreviewData = {
    title: String(r.title ?? ''),
    type,
    updatedAt: typeof r.updated_at === 'number' ? r.updated_at : null,
    folderPath: await fetchFolderPath(r.folder_id),
    markdown: null,
    text: null,
    html: null,
    imageUrl: null,
    pdfDataUrl: null,
  };

  if (type === 'note' || type === 'notebook') {
    try {
      const md = await loadNoteMarkdown(r as unknown as Resource);
      Object.assign(data, classifyPreviewContent(md));
    } catch { /* fall through to plain text */ }
  } else if (type === 'pdf') {
    try {
      const page = await window.electron?.pdf?.renderPage?.({ resourceId, pageNumber: 1, scale: 1 });
      if (page && typeof page === 'object' && 'success' in page && page.success) {
        const url = (page as { dataUrl?: string }).dataUrl;
        if (typeof url === 'string' && url) data.pdfDataUrl = url;
      }
    } catch { /* fall through to plain text */ }
  } else if ((type === 'image' || type === 'video') && typeof r.thumbnail_data === 'string' && r.thumbnail_data) {
    data.imageUrl = r.thumbnail_data;
  } else if (type === 'artifact') {
    try {
      const result = await window.electron?.artifacts?.get?.(resourceId);
      const record = result && typeof result === 'object' && 'success' in result && result.success
        ? (result as { data?: { template?: unknown; state?: { html?: unknown } } }).data
        : null;
      const template = typeof record?.template === 'string' ? record.template : '';
      const stateHtml = typeof record?.state?.html === 'string' ? record.state.html : '';
      Object.assign(data, classifyPreviewContent(template || stateHtml));
    } catch { /* fall through to plain text */ }
  }

  if (!data.markdown && !data.pdfDataUrl && !data.imageUrl && !data.html) {
    const text =
      (typeof r.content_text === 'string' && r.content_text.trim()) ||
      (typeof r.content === 'string' && r.content.trim()) ||
      '';
    Object.assign(data, classifyPreviewContent(text || null));
  }

  return data;
}

/** Slice `text` around the first occurrence of `query` so the match is visible. */
function contextAround(text: string, query: string): string {
  const idx = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (idx < 0) return text.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(<mark key={idx}>{match[0]}</mark>);
    last = idx + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

const HTML_PAGE_WIDTH = 720;

function extraHostTokens(): string {
  if (typeof document === 'undefined') return '';
  const cs = getComputedStyle(document.documentElement);
  return ['--font-heading', '--font-sans', '--radius']
    .map((name) => {
      const value = cs.getPropertyValue(name).trim();
      return value ? `${name}:${value};` : '';
    })
    .join('');
}

function CmdkHtmlPreview({ html, title }: { html: string; title: string }) {
  const theme = useDomeThemeSnapshot();
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const srcDoc = useMemo(() => {
    return wrapCmdkPreviewHtml(html, `${theme.cssVars}${extraHostTokens()}`);
  }, [html, theme.cssVars]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const sync = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(Math.min(1, width / HTML_PAGE_WIDTH));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [srcDoc]);

  const safeScale = scale > 0 ? scale : 1;

  return (
    <div ref={hostRef} className="relative h-full min-h-0 overflow-hidden bg-muted/40">
      <iframe
        title={title}
        sandbox=""
        srcDoc={srcDoc}
        className="absolute left-0 top-0 origin-top-left border-0 bg-background"
        style={{
          width: HTML_PAGE_WIDTH,
          height: `${100 / safeScale}%`,
          transform: `scale(${safeScale})`,
        }}
        tabIndex={-1}
      />
    </div>
  );
}

interface Props {
  target: PalettePreviewTarget;
  query: string;
}

/**
 * Right-hand preview pane of the command palette: resource content or
 * source-hit metadata (task / mail / person / post).
 */
export default function CommandPaletteResourcePreview({ target, query }: Props) {
  const { t } = useTranslation();
  const resourceId = target.kind === 'resource' ? target.resourceId : null;
  const [preview, setPreview] = useState<PreviewData | null>(() =>
    resourceId ? (cache.get(resourceId) ?? null) : null,
  );
  const [loading, setLoading] = useState(Boolean(resourceId && !cache.has(resourceId)));

  useEffect(() => {
    if (!resourceId) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(resourceId);
    if (cached) {
      setPreview(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchPreview(resourceId);
        if (cancelled) return;
        if (data) remember(resourceId, data);
        setPreview(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [resourceId]);

  const matchContext = useMemo(() => {
    if (!preview || !query.trim()) return null;
    const source = previewPlainText(preview.html ?? preview.markdown ?? preview.text);
    if (!source || source.toLowerCase().indexOf(query.trim().toLowerCase()) < 0) return null;
    return contextAround(source, query.trim());
  }, [preview, query]);

  if (target.kind === 'source') {
    return (
      <CommandPaletteSourcePreview
        hit={target.hit}
        query={query}
        highlight={highlight}
        contextAround={contextAround}
      />
    );
  }

  if (loading && !preview) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-4 text-muted-foreground" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {t('command.preview_empty')}
      </div>
    );
  }

  return (
    <div className="dome-cmdk-preview flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-muted-foreground">
            <ResourceIcon type={preview.type} name={preview.title} size={15} strokeWidth={1.5} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
            {preview.title}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {preview.folderPath ? (
            <>
              <HugeiconsIcon icon={Folder01Icon} className="size-3 shrink-0" />
              <span className="truncate">{preview.folderPath}</span>
            </>
          ) : null}
          {preview.updatedAt ? (
            <span className="ml-auto shrink-0">{formatDistanceToNow(preview.updatedAt)}</span>
          ) : null}
        </div>
      </div>

      {matchContext && !preview.html && !preview.pdfDataUrl && !preview.imageUrl ? (
        <div className="shrink-0 border-b bg-primary/5 px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="line-clamp-4">{highlight(matchContext, query.trim())}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {preview.html ? (
          <CmdkHtmlPreview html={preview.html} title={t('command.preview_frame')} />
        ) : preview.markdown ? (
          <div className="h-full overflow-y-auto px-1 py-1">
            <MarkdownBody content={preview.markdown} surface={false} compact />
          </div>
        ) : preview.pdfDataUrl ? (
          <div className="h-full overflow-y-auto">
            <img src={preview.pdfDataUrl} alt="" className="block w-full" draggable={false} />
          </div>
        ) : preview.imageUrl ? (
          <div className="flex h-full items-center justify-center overflow-hidden p-3">
            <img src={preview.imageUrl} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
          </div>
        ) : preview.text ? (
          <p className="h-full overflow-y-auto whitespace-pre-wrap px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            {highlight(contextAround(previewPlainText(preview.text), query.trim()), query.trim())}
          </p>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {t('command.preview_empty')}
          </div>
        )}
      </div>
    </div>
  );
}
