import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

let toastCounter = 0;

/**
 * Muestra una notificación toast (sonner).
 * Puede llamarse desde cualquier sitio (dentro o fuera de componentes React).
 */
export function showToast(type: ToastType, message: string, duration?: number): string {
  const id = `toast-${Date.now()}-${++toastCounter}`;
  const opts = {
    id,
    duration: duration ?? (type === 'error' ? 6000 : 4000),
  };

  switch (type) {
    case 'success':
      toast.success(message, opts);
      break;
    case 'error':
      toast.error(message, opts);
      break;
    case 'warning':
      toast.warning(message, opts);
      break;
    default:
      toast.info(message, opts);
  }

  return id;
}
