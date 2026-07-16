import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

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
  const hasPreview = Boolean(sourceTitle || sourcePassage || pageLabel || nodeTitle);
  const metaLine = [nodeTitle, pageLabel].filter(Boolean).join(' · ');

  const trigger = (
    <button
      type="button"
      onClick={() => onClickCitation?.(number)}
      className="not-typeset inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`Citation ${number}${sourceTitle ? `: ${sourceTitle}` : ''}`}
    >
      <Badge
        variant="secondary"
        className="h-auto max-w-full gap-1 border-transparent bg-primary/18 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
      >
        <span className="truncate">{String(number)}</span>
      </Badge>
    </button>
  );

  if (!hasPreview) return trigger;

  return (
    <HoverCard>
      <HoverCardTrigger delay={150} render={trigger} />
      <HoverCardContent side="top" align="center" className="pointer-events-none">
        {sourceTitle && (
          <div className="mb-1 text-xs font-semibold text-foreground">{sourceTitle}</div>
        )}
        {metaLine && (
          <div className={`text-[11px] text-muted-foreground ${sourcePassage ? 'mb-1.5' : ''}`}>
            {metaLine}
          </div>
        )}
        {sourcePassage && (
          <div className="max-h-20 overflow-hidden text-xs leading-relaxed text-muted-foreground">
            &ldquo;{sourcePassage}&rdquo;
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
