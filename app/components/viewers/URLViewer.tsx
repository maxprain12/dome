import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  ExternalLinkIcon,
  Loading03Icon,
  RefreshIcon,
  CircleIcon,
  CircleDotIcon,
} from '@hugeicons/core-free-icons';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type Resource } from '@/types';
import ListState from '@/components/shared/ListState';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { useMountAction } from '@/lib/hooks/useMountAction';

interface URLViewerProps {
  resource: Resource;
  onRunUrlProcess: () => Promise<void>;
  pageUrl: string | null;
  processBusy: boolean;
}

function nestMeta(raw: Record<string, unknown>): Record<string, unknown> {
  const n = raw.metadata;
  if (n && typeof n === 'object' && !Array.isArray(n)) return n as Record<string, unknown>;
  return {};
}

function pickArticleField(
  top: Record<string, unknown>,
  nested: Record<string, unknown>,
  key: string,
): string | null {
  const a = top[key];
  if (a != null && typeof a === 'string' && a.trim()) return a.trim();
  const b = nested[key];
  if (b != null && typeof b === 'string' && b.trim()) return b.trim();
  return null;
}

function formatTags(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === 'string' ? x.trim() : String(x))).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

function safeUrlDate(v: string | null): string | null {
  if (!v) return null;
  try {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
  } catch {
    return null;
  }
}

function urlPipelineStep(done: boolean, active: boolean, label: string) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {active ? (
        <HugeiconsIcon icon={Loading03Icon} className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
      ) : done ? (
        <HugeiconsIcon icon={CircleDotIcon} className="size-4 shrink-0 text-primary" aria-hidden />
      ) : (
        <HugeiconsIcon icon={CircleIcon} className="size-4 shrink-0" style={{ color: 'var(--border)' }} aria-hidden />
      )}
      <span
        className="text-xs font-medium truncate"
        style={{ color: active || done ? 'var(--foreground)' : 'var(--muted-foreground)' }}
      >
        {label}
      </span>
    </div>
  );
}

