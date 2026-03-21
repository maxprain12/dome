import type { LucideIcon } from 'lucide-react';

interface ActionCardProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'primary';
}

export default function ActionCard({
  label,
  icon: Icon,
  onClick,
  variant = 'default',
}: ActionCardProps) {
  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center gap-2 rounded-xl border p-4
        transition-all duration-200 hover:border-[var(--dome-accent)] hover:shadow-sm
        min-w-[100px]
      `}
      style={{
        background: isPrimary ? 'var(--dome-accent)' : 'var(--dome-surface)',
        borderColor: isPrimary ? 'var(--dome-accent)' : 'var(--dome-border)',
        color: isPrimary ? '#ffffff' : 'var(--dome-text)',
      }}
      onMouseEnter={(e) => {
        if (!isPrimary) {
          (e.currentTarget as HTMLElement).style.background = 'var(--dome-bg)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isPrimary) {
          (e.currentTarget as HTMLElement).style.background = 'var(--dome-surface)';
        }
      }}
    >
      <Icon
        className="h-5 w-5 shrink-0"
        strokeWidth={1.5}
        style={{ color: isPrimary ? '#ffffff' : 'var(--dome-accent)' }}
      />
      <span className="text-xs font-medium whitespace-nowrap">{label}</span>
    </button>
  );
}
