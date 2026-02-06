'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertCircle, ExternalLink, RefreshCw, FileText, Globe, Copy, Check } from 'lucide-react';
import { type Resource } from '@/types';
import { processUrlResource, isYouTubeUrl } from '@/lib/web/processor';
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
  const [viewMode, setViewMode] = useState<'webview' | 'processed'>('webview');
  const [isProcessing, setIsProcessing] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const webviewRef = useRef<HTMLWebViewElement>(null);

  useEffect(() => {
    async function loadURL() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // Get URL from resource
        const resourceMetadata = resource.metadata || {};
        const resourceUrl = resourceMetadata.url || resource.content;

        if (!resourceUrl) {
          setError('URL not found in resource');
          return;
        }

        setUrl(resourceUrl);
        setMetadata(resourceMetadata);

        // Check processing status
        if (resourceMetadata.processing_status === 'pending' || !resourceMetadata.processed_at) {
          // Auto-process if not processed yet
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
  }, [resource.id]);

  const handleProcess = useCallback(async () => {
    if (!window.electron?.web?.process) return;

    try {
      setIsProcessing(true);
      const result = await processUrlResource(resource.id);
      
      if (result.success) {
        // Reload metadata
        const resourceResult = await window.electron.db.resources.getById(resource.id);
        if (resourceResult?.success && resourceResult.data) {
          const updatedResource = resourceResult.data;
          setMetadata(updatedResource.metadata ?? {});
        }
      }
    } catch (err) {
      console.error('Error processing URL:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [resource.id]);

  const handleOpenExternal = useCallback(async () => {
    if (url && window.electron) {
      await window.electron.invoke('open-external-url', url);
    }
  }, [url]);

  const handleWebViewLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleWebViewError = useCallback((event: any) => {
    console.error('WebView error:', event);
    setError('Failed to load URL in WebView');
    setIsLoading(false);
  }, []);

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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('webview')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              viewMode === 'webview'
                ? 'text-white'
                : 'text-gray-600'
            }`}
            style={{
              backgroundColor: viewMode === 'webview' ? 'var(--accent)' : 'transparent',
            }}
          >
            <Globe className="w-4 h-4 inline mr-2" />
            Web View
          </button>
          <button
            onClick={() => setViewMode('processed')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              viewMode === 'processed'
                ? 'text-white'
                : 'text-gray-600'
            }`}
            style={{
              backgroundColor: viewMode === 'processed' ? 'var(--accent)' : 'transparent',
            }}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Processed Content
          </button>
        </div>

        <div className="flex items-center gap-2">
          {processingStatus === 'processing' && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--secondary-text)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing...</span>
            </div>
          )}
          
          {processingStatus === 'failed' && (
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className="px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Reprocess
            </button>
          )}

          <button
            onClick={handleOpenExternal}
            className="px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2"
            style={{
              backgroundColor: 'var(--bg)',
              color: 'var(--primary-text)',
              border: '1px solid var(--border)',
            }}
          >
            <ExternalLink className="w-4 h-4" />
            Open in Browser
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'webview' ? (
          <div className="h-full w-full">
            {url && (
              /* eslint-disable @typescript-eslint/no-explicit-any */
              (
                <webview
                  ref={webviewRef as any}
                  src={url}
                  className="w-full h-full"
                  style={{ display: 'flex' } as any}
                  {...{
                    onDidFinishLoad: handleWebViewLoad,
                    onDidFailLoad: handleWebViewError,
                    partition: "persist:webview"
                  } as any}
                />
              )
              /* eslint-enable @typescript-eslint/no-explicit-any */
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-6" style={{ backgroundColor: 'var(--bg)' }}>
            {processingStatus === 'completed' ? (
              <div className="max-w-4xl mx-auto space-y-6">
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
                        onClick={handleCopySummary}
                        className="px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                        style={{
                          backgroundColor: copied ? 'var(--success)' : 'var(--bg)',
                          color: copied ? 'white' : 'var(--primary-text)',
                          border: copied ? 'none' : '1px solid var(--border)',
                        }}
                        title="Copy summary to clipboard"
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
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--warning)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--primary-text)' }}>
                    Content Not Processed
                  </h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
                    This URL resource hasn't been processed yet. Click the button below to generate summary and extract content.
                  </p>
                  <button
                    onClick={handleProcess}
                    disabled={isProcessing}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
                    style={{
                      backgroundColor: 'var(--accent)',
                      opacity: isProcessing ? 0.6 : 1
                    }}
                  >
                    {isProcessing ? 'Processing...' : 'Process Now'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(URLViewerComponent);
