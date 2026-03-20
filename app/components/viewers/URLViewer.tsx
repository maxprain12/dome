import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type Resource } from '@/types';
import { processUrlResource } from '@/lib/web/processor';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';

interface URLViewerProps {
  resource: Resource;
}

function URLViewerComponent({ resource }: URLViewerProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);

  const handleProcess = useCallback(async () => {
    if (!window.electron?.web?.process) return;

    try {
      setIsProcessing(true);
      const result = await processUrlResource(resource.id);

      if (result.success) {
        const resourceResult = await window.electron.db.resources.getById(resource.id);
        if (resourceResult?.success && resourceResult.data) {
          const updatedResource = resourceResult.data;
          setMetadata(updatedResource.metadata ?? null);
        }
      }
    } catch (err) {
      console.error('Error processing URL:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [resource.id]);

  useEffect(() => {
    async function loadURL() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        const resourceMetadata = resource.metadata || {};
        const resourceUrl = resourceMetadata.url || resource.content;

        if (!resourceUrl) {
          setError('URL not found in resource');
          return;
        }

        setUrl(resourceUrl);
        setMetadata(resourceMetadata);

        if (resourceMetadata.processing_status === 'pending' || !resourceMetadata.processed_at) {
          await handleProcess();
        }
      } catch (err) {
        console.error('Error loading URL:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    loadURL();
  }, [resource.id, handleProcess]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsubscribe = window.electron.on('resource:updated', ({ id, updates }: { id: string; updates: { metadata?: unknown } }) => {
      if (id === resource.id && updates?.metadata) {
        setMetadata(updates.metadata as Record<string, unknown>);
      }
    });
    return unsubscribe;
  }, [resource.id]);

  const handleOpenExternal = useCallback(async () => {
    if (url && window.electron) {
      await window.electron.invoke('open-external-url', url);
    }
  }, [url]);

  if (isLoading && !error) {
    return <LoadingState message={t('viewer.loading_url')} />;
  }

  if (error && !url) {
    return <ErrorState error={error} onRetry={handleProcess} />;
  }

  const processingStatus = metadata?.processing_status || 'pending';
  const scrapedContent = typeof metadata?.scraped_content === 'string' ? metadata.scraped_content : null;

  const previewImage = resource.thumbnail_data;

  const safeStr = (v: unknown): string | null =>
    v != null && typeof v === 'string' && v.length > 0 ? v : null;
  const safeDate = (v: unknown): string | null => {
    if (v == null) return null;
    try {
      const d = typeof v === 'number' || typeof v === 'string' || v instanceof Date ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          {(processingStatus === 'processing' || isProcessing) && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--secondary-text)' }}>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{t('viewer.processing')}</span>
            </div>
          )}

          {processingStatus === 'failed' && (
            <button
              type="button"
              onClick={handleProcess}
              disabled={isProcessing}
              className="min-w-[44px] min-h-[44px] px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-60"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
              aria-label={t('viewer.reprocess_content')}
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              {t('viewer.reprocess')}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleOpenExternal}
          className="min-w-[44px] min-h-[44px] px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{
            backgroundColor: 'var(--bg)',
            color: 'var(--primary-text)',
            border: '1px solid var(--border)',
          }}
          aria-label={t('viewer.open_in_browser')}
          title={t('viewer.open_in_browser')}
        >
          <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
          {t('viewer.open_in_browser')}
        </button>
      </div>

      {/* Content - screenshot preview + extracted content */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Web preview image (screenshot) */}
          {previewImage && (
            <div
              className="rounded-lg overflow-hidden border"
              style={{ borderColor: 'var(--border)' }}
            >
              <img
                src={previewImage}
                alt="Preview of the web page"
                className="w-full h-auto max-h-[400px] object-contain object-top"
              />
            </div>
          )}

          {/* Extracted content */}
          {processingStatus === 'completed' ? (
              <div className="space-y-6">
                {/* Full Content */}
                {scrapedContent && (
                  <div
                    className="p-6 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--primary-text)' }}>
                      {t('viewer.full_content')}
                    </h2>
                    <div
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ color: 'var(--secondary-text)' }}
                    >
                      {scrapedContent ?? ''}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {metadata && (
                  <div
                    className="p-6 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--primary-text)' }}>
                      {t('viewer.metadata')}
                    </h2>
                    <dl className="space-y-2 text-sm">
                      {safeStr(metadata.title) && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>{t('viewer.title')}:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{safeStr(metadata.title)}</dd>
                        </>
                      )}
                      {safeStr(metadata.description) && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>{t('viewer.description')}:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{safeStr(metadata.description)}</dd>
                        </>
                      )}
                      {safeStr(metadata.author) && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>{t('viewer.author')}:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{safeStr(metadata.author)}</dd>
                        </>
                      )}
                      {safeDate(metadata.published_date) && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>{t('viewer.published')}:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{safeDate(metadata.published_date)}</dd>
                        </>
                      )}
                      {url && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>{t('viewer.url')}:</dt>
                          <dd>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                            >
                              {url}
                            </a>
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}

                {!scrapedContent && (
                  <div className="text-center py-12">
                    <p style={{ color: 'var(--secondary-text)' }}>
                      {t('viewer.no_content')}
                    </p>
                  </div>
                )}
              </div>
          ) : processingStatus === 'processing' || isProcessing ? (
            <LoadingState message={t('viewer.processing_content')} />
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--warning)' }} />
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--primary-text)' }}>
                  {t('viewer.content_not_processed')}
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
                  {t('viewer.content_not_processed_desc')}
                </p>
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--accent)',
                  }}
                  aria-label={t('viewer.process_now')}
                >
                  {isProcessing ? t('viewer.processing') : t('viewer.process_now')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(URLViewerComponent);
