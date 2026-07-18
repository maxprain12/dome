import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

const contentWidthClass = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
} as const;

export type DetailSheetSize = keyof typeof contentWidthClass;

export interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/** Desktop equivalent of DetailDrawer — anchored Sheet for a focused detail view. */
export function DetailSheet({ open, onOpenChange, children }: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {children}
    </Sheet>
  );
}

export interface DetailSheetContentProps {
  size?: DetailSheetSize;
  className?: string;
  children: ReactNode;
  showCloseButton?: boolean;
}

export function DetailSheetContent({
  size = 'md',
  className,
  children,
  showCloseButton = true,
}: DetailSheetContentProps) {
  return (
    <SheetContent
      showCloseButton={false}
      className={cn('h-full w-full gap-0 p-0', contentWidthClass[size], className)}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {showCloseButton ? (
        <SheetClose
          render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4 z-10" />}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          <span className="sr-only">Close</span>
        </SheetClose>
      ) : null}
    </SheetContent>
  );
}

export interface DetailSheetHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function DetailSheetHeader({ title, description, badge, icon, className }: DetailSheetHeaderProps) {
  return (
    <SheetHeader className={cn('shrink-0 gap-2 border-b px-5 py-4 pr-14 text-left', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <SheetTitle className="truncate leading-snug">{title}</SheetTitle>
          {description ? <SheetDescription className="truncate">{description}</SheetDescription> : null}
          {badge ? <div className="flex flex-wrap gap-1.5 pt-0.5">{badge}</div> : null}
        </div>
      </div>
    </SheetHeader>
  );
}

export function DetailSheetBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('max-w-full font-normal', className)}>
      <span className="truncate">{children}</span>
    </Badge>
  );
}

export function DetailSheetBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)}>{children}</div>;
}

export function DetailSheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <SheetFooter className={cn('shrink-0 flex-row items-center gap-2 border-t px-5 py-3 sm:justify-between', className)}>
      {children}
    </SheetFooter>
  );
}

export function DetailSheetSection({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      {children}
    </section>
  );
}

export interface DetailSheetMetaItem {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

export function DetailSheetMetaGrid({ items, className }: { items: DetailSheetMetaItem[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            {item.icon ? <span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">{item.icon}</span> : null}
            <span className="min-w-0 truncate">{item.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSheetPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border bg-muted/50 px-3 py-2.5 text-sm', className)}>{children}</div>;
}
