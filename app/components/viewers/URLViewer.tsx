import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, ExternalLink, RefreshCw, Copy, Check } from 'lucide-react';
import { type Resource } from '@/types';
import { processUrlResource } from '@/lib/web/processor';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';

interface URLViewerProps {
  resource: Resource;
}

function URLViewerComponent({ resource }: URLViewerProps) {
  const [copied, setCopied] = useState(false);
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

  const handleCopySummary = useCallback(async () => {
    if (!metadata?.summary) return;

    try {
      await navigator.clipboard.writeText(metadata.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy summary:', err);
    }
  }, [metadata?.summary]);

  if (isLoading && !error) {
    return <LoadingState message="Loading URL..." />;
  }

  if (error && !url) {
    return <ErrorState error={error} onRetry={handleProcess} />;
  }

  const processingStatus = metadata?.processing_status || 'pending';
  const summary = metadata?.summary;
  const scrapedContent = metadata?.scraped_content;

  const previewImage = resource.thumbnail_data;

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
          {processingStatus === 'processing' && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--secondary-text)' }}>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Processing...</span>
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
              aria-label="Reprocess content"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              Reprocess
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
          aria-label="Open in Browser"
          title="Open in Browser"
        >
          <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
          Open in Browser
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
                {/* Summary */}
                {summary && (
                  <div
                    className="p-6 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xl font-semibold" style={{ color: 'var(--primary-text)' }}>
                        Summary
                      </h2>
                      <button
                        type="button"
                        onClick={handleCopySummary}
                        className="min-w-[44px] min-h-[44px] px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                        style={{
                          backgroundColor: copied ? 'var(--success)' : 'var(--bg)',
                          color: copied ? 'white' : 'var(--primary-text)',
                          border: copied ? 'none' : '1px solid var(--border)',
                        }}
                        title="Copy summary to clipboard"
                        aria-label="Copy summary to clipboard"
                      >
                        {copied ? (
                          <>
                            <Check size={16} />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={16} />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--secondary-text)' }}>
                      {summary}
                    </p>
                  </div>
                )}

                {/* Scraped Content */}
                {scrapedContent && (
                  <div
                    className="p-6 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--primary-text)' }}>
                      Full Content
                    </h2>
                    <div
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ color: 'var(--secondary-text)' }}
                    >
                      {scrapedContent}
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
                      Metadata
                    </h2>
                    <dl className="space-y-2 text-sm">
                      {metadata.title && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>Title:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{metadata.title}</dd>
                        </>
                      )}
                      {metadata.description && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>Description:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{metadata.description}</dd>
                        </>
                      )}
                      {metadata.author && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>Author:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{metadata.author}</dd>
                        </>
                      )}
                      {metadata.published_date && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>Published:</dt>
                          <dd style={{ color: 'var(--secondary-text)' }}>{new Date(metadata.published_date).toLocaleDateString()}</dd>
                        </>
                      )}
                      {url && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary-text)' }}>URL:</dt>
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

                {!summary && !scrapedContent && (
                  <div className="text-center py-12">
                    <p style={{ color: 'var(--secondary-text)' }}>
                      No processed content available. Click "Reprocess" to generate summary and content.
                    </p>
                  </div>
                )}
              </div>
          ) : processingStatus === 'processing' ? (
            <LoadingState message="Processing content..." />
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--warning)' }} />
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--primary-text)' }}>
                  Content Not Processed
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
                  This URL resource hasn't been processed yet. Click the button below to generate summary and extract content.
                </p>
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--accent)',
                  }}
                  aria-label="Process content now"
                >
                  {isProcessing ? 'Processing...' : 'Process Now'}
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