function URLViewerComponent({ resource, onRunUrlProcess, pageUrl, processBusy }: URLViewerProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalizeMetadata = useCallback((raw: unknown): Record<string, unknown> => {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return raw as Record<string, unknown>;
  }, []);

  const normalizedFromResource = useMemo(
    () => normalizeMetadata(resource.metadata),
    [resource.metadata, normalizeMetadata],
  );

  const [metadata, setMetadata] = useState(normalizedFromResource);

  const [prevNormalizedFromResource, setPrevNormalizedFromResource] = useState(normalizedFromResource);
  if (normalizedFromResource !== prevNormalizedFromResource) {
    setPrevNormalizedFromResource(normalizedFromResource);
    setMetadata(normalizedFromResource);
  }

  const loadURL = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;

    try {
      setIsLoading(true);
      setError(null);

      const resourceMetadata = normalizeMetadata(resource.metadata);
      const resourceUrl =
        (typeof resourceMetadata.url === 'string' && resourceMetadata.url) ||
        (typeof resource.content === 'string' && resource.content ? resource.content : null);

      if (!resourceUrl) {
        setError('URL not found in resource');
        return;
      }

      setUrl(resourceUrl);

      if (resourceMetadata.processing_status === 'pending' || !resourceMetadata.processed_at) {
        await onRunUrlProcess();
      }
    } catch (err) {
      console.error('Error loading URL:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [resource.content, resource.id, resource.metadata, normalizeMetadata, onRunUrlProcess]);

  const mountRef = useMountAction(loadURL);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsubscribe = window.electron.on(
      'resource:updated',
      ({ id, updates }: { id: string; updates: { metadata?: unknown } }) => {
        if (id === resource.id && updates?.metadata != null) {
          setMetadata(normalizeMetadata(updates.metadata));
        }
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, [resource.id, normalizeMetadata]);

  const processingStatus = (metadata?.processing_status as string) || 'pending';
  const scrapedContent = typeof metadata?.scraped_content === 'string' ? metadata.scraped_content : null;
  const scrapeError = typeof metadata?.scrape_error === 'string' ? metadata.scrape_error : null;
  const previewImage = resource.thumbnail_data;

  const nested = useMemo(() => nestMeta(metadata ?? {}), [metadata]);

  const article = useMemo(() => {
    const top = metadata ?? {};
    return {
      title: pickArticleField(top, nested, 'title'),
      description: pickArticleField(top, nested, 'description'),
      author: pickArticleField(top, nested, 'author'),
      published_date: pickArticleField(top, nested, 'published_date'),
      modified_date: pickArticleField(top, nested, 'modified_date'),
      section: pickArticleField(top, nested, 'section'),
      tags: formatTags(nested.tags ?? top.tags),
    };
  }, [metadata, nested]);

  const hostname = useMemo(() => {
    const u = url || pageUrl;
    if (!u) return null;
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }, [url, pageUrl]);

  const displayTitle = useMemo(
    () => resource.title?.trim() || article.title || hostname || t('workspace.url'),
    [resource.title, article.title, hostname, t],
  );

  const processedAt = useMemo(() => {
    const at = metadata?.processed_at;
    if (at == null) return null;
    const n = typeof at === 'number' ? at : typeof at === 'string' ? Number(at) : NaN;
    if (!Number.isNaN(n) && n > 0) {
      return new Date(n).toLocaleString();
    }
    return null;
  }, [metadata?.processed_at]);

  const isBusy = processBusy || processingStatus === 'processing';
  const effectiveUrl = url || pageUrl;

  const bylineParts = [
    article.author,
    safeUrlDate(article.published_date),
    article.section,
  ].filter(Boolean);

  const openOriginal = () => {
    if (effectiveUrl && window.electron) {
      window.electron.invoke('open-external-url', effectiveUrl).catch((err) => {
        console.error('[URLViewer] Failed to open external URL:', err);
      });
    }
  };

  if (error && !effectiveUrl) {
    return <ListState variant="error" errorMessage={error} onRetry={() => { void onRunUrlProcess(); }} fullHeight />;
  }

  return (
    <div ref={mountRef} className="flex flex-col flex-1 min-h-0 w-full bg-background">
      {isLoading && !error ? (
        <ListState variant="loading" loadingLabel={t('viewer.loading_url')} fullHeight />
      ) : (
        <>
      {/* Unified in-view chrome: one light row; all URL actions live here */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--background)',
        }}
      >
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-xs font-medium truncate text-muted-foreground">
            {hostname || t('viewer.web_page_context')}
          </span>
          {effectiveUrl && (
            <button
              type="button"
              onClick={openOriginal}
              className="text-xs truncate max-w-[min(100%,280px)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded text-primary"
              title={effectiveUrl}
            >
              {t('viewer.web_open_original')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isBusy && (
            <span className="text-xs mr-1 hidden sm:inline text-muted-foreground">
              {t('viewer.web_step_extracting')}…
            </span>
          )}
          <button
            type="button"
            onClick={() => { void onRunUrlProcess(); }}
            disabled={isBusy}
            className="p-2 rounded-lg transition-colors hover:bg-accent disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ color: 'var(--muted-foreground)' }}
            title={t('viewer.web_reextract')}
            aria-label={t('viewer.web_reextract_aria')}
          >
            <HugeiconsIcon icon={RefreshIcon} className={`size-4 ${isBusy ? 'animate-spin' : ''}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={openOriginal}
            disabled={!effectiveUrl}
            className="p-2 rounded-lg transition-colors hover:bg-accent disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-muted-foreground"
            title={t('viewer.open_in_browser')}
            aria-label={t('viewer.open_in_browser')}
          >
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:p-6 flex flex-col gap-y-6">
          {processingStatus === 'processing' || (processingStatus === 'pending' && isBusy) ? (
            <div className="flex flex-col gap-y-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('viewer.web_pipeline_title')}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {urlPipelineStep(true, false, t('viewer.web_step_saved'))}
                <span style={{ color: 'var(--border)' }} aria-hidden>—</span>
                {urlPipelineStep(false, true, t('viewer.web_step_extracting'))}
                <span style={{ color: 'var(--border)' }} aria-hidden>—</span>
                {urlPipelineStep(false, false, t('viewer.web_step_ready'))}
              </div>
              <ListState variant="loading" loadingLabel={t('viewer.processing_content')} fullHeight />
            </div>
          ) : processingStatus === 'failed' ? (
            <div className="flex flex-col items-center justify-center py-14 text-center flex flex-col gap-y-4 max-w-md mx-auto">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-12 text-destructive" aria-hidden />
              <h2 className="text-lg font-semibold text-foreground">
                {t('viewer.scrape_status_failed')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('viewer.content_not_processed_desc')}
              </p>
              {scrapeError && (
                <p className="text-xs text-muted-foreground">
                  {scrapeError}
                </p>
              )}
              <button
                type="button"
                onClick={() => { void onRunUrlProcess(); }}
                className="px-4 py-2.5 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {t('viewer.reprocess')}
              </button>
            </div>
          ) : processingStatus !== 'completed' ? (
            <div className="flex flex-col items-center justify-center py-14 text-center flex flex-col gap-y-4 max-w-md mx-auto">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-12 text-[var(--warning)]" aria-hidden />
              <h2 className="text-lg font-semibold text-foreground">
                {t('viewer.content_not_processed')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('viewer.content_not_processed_desc')}
              </p>
              <button
                type="button"
                onClick={() => { void onRunUrlProcess(); }}
                className="px-4 py-2.5 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {t('viewer.process_now')}
              </button>
            </div>
          ) : (
            <article
              className="rounded-2xl border overflow-hidden"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
              }}
            >
              {previewImage && (
                <div className="border-b border-border">
                  <img
                    src={previewImage}
                    alt=""
                    className="w-full max-h-[min(420px,50vh)] object-cover object-top"
                  />
                </div>
              )}

              <div className="px-5 py-6 sm:p-8 flex flex-col gap-y-5">
                <header className="flex flex-col gap-y-2">
                  <h1 className="text-xl sm:text-2xl font-semibold font-display leading-tight text-foreground">
                    {displayTitle}
                  </h1>
                  {bylineParts.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {bylineParts.join(' · ')}
                    </p>
                  )}
                  {article.description && (
                    <p className="text-sm leading-relaxed pt-1 text-muted-foreground">
                      {article.description}
                    </p>
                  )}
                </header>

                <div className="h-px w-full bg-border" />

                <section aria-label={t('viewer.web_reading_label')}>
                  {scrapedContent ? (
                    <div className="content-preview-note markdown-preview text-sm sm:text-[15px] leading-relaxed max-w-none">
                      <MarkdownRenderer content={scrapedContent} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('viewer.no_content')}
                    </p>
                  )}
                </section>

                <footer
                  className="pt-4 mt-2 border-t flex flex-col gap-y-3 text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('viewer.web_details')}
                  </p>
                  {processedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t('viewer.web_extracted_at', { date: processedAt })}
                    </p>
                  )}
                  <dl className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-x-4 gap-y-2">
                    {effectiveUrl && (
                      <>
                        <dt>{t('viewer.url')}</dt>
                        <dd>
                          <button
                            type="button"
                            onClick={openOriginal}
                            className="text-left break-all underline-offset-2 hover:underline text-primary"
                          >
                            {effectiveUrl}
                          </button>
                        </dd>
                      </>
                    )}
                    {safeUrlDate(article.published_date) && (
                      <>
                        <dt>{t('viewer.published')}</dt>
                        <dd className="text-foreground">{safeUrlDate(article.published_date)}</dd>
                      </>
                    )}
                    {safeUrlDate(article.modified_date) && (
                      <>
                        <dt>{t('viewer.date_modified')}</dt>
                        <dd className="text-foreground">{safeUrlDate(article.modified_date)}</dd>
                      </>
                    )}
                    {article.tags && (
                      <>
                        <dt>{t('viewer.web_tags')}</dt>
                        <dd className="text-foreground">{article.tags}</dd>
                      </>
                    )}
                  </dl>
                </footer>
              </div>
            </article>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

export default React.memo(URLViewerComponent);
