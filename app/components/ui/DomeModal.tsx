import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import DomeButton from './DomeButton';

export type DomeModalSize = 'sm' | 'md' | 'lg';

export interface DomeModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DomeModalSize;
  className?: string;
}

const sizeClass: Record<DomeModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

/**
 * Modal accesible (portal, Escape, foco inicial en panel).
 */
export default function DomeModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className,
}: DomeModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'var(--overlay-bg, rgba(0, 0, 0, 0.45))',
      }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'flex max-h-[min(90vh,640px)] w-full flex-col overflow-hidden rounded-xl border shadow-xl outline-none',
          'border-[var(--dome-border,var(--border))]',
          'bg-[var(--dome-surface,var(--bg-secondary))]',
          sizeClass[size],
          className,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-[var(--primary-text)]">
            {title}
          </h2>
          <DomeButton
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </DomeButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[var(--primary-text)]">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
