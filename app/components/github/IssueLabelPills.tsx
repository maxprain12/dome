import { ColorPill } from '@/components/shared/InlineDetailCard';
import { cn } from '@/lib/utils';

export function IssueLabelPills({
  labels,
  max = 3,
  className,
}: {
  labels: string[];
  max?: number;
  className?: string;
}) {
  if (labels.length === 0) return null;
  const visible = labels.slice(0, max);
  const hidden = labels.length - visible.length;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {visible.map((label) => (
        <ColorPill key={label} className="max-w-36 border-border bg-muted text-muted-foreground">
          <span className="truncate">{label}</span>
        </ColorPill>
      ))}
      {hidden > 0 ? (
        <span className="text-[10px] text-muted-foreground">+{hidden}</span>
      ) : null}
    </div>
  );
}
