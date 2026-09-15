import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardCollection({ title, description, action, loading, emptyTitle, children, empty }: {
  title: string; description?: string; action?: ReactNode; loading?: boolean;
  emptyTitle: string; empty: boolean; children: ReactNode;
}) {
  return <Card>
    <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}{action && <CardAction>{action}</CardAction>}</CardHeader>
    <CardContent className="flex flex-col gap-2">
      {loading ? <><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></> : empty ? <Empty><EmptyHeader><EmptyTitle>{emptyTitle}</EmptyTitle></EmptyHeader></Empty> : children}
    </CardContent>
  </Card>;
}

export function DashboardRow({ title, detail, marker, trailing, onClick }: {
  title: string; detail?: string; marker?: ReactNode; trailing?: ReactNode; onClick: () => void;
}) {
  return <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-background/60 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {marker && <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">{marker}</span>}
    <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate text-sm font-medium">{title}</span>{detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}</span>
    {trailing}
    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />
  </button>;
}
