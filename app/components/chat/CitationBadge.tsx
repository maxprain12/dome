import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const hasPreview = Boolean(sourceTitle || sourcePassage || pageLabel || nodeTitle);
  const metaLine = [nodeTitle, pageLabel].filter(Boolean).join(' · ');

  const trigger = (
    <button
      type="button"
      onClick={() => onClickCitation?.(number)}
      className="not-typeset inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={t('chat.citation_label', { number, title: sourceTitle || '' })}
      title={[sourceTitle, metaLine].filter(Boolean).join(' · ')}
    >
      <Badge
        variant="secondary"
        className="max-w-full"
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
          <div className={`text-xs text-muted-foreground ${sourcePassage ? 'mb-1.5' : ''}`}>
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
