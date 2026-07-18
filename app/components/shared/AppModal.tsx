import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const contentWidthClass = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
} as const;

export type AppModalSize = keyof typeof contentWidthClass;

export interface AppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/** Centered modal shell — shared chrome for form/picker dialogs. */
export function AppModal({ open, onOpenChange, children }: AppModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  );
}

export interface AppModalContentProps {
  size?: AppModalSize;
  className?: string;
  children: ReactNode;
  showCloseButton?: boolean;
  'aria-busy'?: boolean;
}

export function AppModalContent({
  size = 'sm',
  className,
  children,
  showCloseButton = true,
  ...props
}: AppModalContentProps) {
  return (
    <DialogContent
      showCloseButton={showCloseButton}
      className={cn(
        'flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0',
        contentWidthClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

export interface AppModalHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function AppModalHeader({ title, description, className }: AppModalHeaderProps) {
  return (
    <DialogHeader
      className={cn(
        'shrink-0 gap-0.5 border-b px-4 py-3 pr-12 text-left',
        className,
      )}
    >
      <DialogTitle className="truncate">{title}</DialogTitle>
      {description ? (
        <DialogDescription className="truncate">{description}</DialogDescription>
      ) : null}
    </DialogHeader>
  );
}

export function AppModalBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-3', className)}>
      {children}
    </div>
  );
}

export function AppModalFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogFooter className={cn('shrink-0 border-t px-4 py-3 sm:justify-end', className)}>
      {children}
    </DialogFooter>
  );
}
