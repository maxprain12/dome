'use client';

import React, { useState, useEffect } from 'react';
import { type Resource } from '@/types';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';

interface DocxViewerProps {
  resource: Resource;
}

function DocxViewerComponent({ resource }: DocxViewerProps) {
  const [html, setHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDocx() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // Read file as base64 via IPC
        const result = await window.electron.resource.readDocumentContent(resource.id);
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to read document');
        }

        // Decode base64 to ArrayBuffer
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        // Dynamically import mammoth to keep bundle size down
        const mammoth = await import('mammoth');

        // Convert DOCX to HTML
        const mammothResult = await mammoth.convertToHtml(
          { arrayBuffer: bytes.buffer },
          {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
            ],
          }
        );

        setHtml(mammothResult.value);

        if (mammothResult.messages.length > 0) {
          console.warn('[DocxViewer] Conversion warnings:', mammothResult.messages);
        }
      } catch (err) {
        console.error('[DocxViewer] Error loading document:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    }

    loadDocx();
  }, [resource.id]);

  if (isLoading) {
    return <LoadingState message="Loading document..." />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="docx-viewer">
      <div className="docx-content-wrapper">
        <div
          className="docx-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <style jsx>{`
        .docx-viewer {
          width: 100%;
          height: 100%;
          overflow-y: auto;
          background: var(--bg);
        }

        .docx-content-wrapper {
          max-width: 800px;
          margin: 0 auto;
          padding: 32px 40px;
        }

        .docx-content :global(h1) {
          font-size: 24px;
          font-weight: 700;
          color: var(--primary-text);
          margin: 24px 0 12px;
          line-height: 1.3;
        }

        .docx-content :global(h2) {
          font-size: 20px;
          font-weight: 600;
          color: var(--primary-text);
          margin: 20px 0 10px;
          line-height: 1.4;
        }

        .docx-content :global(h3) {
          font-size: 16px;
          font-weight: 600;
          color: var(--primary-text);
          margin: 16px 0 8px;
          line-height: 1.4;
        }

        .docx-content :global(p) {
          font-size: 14px;
          line-height: 1.7;
          color: var(--secondary-text);
          margin: 0 0 12px;
        }

        .docx-content :global(strong),
        .docx-content :global(b) {
          font-weight: 600;
          color: var(--primary-text);
        }

        .docx-content :global(em),
        .docx-content :global(i) {
          font-style: italic;
        }

        .docx-content :global(ul),
        .docx-content :global(ol) {
          margin: 8px 0 12px 24px;
          padding: 0;
          color: var(--secondary-text);
          font-size: 14px;
          line-height: 1.7;
        }

        .docx-content :global(li) {
          margin: 4px 0;
        }

        .docx-content :global(table) {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
          font-size: 13px;
        }

        .docx-content :global(th),
        .docx-content :global(td) {
          border: 1px solid var(--border);
          padding: 8px 12px;
          text-align: left;
          color: var(--secondary-text);
        }

        .docx-content :global(th) {
          background: var(--bg-secondary);
          font-weight: 600;
          color: var(--primary-text);
        }

        .docx-content :global(tr:nth-child(even) td) {
          background: var(--bg-secondary);
        }

        .docx-content :global(a) {
          color: var(--accent);
          text-decoration: underline;
        }

        .docx-content :global(a:hover) {
          opacity: 0.8;
        }

        .docx-content :global(img) {
          max-width: 100%;
          height: auto;
          border-radius: var(--radius-md);
          margin: 12px 0;
        }

        .docx-content :global(blockquote) {
          border-left: 3px solid var(--accent);
          padding: 8px 16px;
          margin: 12px 0;
          color: var(--secondary-text);
          background: var(--bg-secondary);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }
      `}</style>
    </div>
  );
}

export default React.memo(DocxViewerComponent);
