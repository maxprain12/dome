'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { VideoEmbedAttributes } from '@/types';
import { Trash2 } from 'lucide-react';

interface VideoEmbedBlockProps {
  node: { attrs: VideoEmbedAttributes };
  deleteNode: () => void;
}

export function VideoEmbedBlock({ node, deleteNode }: VideoEmbedBlockProps) {
  const { src, provider = 'direct', videoId } = node.attrs;

  const embedUrl =
    provider === 'youtube' && videoId
      ? `https://www.youtube.com/embed/${videoId}`
      : src && !src.startsWith('http') && !src.startsWith('file://')
        ? `file://${src}`
        : src;

  return (
    <NodeViewWrapper className="video-embed-block-wrapper" data-drag-handle>
      <div
        className="video-embed-block"
        style={{
          margin: '12px 0',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
          position: 'relative',
        }}
      >
        <div style={{ aspectRatio: '16/9', width: '100%', maxWidth: '640px', margin: '0 auto' }}>
          {provider === 'youtube' ? (
            <iframe
              src={embedUrl}
              title="Video embed"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          ) : (
            <video
              src={src.startsWith('file://') ? src : src}
              controls
              preload="metadata"
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          )}
        </div>
        <button
          onClick={deleteNode}
          title="Eliminar"
          aria-label="Eliminar video"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '6px',
            backgroundColor: 'var(--bg-hover)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--error)',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </NodeViewWrapper>
  );
}
