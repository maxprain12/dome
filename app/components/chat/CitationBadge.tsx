
import { useState } from 'react';

interface CitationBadgeProps {
  number: number;
  sourceTitle?: string;
  sourcePassage?: string;
  onClickCitation?: (number: number) => void;
}

export default function CitationBadge({ number, sourceTitle, sourcePassage, onClickCitation }: CitationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => onClickCitation?.(number)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="citation-badge"
        aria-label={`Citation ${number}${sourceTitle ? `: ${sourceTitle}` : ''}`}
      >
        {number}
      </button>

      {/* Tooltip */}
      {showTooltip && (sourceTitle || sourcePassage) ? (
        <div
          className="absolute z-dropdown bottom-full left-1/2 -translate-x-1/2 mb-2 animate-in"
          style={{
            width: '280px',
            padding: '12px',
            borderRadius: '8px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            pointerEvents: 'none',
          }}
        >
          {sourceTitle && (
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dome-text)', marginBottom: '4px' }}>
              {sourceTitle}
            </div>
          )}
          {sourcePassage && (
            <div style={{ fontSize: '12px', color: 'var(--secondary-text)', lineHeight: 1.5, maxHeight: '80px', overflow: 'hidden' }}>
              &ldquo;{sourcePassage}&rdquo;
            </div>
          )}
        </div>
      ) : null}
    </span>
  );
}
