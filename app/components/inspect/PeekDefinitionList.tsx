import { cn } from '@/lib/utils';

export type PeekDefinitionItem = {
  key: string;
  value: string;
};

export function PeekDefinitionList({
  items,
  className,
}: {
  items: PeekDefinitionItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <dl className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11.5px]', className)}>
      {items.map((item) => (
        <div key={item.key} className="contents">
          <dt className="text-muted-foreground">{item.key}</dt>
          <dd className="m-0 min-w-0 truncate text-foreground" title={item.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function formatToolArgValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
