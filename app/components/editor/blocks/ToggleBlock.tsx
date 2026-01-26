'use client';

import { NodeViewWrapper } from '@tiptap/react';
import { ToggleBlockAttributes } from '@/types';
import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ToggleBlockProps {
  node: {
    attrs: ToggleBlockAttributes;
  };
  updateAttributes: (attrs: Partial<ToggleBlockAttributes>) => void;
}

export function ToggleBlock({ node, updateAttributes }: ToggleBlockProps) {
  const { collapsed = false } = node.attrs;
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    updateAttributes({ collapsed: newCollapsed });
  };

  return (
    <NodeViewWrapper className="toggle-block-wrapper">
      <div
        className="toggle-block"
        style={{
          margin: '8px 0',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={toggleCollapse}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: 'var(--bg-secondary)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--primary)',
            fontSize: '14px',
            fontWeight: 500,
            textAlign: 'left',
          }}
        >
          {isCollapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
          <span>Toggle</span>
        </button>
        {!isCollapsed && (
          <div
            className="toggle-content"
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--bg)',
            }}
          >
            <NodeViewContent />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
