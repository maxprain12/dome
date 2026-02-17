import { memo } from 'react';
import ManyIcon from './ManyIcon';
import type { ManyStatus } from '@/lib/store/useManyStore';

interface ManyFloatingTriggerProps {
  onClick: () => void;
  status: ManyStatus;
  totalNotifications: number;
  whatsappConnected: boolean;
}

export default memo(function ManyFloatingTrigger({
  onClick,
  status,
  totalNotifications,
  whatsappConnected,
}: ManyFloatingTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="many-floating-trigger fixed bottom-6 right-6 z-[9999] flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--bg-secondary)] shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-shadow duration-200 hover:shadow-[0_6px_24px_rgba(0,0,0,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
      aria-label="Abrir chat con Many"
    >
      <ManyIcon size={32} />

      {totalNotifications > 0 ? (
        <span
          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--bg)] bg-[var(--error,#ef4444)] text-[11px] font-bold text-white"
          aria-hidden
        >
          {totalNotifications > 9 ? '9+' : totalNotifications}
        </span>
      ) : null}

      {status !== 'idle' && (
        <span
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[var(--bg)] ${
            status === 'thinking' ? 'bg-[var(--warning,#f59e0b)] animate-many-pulse' : 'bg-[var(--success,#22c55e)]'
          }`}
          aria-hidden
        />
      )}

      {whatsappConnected && (
        <span
          className="absolute left-0 top-0 h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-[#25D366]"
          title="WhatsApp conectado"
          aria-hidden
        />
      )}
    </button>
  );
});
