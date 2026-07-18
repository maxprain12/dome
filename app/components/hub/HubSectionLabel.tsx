import { cn } from '@/lib/utils';

interface HubSectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

/** Uppercase muted section label (rail titles, catalog sections). */
export function HubSectionLabel({ children, className }: HubSectionLabelProps) {
  return (
    <p
      className={cn(
        'px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}
