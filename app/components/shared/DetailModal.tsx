import { createContext, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DetailModalContext = createContext<(() => void) | null>(null);
export function useDetailModalClose() { return useContext(DetailModalContext); }

export function DetailModalClose() {
  const close = useContext(DetailModalContext);
  const { t } = useTranslation();
  if (!close) return null;
  return <Button variant="ghost" size="icon-sm" onClick={close} aria-label={t('common.close')}><HugeiconsIcon icon={Cancel01Icon} /></Button>;
}

export interface DetailModalProps {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: 'compact' | 'reading' | 'wide';
  /** Domain content supplies its own header, scrolling and actions. */
  bare?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Keep pending forms open on backdrop clicks; close and Escape remain explicit. */
  dismissOnOutsidePress?: boolean;
}

const widths = {
  compact: 'sm:max-w-[min(36rem,calc(100%-2rem))]',
  reading: 'sm:max-w-[min(56rem,calc(100%-2rem))]',
  wide: 'sm:max-w-[min(72rem,calc(100%-2rem))]',
};

/** Canonical entity detail: compact identity, bounded content, persistent actions. */
export function DetailModal({ open = true, onClose, title, description, icon, badges, actions, footer, children, size = 'reading', bare = false, className, bodyClassName, dismissOnOutsidePress = false }: DetailModalProps) {
  return <Dialog open={open} onOpenChange={(next, details) => {
    if (!next && (dismissOnOutsidePress || details.reason !== 'outside-press')) onClose();
  }}>
    <DetailModalContext.Provider value={onClose}>
      <DialogContent showCloseButton={false} className={cn('flex h-[min(90dvh,48rem)] max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-2xl p-0', widths[size], size === 'compact' && 'h-[min(82dvh,36rem)]', className)}>
        {bare ? <DialogTitle render={<span />} className="sr-only">{title}</DialogTitle> : <header className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
          {icon ? <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary [&_svg]:size-5">{icon}</span> : null}
          <div className="min-w-0 flex-1">
            <DialogTitle className="line-clamp-2 break-words text-base font-semibold leading-snug">{title}</DialogTitle>
            {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
            {badges ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
          </div>
          {actions}
          <DetailModalClose />
        </header>}
        {bare ? children : <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-5', bodyClassName)}>{children}</div>}
        {footer != null ? <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">{footer}</footer> : null}
      </DialogContent>
    </DetailModalContext.Provider>
  </Dialog>;
}

/** Main content with optional context; stack in narrow containers without clipping. */
export function DetailColumns({ children, context, className, fill = false }: { children: ReactNode; context?: ReactNode; className?: string; fill?: boolean }) {
  return <div className={cn('grid min-w-0 gap-6', context != null && 'md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.45fr)]', fill && 'min-h-0 flex-1 overflow-y-auto md:overflow-hidden', className)}>
    <div className={cn('min-w-0', fill && 'flex min-h-80 flex-col md:min-h-0 md:overflow-y-auto')}>{children}</div>
    {context != null ? <aside className={cn('min-w-0 border-t pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0', fill && 'md:overflow-y-auto')}>{context}</aside> : null}
  </div>;
}
