import type { ReactNode } from 'react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  busy = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const resolvedConfirm = confirmLabel ?? t('ui.confirm');
  const resolvedCancel = cancelLabel ?? t('common.cancel');
  const isDanger = variant === 'danger';

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent size="default">
        <AlertDialogHeader>
          {isDanger ? (
            <AlertDialogMedia className="bg-destructive/10">
              <HugeiconsIcon icon={Alert02Icon} className="size-5 text-destructive" aria-hidden />
            </AlertDialogMedia>
          ) : null}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            {resolvedCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={isDanger ? 'destructive' : 'default'}
            loading={busy}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {resolvedConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
