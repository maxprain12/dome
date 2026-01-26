'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { DividerAttributes } from '@/types';

interface DividerBlockProps {
  node: {
    attrs: DividerAttributes;
  };
}

export function DividerBlock({ node }: DividerBlockProps) {
  const { variant = 'line' } = node.attrs;

  const renderDivider = () => {
    switch (variant) {
      case 'dots':
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '16px 0',
            }}
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--border)',
                }}
              />
            ))}
          </div>
        );
      case 'space':
        return <div style={{ height: '32px' }} />;
      case 'line':
      default:
        return (
          <div
            style={{
              height: '1px',
              backgroundColor: 'var(--border)',
              margin: '16px 0',
            }}
          />
        );
    }
  };

  return (
    <NodeViewWrapper className="divider-block-wrapper">
      <div className="divider-block">{renderDivider()}</div>
    </NodeViewWrapper>
  );
}
