import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

type StatusViewProps =
  | { state: 'loading'; label: string; rows?: number }
  | { state: 'empty'; title: string; description?: string; icon?: ReactNode; action?: ReactNode }
  | { state: 'error'; title: string; description?: string; action?: ReactNode };

export function StatusView(props: StatusViewProps) {
  if (props.state === 'loading') {
    return (
      <output className="flex flex-col gap-3" aria-label={props.label} aria-live="polite">
        {Array.from({ length: props.rows ?? 3 }, (_, index) => <Skeleton className="h-12 w-full" key={index} />)}
      </output>
    );
  }

  if (props.state === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>{props.title}</AlertTitle>
        {props.description ? <AlertDescription>{props.description}</AlertDescription> : null}
        {props.action ? <div className="mt-3 flex items-center gap-2">{props.action}</div> : null}
      </Alert>
    );
  }

  return (
    <Empty>
      {props.icon ? <EmptyMedia variant="icon">{props.icon}</EmptyMedia> : null}
      <EmptyHeader>
        <EmptyTitle>{props.title}</EmptyTitle>
        {props.description ? <EmptyDescription>{props.description}</EmptyDescription> : null}
      </EmptyHeader>
      {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
    </Empty>
  );
}
