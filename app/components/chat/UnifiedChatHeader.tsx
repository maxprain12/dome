import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface UnifiedChatHeaderProps {
  /** Optional e.g. back chevron (before avatar) */
  startSlot?: ReactNode;
  left: ReactNode;
  title: string;
  subtitle: string;
  /** Toolbar on the right (e.g. new, clear, close) */
  actions?: ReactNode;
  className?: string;
}

/**
 * Shared chat header: avatar slot, title, subtitle, actions.
 * Uses app theme tokens (Many + specialized agents look the same).
 */
export const UnifiedChatHeader = memo(function UnifiedChatHeader({
  startSlot,
  left,
  title,
  subtitle,
  actions,
  className,
}: UnifiedChatHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 shrink-0',
        className,
      )}
    >
      {startSlot ? <div className="shrink-0 flex items-center">{startSlot}</div> : null}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-secondary)]">
        {left}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[var(--primary-text)]">{title}</div>
        <div className="truncate text-[11px] text-[var(--tertiary-text)]">{subtitle}</div>
      </div>
      {actions ? <div className="flex items-center gap-0.5 shrink-0">{actions}</div> : null}
    </div>
  );
});
