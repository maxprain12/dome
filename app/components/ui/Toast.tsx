
import { useEffect, useState } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type Toast } from '@/lib/store/useToastStore';

const TOAST_ICONS = {
  success: Check,
  error: X,
  warning: AlertTriangle,
  info: Info,
} as const;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const colorVar: Record<string, string> = {
    success: 'var(--success)',
    error: 'var(--error)',
    warning: 'var(--warning)',
    info: 'var(--accent)',
  };

  return (
    <div
      className="toast-item"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 16px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${colorVar[toast.type] || 'var(--accent)'}`,
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        minWidth: 280,
        maxWidth: 420,
        animation: isExiting ? 'toast-exit 0.2s ease-in forwards' : 'toast-enter 0.25s ease-out',
        pointerEvents: 'auto',
      }}
    >
      <span
        style={{
          color: colorVar[toast.type] || 'var(--accent)',
          flexShrink: 0,
          width: 18,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {(() => {
          const Icon = TOAST_ICONS[toast.type] ?? Info;
          return <Icon size={14} strokeWidth={2.5} />;
        })()}
      </span>

      <span
        style={{
          flex: 1,
          fontSize: 13,
          lineHeight: '1.45',
          color: 'var(--primary-text)',
          wordBreak: 'break-word',
        }}
      >
        {toast.message}
      </span>

      <button
        onClick={handleDismiss}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--tertiary-text)',
          fontSize: 14,
          padding: 10,
          flexShrink: 0,
          lineHeight: 1,
          marginTop: -1,
        }}
        aria-label="Cerrar"
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
      <div
        style={{
          position: 'fixed',
          top: 56,
          right: 16,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
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
