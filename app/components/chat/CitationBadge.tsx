import { useState } from 'react';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeCard from '@/components/ui/DomeCard';

interface CitationBadgeProps {
  number: number;
  sourceTitle?: string;
  sourcePassage?: string;
  pageLabel?: string;
  nodeTitle?: string;
  onClickCitation?: (number: number) => void;
}

export default function CitationBadge({
  number,
  sourceTitle,
  sourcePassage,
  pageLabel,
  nodeTitle,
  onClickCitation,
}: CitationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => onClickCitation?.(number)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        aria-label={`Citation ${number}${sourceTitle ? `: ${sourceTitle}` : ''}`}
      >
        <DomeBadge label={String(number)} variant="soft" size="xs" color="var(--accent)" />
      </button>

      {showTooltip && (sourceTitle || sourcePassage || pageLabel || nodeTitle) ? (
        <DomeCard
          padding="sm"
          className="absolute z-dropdown bottom-full left-1/2 -translate-x-1/2 mb-2 w-[280px] pointer-events-none shadow-lg animate-in"
          style={{ boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)' }}
        >
          {sourceTitle && (
            <div className="text-xs font-semibold text-[var(--dome-text)] mb-1">{sourceTitle}</div>
          )}
          {(pageLabel || nodeTitle) && (
            <div
              className="text-[11px] text-[var(--tertiary-text)] mb-1.5"
              style={{ marginBottom: sourcePassage ? 6 : 0 }}
            >
              {[nodeTitle, pageLabel].filter(Boolean).join(' · ')}
            </div>
          )}
          {sourcePassage && (
            <div className="text-xs text-[var(--secondary-text)] leading-relaxed max-h-[80px] overflow-hidden">
              &ldquo;{sourcePassage}&rdquo;
            </div>
          )}
        </DomeCard>
      ) : null}
    </span>
  );
}
