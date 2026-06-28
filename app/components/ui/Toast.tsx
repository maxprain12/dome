
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type Toast } from '@/lib/store/useToastStore';

const TOAST_ICONS = {
  success: Check,
  error: X,
  warning: AlertTriangle,
  info: Info,
} as const;

const TOAST_COLOR_VARS: Record<string, string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [isExiting, setIsExiting] = useState(false);
  const accent = TOAST_COLOR_VARS[toast.type] || 'var(--accent)';

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  return (
    <div
      className={`toast-item${isExiting ? ' toast-item--exit' : ''}`}
      style={{ '--toast-accent': accent } as CSSProperties}
    >
      <span className="toast-item__icon">
        {(() => {
          const Icon = TOAST_ICONS[toast.type] ?? Info;
          return <Icon size={14} strokeWidth={2.5} />;
        })()}
      </span>

      <span className="toast-item__message">
        {toast.message}
      </span>

      <button
        type="button"
        onClick={handleDismiss}
        className="toast-item__dismiss min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        aria-label={t('common.close')}
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes toast-enter {
            from { opacity: 0; transform: translateX(40px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes toast-exit {
            from { opacity: 1; transform: translateX(0); }
            to { opacity: 0; transform: translateX(40px); }
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .toast-item {
            animation: none !important;
          }
        }
      `}</style>
      <div className="toast-container">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </>
  );
}
