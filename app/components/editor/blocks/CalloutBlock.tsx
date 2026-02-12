
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { CalloutBlockAttributes } from '@/types';
import { useState } from 'react';
import { Lightbulb, FileText, AlertTriangle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  'file-text': FileText,
  'alert-triangle': AlertTriangle,
  info: Info,
};

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
  const { icon = 'lightbulb', color = 'yellow' } = node.attrs;
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
          role="button"
          tabIndex={0}
          onClick={() => setIsEditingIcon(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsEditingIcon(true);
            }
          }}
          aria-label="Edit callout icon"
          className="cursor-pointer"
          style={{
            fontSize: '20px',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {isEditingIcon ? (
            <input
              type="text"
              value={iconInput}
              onChange={(e) => setIconInput(e.target.value)}
              aria-label="Callout icon"
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
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {(() => {
                const IconComponent = ICON_MAP[icon] ?? Info;
                return <IconComponent size={20} />;
              })()}
            </span>
          )}
        </div>
        <div className="callout-content" style={{ flex: 1 }}>
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
