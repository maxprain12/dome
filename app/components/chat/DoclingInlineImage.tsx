/**
 * DoclingInlineImage - Renders a Docling-extracted image inline in chat.
 * Supports lightbox on click. Used via markdown: ![caption](docling:image_id)
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

interface DoclingInlineImageProps {
  imageId: string;
  alt?: string;
}

export default function DoclingInlineImage({ imageId, alt = 'Figure' }: DoclingInlineImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const lightboxStyle = {
    position: 'fixed' as const,
    top: 'var(--app-header-total)',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'rgba(0,0,0,0.9)',
    padding: 24,
  };

  useEffect(() => {
    const docling = (window as Window & { electron?: { docling?: { getImageData?: (id: string) => Promise<{ success: boolean; data?: string; error?: string }> } } }).electron?.docling;
    if (!docling?.getImageData) {
      setError('Docling no disponible');
      return;
    }
    let cancelled = false;
    void docling.getImageData(imageId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) setDataUrl(res.data);
      else setError(res.error || 'Error al cargar');
    });
    return () => { cancelled = true; };
  }, [imageId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (lightboxOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [lightboxOpen]);

  if (error) {
    return (
      <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>
    );
  }

  if (!dataUrl) {
    return (
      <div
        style={{
          display: 'inline-flex',
          minWidth: 120,
          minHeight: 80,
          background: 'var(--bg-tertiary)',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--tertiary-text)',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '8px 0',
        }}
      >
        Cargando…
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        style={{
          display: 'block',
          margin: '8px 0',
          padding: 0,
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--bg)',
          cursor: 'pointer',
          position: 'relative',
          maxWidth: '100%',
          transition: 'border-color 150ms, box-shadow 150ms',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <img
          src={dataUrl}
          alt={alt}
          style={{
            display: 'block',
            maxWidth: 400,
            maxHeight: 280,
            objectFit: 'contain',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            padding: 4,
            borderRadius: 6,
            background: 'rgba(0,0,0,0.4)',
            color: 'var(--base-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Maximize2 style={{ width: 12, height: 12 }} />
        </div>
      </button>
      {alt && (
        <p style={{ fontSize: 11, color: 'var(--secondary-text)', margin: '-4px 0 8px', lineHeight: 1.3 }}>
          {alt}
        </p>
      )}

      {lightboxOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ver figura ampliada"
            style={lightboxStyle}
            onClick={() => setLightboxOpen(false)}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                padding: 8,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.1)',
                color: 'var(--base-text)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Cerrar"
            >
              <X style={{ width: 24, height: 24 }} />
            </button>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={dataUrl}
                alt={alt}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  borderRadius: 8,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {alt && (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.9)',
                  textAlign: 'center',
                  maxWidth: 600,
                }}
              >
                {alt}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
