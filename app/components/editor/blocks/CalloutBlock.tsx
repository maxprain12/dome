'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { CalloutBlockAttributes } from '@/types';
import { useState } from 'react';

interface CalloutBlockProps {
  node: {
    attrs: CalloutBlockAttributes;
  };
  updateAttributes: (attrs: Partial<CalloutBlockAttributes>) => void;
}

const calloutColors = {
  yellow: { bg: '#fef3c7', border: '#fbbf24' },
  blue: { bg: '#dbeafe', border: '#3b82f6' },
  green: { bg: '#d1fae5', border: '#10b981' },
  red: { bg: '#fee2e2', border: '#ef4444' },
  purple: { bg: '#ede9fe', border: '#8b5cf6' },
  gray: { bg: '#f3f4f6', border: '#6b7280' },
};

export function CalloutBlock({ node, updateAttributes }: CalloutBlockProps) {
  const { icon = '💡', color = 'yellow' } = node.attrs;
  const [isEditingIcon, setIsEditingIcon] = useState(false);
  const [iconInput, setIconInput] = useState(icon);

  const colorStyle = calloutColors[color as keyof typeof calloutColors] || calloutColors.yellow;

  return (
    <NodeViewWrapper className="callout-block-wrapper">
      <div
        className="callout-block"
        style={{
          display: 'flex',
          gap: '12px',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: colorStyle.bg,
          border: `1px solid ${colorStyle.border}`,
          margin: '8px 0',
        }}
      >
        <div
          onClick={() => setIsEditingIcon(true)}
          style={{
            fontSize: '20px',
            cursor: 'pointer',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {isEditingIcon ? (
            <input
              type="text"
              value={iconInput}
              onChange={(e) => setIconInput(e.target.value)}
              onBlur={() => {
                updateAttributes({ icon: iconInput });
                setIsEditingIcon(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateAttributes({ icon: iconInput });
                  setIsEditingIcon(false);
                }
              }}
              autoFocus
              style={{
                width: '40px',
                fontSize: '20px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px',
              }}
            />
          ) : (
            icon
          )}
        </div>
        <div className="callout-content" style={{ flex: 1 }}>
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
