import { useId, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface CollapsibleRowProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  trigger: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  'aria-label'?: string;
}

export default function CollapsibleRow({
  expanded,
  onExpandedChange,
  trigger,
  children,
  disabled = false,
  className,
  triggerClassName,
  panelClassName,
  'aria-label': ariaLabel,
}: CollapsibleRowProps) {
  const panelId = useId();
  const hasBody = children != null;

  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange} className={cn('min-w-0', className)}>
      <CollapsibleTrigger
        disabled={disabled || !hasBody}
        aria-label={ariaLabel}
        aria-controls={hasBody ? panelId : undefined}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-foreground transition-colors duration-150 ease-[var(--ease-out)]',
          hasBody && !disabled ? 'cursor-pointer hover:bg-[var(--accent,var(--card))]' : 'cursor-default',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
          triggerClassName,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">{trigger}</span>
        {hasBody ? (
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-[var(--ease-out)] motion-reduce:transition-none',
              expanded ? 'rotate-180' : 'rotate-0',
            )}
            aria-hidden
          />
        ) : null}
      </CollapsibleTrigger>
      {hasBody ? (
        <CollapsibleContent id={panelId} className={cn('min-w-0 pb-2 pl-1 pt-1', panelClassName)}>
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
