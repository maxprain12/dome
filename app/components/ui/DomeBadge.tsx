import { cn } from '@/lib/utils';

export type DomeBadgeVariant = 'filled' | 'outline' | 'soft';

export interface DomeBadgeProps {
  label: string;
  /** Color para tint (hex, `var(--accent)`, etc.). Por defecto usa acento del tema. */
  color?: string;
  variant?: DomeBadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'text-[10px] px-1.5 py-0.5 gap-1',
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
};

/**
 * Badge / chip con soporte de color dinámico vía `color-mix`.
 */
export default function DomeBadge({
  label,
  color = 'var(--accent)',
  variant = 'soft',
  size = 'xs',
  dot = false,
  className,
}: DomeBadgeProps) {
  const base = cn(
    'inline-flex items-center rounded-full font-semibold max-w-full',
    sizeClasses[size],
    className,
  );

  if (variant === 'outline') {
    return (
      <span
        className={cn(base, 'border bg-transparent')}
        style={{ borderColor: color, color }}
      >
        {dot ? (
          <span className="shrink-0 rounded-full w-1.5 h-1.5" style={{ backgroundColor: color }} aria-hidden />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
    );
  }

  if (variant === 'filled') {
    return (
      <span className={cn(base, 'text-[var(--base-text)]')} style={{ backgroundColor: color }}>
        {dot ? (
          <span className="shrink-0 rounded-full w-1.5 h-1.5 bg-[var(--base-text)]/80" aria-hidden />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={base}
      style={{
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
      }}
    >
      {dot ? (
        <span className="shrink-0 rounded-full w-1.5 h-1.5" style={{ backgroundColor: color }} aria-hidden />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
