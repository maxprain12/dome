import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Folder01Icon,
  Mail01Icon,
  Share08Icon,
  Task01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { typesetDocsClass } from '@/lib/typeset';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Resource } from '@/types';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { loadNoteMarkdown } from '@/lib/notes/loadNoteMarkdown';
import { formatDistanceToNow } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { metaString, type PalettePreviewTarget, type SourceHitRow } from './commandPaletteTypes';

const CACHE_MAX = 30;
const MARKDOWN_MAX = 2000;
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
    imageUrl: null,
    pdfDataUrl: null,
  };

  if (type === 'note') {
    try {
      const md = await loadNoteMarkdown(r as unknown as Resource);
      if (md?.trim()) data.markdown = md.trim().slice(0, MARKDOWN_MAX);
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
  }

  if (!data.markdown && !data.pdfDataUrl && !data.imageUrl) {
    const text =
      (typeof r.content_text === 'string' && r.content_text.trim()) ||
      (typeof r.content === 'string' && r.content.trim()) ||
      '';
    data.text = text || null;
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

function SourceHitPreview({ hit, query }: { hit: SourceHitRow; query: string }) {
  const { t } = useTranslation();
  const icon =
    hit.kind === 'issue'
      ? Task01Icon
      : hit.kind === 'email'
        ? Mail01Icon
        : hit.kind === 'person'
          ? UserIcon
          : Share08Icon;

  const state = metaString(hit.meta, 'state');
  const repo = metaString(hit.meta, 'fullName');
  const folder = metaString(hit.meta, 'folder');
  const provider = metaString(hit.meta, 'provider');
  const number = hit.meta?.number;

  const metaLine = (() => {
    if (hit.kind === 'issue') {
      const stateLabel =
        state === 'closed' ? t('command.find_preview_state_closed') : t('command.find_preview_state_open');
      const num = typeof number === 'number' ? `#${number}` : null;
      return [stateLabel, repo, num].filter(Boolean).join(' · ');
    }
    if (hit.kind === 'email') {
      return folder ? t('command.find_email_folder', { folder }) : t('command.find_email_fallback');
    }
    if (hit.kind === 'social_post') {
      return [provider, metaString(hit.meta, 'status')].filter(Boolean).join(' · ') || t('command.social_posts');
    }
    return t('command.people');
  })();

  const body = hit.snippet?.trim() || null;

  return (
    <div className="dome-cmdk-preview flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
            {hit.title}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          <span className="truncate">{metaLine}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {body ? (
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
            {highlight(contextAround(body, query.trim()), query.trim())}
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
    const source = preview.markdown ?? preview.text ?? '';
    if (!source || source.toLowerCase().indexOf(query.trim().toLowerCase()) < 0) return null;
    return contextAround(source, query.trim());
  }, [preview, query]);

  if (target.kind === 'source') {
    return <SourceHitPreview hit={target.hit} query={query} />;
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

      {matchContext ? (
        <div className="shrink-0 border-b bg-primary/5 px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="line-clamp-4">{highlight(matchContext, query.trim())}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {preview.markdown ? (
          <div className={typesetDocsClass('px-3.5 py-3')}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}
            >
              {preview.markdown}
            </ReactMarkdown>
          </div>
        ) : preview.pdfDataUrl ? (
          <img src={preview.pdfDataUrl} alt="" className="block w-full" draggable={false} />
        ) : preview.imageUrl ? (
          <img src={preview.imageUrl} alt="" className="block w-full object-contain" draggable={false} />
        ) : preview.text ? (
          <p className="whitespace-pre-wrap px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            {highlight(contextAround(preview.text, query.trim()), query.trim())}
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
