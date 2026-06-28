import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import DomeButton from './DomeButton';

export type DomeModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface DomeModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DomeModalSize;
  className?: string;
  /** Decoración opcional a la izquierda del título (p. ej. icono de peligro). */
  headerIcon?: ReactNode;
  /** Línea secundaria bajo el título. */
  subtitle?: string;
  /** Acciones extra en la cabecera, antes del botón de cerrar. */
  headerActions?: ReactNode;
  /** Cerrar con Escape (default true). */
  closeOnEscape?: boolean;
  /** Cerrar al hacer click en el overlay (default true). */
  closeOnOverlay?: boolean;
  /** Elemento que recibe el foco inicial; si no, el panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const sizeClass: Record<DomeModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  // Superficie de trabajo (runtime de plugins, visores): casi pantalla completa
  full: 'max-w-6xl h-[85vh] !max-h-[85vh]',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Modal base del design system (03/T01): portal, Escape, focus trap,
 * devolución de foco al trigger, scroll lock del body y aria completo.
 * Todos los modales de la app deben componerse sobre esta base.
 */
export default function DomeModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className,
  headerIcon,
  subtitle,
  headerActions,
  closeOnEscape = true,
  closeOnOverlay = true,
  initialFocusRef,
}: DomeModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDialogElement>(null);

  // Escape + focus trap (Tab cycling within the panel)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) {
          e.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, closeOnEscape]);

  // Initial focus + return focus to the trigger on close
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      if (initialFocusRef?.current) initialFocusRef.current.focus();
      else panelRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  }, [open, initialFocusRef]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'var(--overlay-bg, rgba(0, 0, 0, 0.45))',
        animation: 'overlay-appear 0.2s ease-out',
      }}
      role="presentation"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        ref={panelRef}
        open
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'flex max-h-[min(90vh,640px)] w-full flex-col overflow-hidden rounded-xl border shadow-xl outline-none',
          'border-[var(--dome-border,var(--border))]',
          'bg-[var(--dome-surface,var(--bg-secondary))]',
          sizeClass[size],
          className,
        )}
        style={{ animation: 'modal-appear 0.2s ease-out', margin: 'auto', maxWidth: 'unset' }}
        onMouseDown={(e) => e.stopPropagation()}
        onCancel={(e) => {
          e.preventDefault();
          if (closeOnEscape) onClose();
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {headerIcon ?? null}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-semibold text-[var(--primary-text)]">
                {title}
              </h2>
              {subtitle ? (
                <p className="truncate text-xs text-[var(--tertiary-text)]">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions ?? null}
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={t('common.close')}
              onClick={onClose}
            >
              <X className="size-4" />
            </DomeButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[var(--primary-text)]">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </dialog>
    </div>,
    document.body,
  );
}
