'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { AudioEmbedAttributes } from '@/types';
import { Trash2, Music } from 'lucide-react';

interface AudioEmbedBlockProps {
  node: { attrs: AudioEmbedAttributes };
  deleteNode: () => void;
}

export function AudioEmbedBlock({ node, deleteNode }: AudioEmbedBlockProps) {
  const { src, isLocal } = node.attrs;

  const audioSrc = isLocal && src && !src.startsWith('http') ? `file://${src}` : src;

  return (
    <NodeViewWrapper className="audio-embed-block-wrapper" data-drag-handle>
      <div
        className="audio-embed-block"
        style={{
          margin: '12px 0',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
          padding: '16px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--primary-text)',
            }}
          >
            <Music size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <audio
              src={audioSrc}
              controls
              preload="metadata"
              style={{
                width: '100%',
                height: '40px',
              }}
            />
          </div>
        </div>
        <button
          onClick={deleteNode}
          title="Eliminar"
          aria-label="Eliminar audio"
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
