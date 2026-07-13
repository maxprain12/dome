import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

const contentWidthClass = {
  sm: 'sm:[--drawer-content-width:20rem]',
  md: 'sm:[--drawer-content-width:28rem]',
  lg: 'sm:[--drawer-content-width:36rem]',
  xl: 'sm:[--drawer-content-width:44rem]',
} as const;

export type DetailDrawerSize = keyof typeof contentWidthClass;

export interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Side panel (default) or bottom sheet. */
  direction?: 'right' | 'down';
}

export function DetailDrawer({
  open,
  onOpenChange,
  children,
  direction = 'right',
}: DetailDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection={direction}>
      {children}
    </Drawer>
  );
}

export interface DetailDrawerContentProps {
  size?: DetailDrawerSize;
  className?: string;
  children: ReactNode;
  showCloseButton?: boolean;
  direction?: 'right' | 'down';
}

export function DetailDrawerContent({
  size = 'md',
  className,
  children,
  showCloseButton = true,
  direction = 'right',
}: DetailDrawerContentProps) {
  return (
    <DrawerContent
      className={cn(
        direction === 'right' &&
          'h-full max-h-dvh [--drawer-content-height:100dvh] [--drawer-content-max-height:100dvh]',
        direction === 'down' && '[--drawer-content-max-height:min(90dvh,720px)]',
        contentWidthClass[size],
        'gap-0 p-0',
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {showCloseButton ? (
        <DrawerClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4 z-10"
            />
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          <span className="sr-only">Close</span>
        </DrawerClose>
      ) : null}
    </DrawerContent>
  );
}

export interface DetailDrawerHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function DetailDrawerHeader({
  title,
  description,
  badge,
  icon,
  className,
}: DetailDrawerHeaderProps) {
  return (
    <DrawerHeader className={cn('shrink-0 gap-2 border-b px-5 py-4 pr-14 text-left', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle className="truncate leading-snug">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription className="truncate">{description}</DrawerDescription>
          ) : null}
          {badge ? <div className="flex flex-wrap gap-1.5 pt-0.5">{badge}</div> : null}
        </div>
      </div>
    </DrawerHeader>
  );
}

export function DetailDrawerBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn('max-w-full font-normal', className)}>
      <span className="truncate">{children}</span>
    </Badge>
  );
}

export function DetailDrawerBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)}>{children}</div>
  );
}

export function DetailDrawerFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DrawerFooter
      className={cn(
        'shrink-0 flex-row items-center gap-2 border-t px-5 py-3 sm:justify-between',
        className,
      )}
    >
      {children}
    </DrawerFooter>
  );
}

export function DetailDrawerSection({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      {children}
    </section>
  );
}

export interface DetailDrawerMetaItem {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

export function DetailDrawerMetaGrid({
  items,
  className,
}: {
  items: DetailDrawerMetaItem[];
  className?: string;
}) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            {item.icon ? (
              <span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">{item.icon}</span>
            ) : null}
            <span className="min-w-0 truncate">{item.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailDrawerPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border bg-muted/50 px-3 py-2.5 text-sm', className)}>
      {children}
    </div>
  );
}
