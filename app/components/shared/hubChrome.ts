import { cn } from '@/lib/utils';

/** Shared chrome for Contacts + Social hubs. Ink/paper, no uppercase eyebrows. */

export const hubPageTitleClass = 'min-w-0 truncate text-base font-semibold tracking-tight';

export const hubFichaTitleClass = 'min-w-0 truncate text-base font-semibold tracking-tight';

export const hubCanvasTitleClass = 'text-base font-semibold tracking-tight';

export const hubSectionClass = 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4';

export const hubSectionTitleClass = 'text-xs font-medium text-foreground';

export const hubFieldLabelClass = 'text-[11px] text-muted-foreground';

export function hubDirectoryRowClass(selected: boolean, className?: string) {
  return cn(
    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 motion-reduce:transition-none',
    selected && 'bg-muted shadow-[inset_2px_0_0_0_var(--foreground)]',
    className,
  );
}
