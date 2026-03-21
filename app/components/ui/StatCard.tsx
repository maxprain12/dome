import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  iconColor?: string;
  onClick?: () => void;
  loading?: boolean;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'var(--dome-accent)',
  onClick,
  loading = false,
}: StatCardProps) {
  const isClickable = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`
        flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all duration-200
        ${isClickable ? 'cursor-pointer hover:border-[var(--dome-accent)] hover:shadow-sm' : 'cursor-default'}
      `}
      style={{
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
        minWidth: '120px',
      }}
    >
      <div className="flex items-center justify-between">
        {Icon && (
          <Icon
            className="h-4 w-4 shrink-0"
            strokeWidth={1.5}
            style={{ color: iconColor }}
          />
        )}
        {loading && (
          <div
            className="h-3 w-8 animate-pulse rounded"
            style={{ background: 'var(--dome-border)' }}
          />
        )}
      </div>
      <div>
        <span
          className="text-2xl font-semibold tabular-nums"
          style={{ color: 'var(--dome-text)' }}
        >
          {loading ? '—' : value}
        </span>
        <p
          className="mt-0.5 text-xs leading-tight"
          style={{ color: 'var(--dome-text-muted)' }}
        >
          {label}
        </p>
      </div>
    </button>
  );
}
