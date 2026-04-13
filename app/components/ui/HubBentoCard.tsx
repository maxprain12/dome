import type { ReactNode, MouseEvent, KeyboardEvent, DragEventHandler } from 'react';
import { cn } from '@/lib/utils';

export interface HubBentoCardProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
}

/**
 * Bento-style card for automations, agents, workflows, and runs.
 */
export default function HubBentoCard({
  icon,
  title,
  subtitle,
  meta,
  trailing,
  onClick,
  selected,
  disabled,
  className,
  draggable,
  onDragStart,
  onDragEnd,
}: HubBentoCardProps) {
  const interactive = Boolean(onClick) && !disabled;

  const handleKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (!interactive) return;
    onClick?.();
  };

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      draggable={Boolean(draggable)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      onKeyDown={handleKey}
      className={cn(
        'flex flex-col gap-3 p-4 rounded-xl border transition-all outline-none',
        interactive &&
          'focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1 hover:shadow-md hover:-translate-y-0.5',
        (interactive || draggable) && 'cursor-pointer',
        className,
      )}
      style={{
        background: selected ? 'var(--dome-surface)' : 'var(--dome-bg)',
        borderColor: selected ? 'var(--dome-accent)' : 'var(--dome-border)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon ? <div className="shrink-0">{icon}</div> : null}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">{title}</div>
          </div>
        </div>
        {trailing ? (
          <div
            className="shrink-0 flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {trailing}
          </div>
        ) : null}
      </div>

      {subtitle ? (
        <div className="text-xs leading-relaxed flex-1" style={{ color: 'var(--dome-text-muted)' }}>
          {subtitle}
        </div>
      ) : null}

      {meta ? (
        <div className="mt-auto pt-3 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          {meta}
        </div>
      ) : null}
    </div>
  );
}
