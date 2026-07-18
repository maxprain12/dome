
import React, { useState, useCallback } from 'react';
import { type Resource } from '@/types';
import ListState from '@/components/shared/ListState';
import { useMountAction } from '@/lib/hooks/useMountAction';
import { typesetDocsClass } from '@/lib/typeset';
import { useTranslation } from 'react-i18next';

interface DocxViewerProps {
  resource: Resource;
}

function DocxViewerComponent({ resource }: DocxViewerProps) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocx = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await window.electron.resource.readDocumentContent(resource.id);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to read document');
      }

      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const mammoth = await import('mammoth');
      const mammothResult = await mammoth.convertToHtml(
        { arrayBuffer: bytes.buffer },
        {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
          ],
        },
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
  }, [resource.id]);

  const mountRef = useMountAction(loadDocx);

  if (error) {
    return <ListState variant="error" errorMessage={error} fullHeight />;
  }

  return (
    <div ref={mountRef} className="docx-viewer">
      {isLoading ? (
        <ListState variant="loading" loadingLabel={t('viewer.loading_document')} fullHeight />
      ) : (
        <>
      <div className="docx-content-wrapper">
        <div
          className={typesetDocsClass('docx-content')}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .docx-viewer { width: 100%; height: 100%; overflow-y: auto; background: var(--background); }
        .docx-content-wrapper { max-width: 800px; margin: 0 auto; padding: 32px 40px; }
      `,
        }}
      />
        </>
      )}
    </div>
  );
}

export default React.memo(DocxViewerComponent);
