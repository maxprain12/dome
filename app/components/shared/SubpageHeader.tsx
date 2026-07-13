import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { collectCompoundSlots, defineSlot } from '@/lib/utils/compoundSlots';

export interface SubpageHeaderProps {
  onBack?: () => void;
  backLabel?: string;
  className?: string;
  children?: ReactNode;
}

const Title = defineSlot('SubpageHeader.Title');
const Subtitle = defineSlot('SubpageHeader.Subtitle');
const Trailing = defineSlot('SubpageHeader.Trailing');

/**
 * Cabecera de subpágina (volver + título + acciones).
 */
function SubpageHeader({
  onBack,
  backLabel = 'Back',
  className,
  children,
}: SubpageHeaderProps) {
  const { title, subtitle, trailing } = collectCompoundSlots(children, {
    title: Title,
    subtitle: Subtitle,
    trailing: Trailing,
  });

  return (
    <header
      className={cn(
        'shrink-0 flex items-start gap-3 px-5 py-4 border-b border-border bg-background',
        className,
      )}
    >
      {onBack ? (
        <Button
          type="button"
          onClick={onBack}
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={backLabel}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        {title != null ? (
          <h1 className="text-base font-semibold text-foreground break-words line-clamp-4">{title}</h1>
        ) : null}
        {subtitle != null && subtitle !== '' ? (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-4">{subtitle}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 flex items-center gap-2">{trailing}</div> : null}
    </header>
  );
}

SubpageHeader.Title = Title;
SubpageHeader.Subtitle = Subtitle;
SubpageHeader.Trailing = Trailing;

export default SubpageHeader;
