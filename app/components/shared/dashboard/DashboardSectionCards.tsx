import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type DashboardSectionCardItem = {
  id: string;
  label: string;
  value: string | number;
  delta?: number | null;
  deltaLabel?: string;
  footer?: string;
  hint?: string;
};

export function DashboardSectionCards({
  items,
  className,
}: {
  items: DashboardSectionCardItem[];
  className?: string;
}) {
  return (
    <div className={cn('@container/metrics', className)}>
      <div className="grid grid-cols-1 gap-4 @min-[420px]/metrics:grid-cols-2 @min-[900px]/metrics:grid-cols-4">
      {items.map((item) => {
        const delta = item.delta ?? 0;
        const up = delta > 0;
        const down = delta < 0;
        const badgeLabel =
          item.deltaLabel ?? (delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : null);
        return (
          <Card key={item.id} size="sm">
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">{item.value}</CardTitle>
              {badgeLabel ? (
                <CardAction>
                  <Badge variant="outline">
                    {up ? <HugeiconsIcon icon={ArrowUp01Icon} data-icon="inline-start" /> : null}
                    {down ? <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-start" /> : null}
                    {badgeLabel}
                  </Badge>
                </CardAction>
              ) : null}
            </CardHeader>
            {item.footer || item.hint ? (
              <CardFooter className="flex-col items-start gap-1 text-xs">
                {item.footer ? <div className="font-medium">{item.footer}</div> : null}
                {item.hint ? <div className="text-muted-foreground">{item.hint}</div> : null}
              </CardFooter>
            ) : null}
          </Card>
        );
      })}
      </div>
    </div>
  );
}
