import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Folder01Icon,
} from '@hugeicons/core-free-icons';
import ResourceIcon from '@/components/shared/ResourceIcon';
import MarkdownBody from '@/components/shared/MarkdownBody';
import { formatDistanceToNow } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { type PalettePreviewTarget } from './commandPaletteTypes';
import {
  previewPlainText,
  wrapCmdkPreviewHtml,
} from './commandPalettePreviewBody';
import { CommandPaletteSourcePreview } from './CommandPaletteSourcePreview';
import { useDomeThemeSnapshot } from '@/lib/chat/useDomeThemeSnapshot';
import {
  getCachedResourcePreview,
  loadResourcePreview,
  type ResourcePreviewData,
} from '@/lib/resources/loadResourcePreview';

const SNIPPET_RADIUS = 260;

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
  const frameRef = useRef<HTMLIFrameElement>(null);
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

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.width = `${HTML_PAGE_WIDTH}px`;
    frame.style.height = `${100 / safeScale}%`;
    frame.style.transform = `scale(${safeScale})`;
  }, [safeScale]);

  return (
    <div ref={hostRef} className="relative h-full min-h-0 overflow-hidden bg-muted/40">
      <iframe
        ref={frameRef}
        title={title}
        sandbox=""
        srcDoc={srcDoc}
        className="absolute left-0 top-0 origin-top-left border-0 bg-background"
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
  const [preview, setPreview] = useState<ResourcePreviewData | null>(() =>
    resourceId ? (getCachedResourcePreview(resourceId) ?? null) : null,
  );
  const [loading, setLoading] = useState(Boolean(resourceId && !getCachedResourcePreview(resourceId)));

  useEffect(() => {
    if (!resourceId) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const cached = getCachedResourcePreview(resourceId);
    if (cached) {
      setPreview(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await loadResourcePreview(resourceId);
        if (cancelled) return;
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
