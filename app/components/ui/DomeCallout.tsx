import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DomeCalloutTone = 'info' | 'warning' | 'error' | 'success';

export interface DomeCalloutProps {
  tone?: DomeCalloutTone;
  title?: string;
  children: ReactNode;
  /** Sustituye el icono por defecto del tono. */
  icon?: LucideIcon;
  className?: string;
}

const toneIcon: Record<DomeCalloutTone, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
};

const toneStyles: Record<
  DomeCalloutTone,
  { border: string; bg: string; icon: string; title: string }
> = {
  info: {
    border: 'var(--dome-border, var(--border))',
    bg: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 8%, var(--dome-bg, var(--bg)))',
    icon: 'var(--dome-accent, var(--accent))',
    title: 'var(--dome-text, var(--primary-text))',
  },
  warning: {
    border: 'color-mix(in srgb, var(--warning, #d97706) 35%, var(--dome-border, var(--border)))',
    bg: 'color-mix(in srgb, var(--warning, #d97706) 10%, var(--dome-bg, var(--bg)))',
    icon: 'var(--warning, #d97706)',
    title: 'var(--dome-text, var(--primary-text))',
  },
  error: {
    border: 'color-mix(in srgb, var(--error) 40%, var(--dome-border, var(--border)))',
    bg: 'color-mix(in srgb, var(--error) 10%, var(--dome-bg, var(--bg)))',
    icon: 'var(--error)',
    title: 'var(--dome-text, var(--primary-text))',
  },
  success: {
    border: 'color-mix(in srgb, var(--success, #10b981) 35%, var(--dome-border, var(--border)))',
    bg: 'color-mix(in srgb, var(--success, #10b981) 10%, var(--dome-bg, var(--bg)))',
    icon: 'var(--success, #10b981)',
    title: 'var(--dome-text, var(--primary-text))',
  },
};

/**
 * Aviso en caja con icono y tono semántico.
 */
export default function DomeCallout({
  tone = 'info',
  title,
  children,
  icon: IconOverride,
  className,
}: DomeCalloutProps) {
  const Icon = IconOverride ?? toneIcon[tone];
  const s = toneStyles[tone];

  return (
    <div
      className={cn('rounded-xl border px-3 py-2.5 text-sm', className)}
      style={{ borderColor: s.border, backgroundColor: s.bg }}
      role="note"
    >
      <div className="flex gap-2.5 min-w-0">
        <Icon className="shrink-0 w-4 h-4 mt-0.5" style={{ color: s.icon }} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          {title ? (
            <p className="text-xs font-semibold" style={{ color: s.title }}>
              {title}
            </p>
          ) : null}
          <div className="text-xs leading-relaxed text-[var(--dome-text-muted,var(--secondary-text))]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
