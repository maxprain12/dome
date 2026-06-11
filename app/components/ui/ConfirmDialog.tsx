import { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeModal from './DomeModal';
import DomeButton from './DomeButton';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación — composición fina sobre DomeModal (03/T01).
 * API pública sin cambios.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const resolvedConfirm = confirmLabel ?? t('ui.confirm');
  const resolvedCancel = cancelLabel ?? t('common.cancel');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isDanger = variant === 'danger';

  return (
    <DomeModal
      open={isOpen}
      onClose={onCancel}
      title={title}
      size="sm"
      initialFocusRef={confirmRef}
      headerIcon={
        isDanger ? (
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--error) 12%, transparent)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--error)' }} />
          </span>
        ) : undefined
      }
      footer={
        <>
          <DomeButton type="button" variant="secondary" onClick={onCancel}>
            {resolvedCancel}
          </DomeButton>
          <DomeButton
            ref={confirmRef}
            type="button"
            variant={isDanger ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {resolvedConfirm}
          </DomeButton>
        </>
      }
    >
      <p className="m-0 text-sm leading-relaxed text-[var(--secondary-text)]">{message}</p>
    </DomeModal>
  );
}
