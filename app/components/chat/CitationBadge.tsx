import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <span className="not-typeset relative inline-flex">
      <button
        type="button"
        onClick={() => onClickCitation?.(number)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        aria-label={`Citation ${number}${sourceTitle ? `: ${sourceTitle}` : ''}`}
      >
        <Badge variant="secondary" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ background: 'color-mix(in srgb, var(--primary) 18%, transparent)', color: 'var(--primary)', borderColor: 'transparent' }}><span className="truncate">{String(number)}</span></Badge>
      </button>

      {showTooltip && (sourceTitle || sourcePassage || pageLabel || nodeTitle) ? (
        <Card className="p-3 absolute z-dropdown bottom-full left-1/2 -translate-x-1/2 mb-2 w-[280px] pointer-events-none shadow-lg animate-in fade-in zoom-in-95" style={{ boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)' }}>
          {sourceTitle && (
            <div className="text-xs font-semibold text-foreground mb-1">{sourceTitle}</div>
          )}
          {(pageLabel || nodeTitle) && (
            <div
              className="text-[11px] text-muted-foreground mb-1.5"
              style={{ marginBottom: sourcePassage ? 6 : 0 }}
            >
              {[nodeTitle, pageLabel].filter(Boolean).join(' · ')}
            </div>
          )}
          {sourcePassage && (
            <div className="text-xs text-muted-foreground leading-relaxed max-h-[80px] overflow-hidden">
              &ldquo;{sourcePassage}&rdquo;
            </div>
          )}
        </Card>
      ) : null}
    </span>
  );
}
