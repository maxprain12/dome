'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertCircle, ExternalLink, RefreshCw, FileText, Globe } from 'lucide-react';
import { type Resource } from '@/types';
import { processUrlResource, isYouTubeUrl } from '@/lib/web/processor';

interface URLViewerProps {
  resource: Resource;
}

export default function URLViewer({ resource }: URLViewerProps) {
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
          setMetadata(updatedResource.metadata ? JSON.parse(updatedResource.metadata) : {});
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

  if (isLoading && !error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--brand-primary)' }} />
          <p style={{ color: 'var(--secondary)' }}>Loading URL...</p>
        </div>
      </div>
    );
  }

  if (error && !url) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--error)' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--primary)' }}>
            Error Loading URL
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--secondary)' }}>
            {error}
          </p>
          <button
            onClick={handleProcess}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
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
              backgroundColor: viewMode === 'webview' ? 'var(--brand-primary)' : 'transparent',
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
              backgroundColor: viewMode === 'processed' ? 'var(--brand-primary)' : 'transparent',
            }}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Processed Content
          </button>
        </div>

        <div className="flex items-center gap-2">
          {processingStatus === 'processing' && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--secondary)' }}>
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
                color: 'var(--primary)',
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
              color: 'var(--primary)',
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
              <webview
                ref={webviewRef}
                src={url}
                className="w-full h-full"
                style={{ display: 'flex' }}
                onDidFinishLoad={handleWebViewLoad}
                onDidFailLoad={handleWebViewError}
                partition="persist:webview"
              />
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
                    <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--primary)' }}>
                      Summary
                    </h2>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--secondary)' }}>
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
                    <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--primary)' }}>
                      Full Content
                    </h2>
                    <div
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ color: 'var(--secondary)' }}
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
                    <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--primary)' }}>
                      Metadata
                    </h2>
                    <dl className="space-y-2 text-sm">
                      {metadata.title && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary)' }}>Title:</dt>
                          <dd style={{ color: 'var(--secondary)' }}>{metadata.title}</dd>
                        </>
                      )}
                      {metadata.description && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary)' }}>Description:</dt>
                          <dd style={{ color: 'var(--secondary)' }}>{metadata.description}</dd>
                        </>
                      )}
                      {metadata.author && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary)' }}>Author:</dt>
                          <dd style={{ color: 'var(--secondary)' }}>{metadata.author}</dd>
                        </>
                      )}
                      {metadata.published_date && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary)' }}>Published:</dt>
                          <dd style={{ color: 'var(--secondary)' }}>{new Date(metadata.published_date).toLocaleDateString()}</dd>
                        </>
                      )}
                      {url && (
                        <>
                          <dt className="font-medium" style={{ color: 'var(--primary)' }}>URL:</dt>
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
                    <p style={{ color: 'var(--secondary)' }}>
                      No processed content available. Click "Reprocess" to generate summary and content.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  {processingStatus === 'processing' ? (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--brand-primary)' }} />
                      <p style={{ color: 'var(--secondary)' }}>Processing content...</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--warning)' }} />
                      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--primary)' }}>
                        Content Not Processed
                      </h3>
                      <p className="text-sm mb-4" style={{ color: 'var(--secondary)' }}>
                        This URL resource hasn't been processed yet. Click "Reprocess" to generate summary and extract content.
                      </p>
                      <button
                        onClick={handleProcess}
                        disabled={isProcessing}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        {isProcessing ? 'Processing...' : 'Process Now'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
