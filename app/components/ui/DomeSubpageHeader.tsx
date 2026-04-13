import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DomeSubpageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  trailing?: ReactNode;
  className?: string;
}

/**
 * Cabecera de subpágina (volver + título + acciones).
 */
export default function DomeSubpageHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  trailing,
  className,
}: DomeSubpageHeaderProps) {
  return (
    <header
      className={cn(
        'shrink-0 flex items-start gap-3 px-5 py-4 border-b border-[var(--border)] bg-[var(--bg)]',
        className,
      )}
      style={{ borderBottomColor: 'var(--dome-border, var(--border))' }}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg p-1.5 text-[var(--primary-text)] hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          aria-label={backLabel}
        >
          <ChevronLeft className="w-5 h-5" aria-hidden />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold text-[var(--primary-text)] break-words line-clamp-4">{title}</h1>
        {subtitle != null && subtitle !== '' ? (
          <div className="text-xs text-[var(--secondary-text)] mt-0.5 line-clamp-4">{subtitle}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 flex items-center gap-2">{trailing}</div> : null}
    </header>
  );
}
