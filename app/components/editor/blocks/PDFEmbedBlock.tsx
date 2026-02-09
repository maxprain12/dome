
import { NodeViewWrapper } from '@tiptap/react';
import type { PDFEmbedAttributes } from '@/types';
import { useState, useEffect } from 'react';
import { FileText, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

interface PDFEmbedBlockProps {
  node: {
    attrs: PDFEmbedAttributes;
  };
  updateAttributes: (attrs: Partial<PDFEmbedAttributes>) => void;
}

export function PDFEmbedBlock({ node, updateAttributes }: PDFEmbedBlockProps) {
  const { resourceId, pageStart = 1, pageEnd, zoom = 1.0 } = node.attrs;
  const [currentPage, setCurrentPage] = useState(pageStart);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [pdfData, setPdfData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPDF() {
      if (!window.electron?.db?.resources) return;
      try {
        const result = await window.electron.db.resources.getById(resourceId);
        if (result?.success && result.data) {
          setPdfData(result.data);
        }
      } catch (err) {
        console.error('Error loading PDF:', err);
      } finally {
        setLoading(false);
      }
    }
    loadPDF();
  }, [resourceId]);

  const handlePageChange = (delta: number) => {
    const newPage = Math.max(1, Math.min(currentPage + delta, pageEnd || currentPage));
    setCurrentPage(newPage);
    updateAttributes({ pageStart: newPage });
  };

  const handleZoomChange = (delta: number) => {
    const newZoom = Math.max(0.5, Math.min(2.0, currentZoom + delta));
    setCurrentZoom(newZoom);
    updateAttributes({ zoom: newZoom });
  };

  if (loading) {
    return (
      <NodeViewWrapper className="pdf-embed-block-wrapper">
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--secondary)',
          }}
        >
          Cargando PDF...
        </div>
      </NodeViewWrapper>
    );
  }

  if (!pdfData) {
    return (
      <NodeViewWrapper className="pdf-embed-block-wrapper">
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--error)',
          }}
        >
          PDF no encontrado
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="pdf-embed-block-wrapper">
      <div
        className="pdf-embed-block"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          margin: '16px 0',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} style={{ color: 'var(--primary-text)' }} />
            <span style={{ color: 'var(--primary-text)', fontSize: '14px', fontWeight: 500 }}>
              {pdfData.title}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => handleZoomChange(-0.1)}
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--primary-text)',
              }}
              title="Alejar"
            >
              <ZoomOut size={16} />
            </button>
            <span style={{ color: 'var(--secondary)', fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>
              {Math.round(currentZoom * 100)}%
            </span>
            <button
              onClick={() => handleZoomChange(0.1)}
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--primary-text)',
              }}
              title="Acercar"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--bg)',
            minHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '32px',
              textAlign: 'center',
              color: 'var(--secondary-text)',
            }}
          >
            <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <div>Página {currentPage}</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              Vista previa de PDF (implementar renderizado)
            </div>
          </div>
        </div>

        {/* Footer with page controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            onClick={() => handlePageChange(-1)}
            disabled={currentPage <= 1}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              color: currentPage <= 1 ? 'var(--secondary-text)' : 'var(--primary-text)',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ color: 'var(--primary-text)', fontSize: '14px', minWidth: '80px', textAlign: 'center' }}>
            {currentPage} {pageEnd ? `de ${pageEnd}` : ''}
          </span>
          <button
            onClick={() => handlePageChange(1)}
            disabled={pageEnd ? currentPage >= pageEnd : false}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: pageEnd && currentPage >= pageEnd ? 'not-allowed' : 'pointer',
              color: pageEnd && currentPage >= pageEnd ? 'var(--secondary-text)' : 'var(--primary-text)',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
