import type { ReactNode, MouseEvent, KeyboardEvent, DragEventHandler } from 'react';

export interface HubListItemProps {
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
 * Dense list row for automations / runs style lists.
 */
export default function HubListItem({
  icon,
  title,
  subtitle,
  meta,
  trailing,
  onClick,
  selected,
  disabled,
  className = '',
  draggable,
  onDragStart,
  onDragEnd,
}: HubListItemProps) {
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
      className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors outline-none ${
        interactive ? 'focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1' : ''
      } ${className} ${interactive || draggable ? 'cursor-pointer' : ''}`.trim()}
      style={{
        background: selected ? 'var(--dome-surface)' : undefined,
        borderBottom: '1px solid var(--dome-border)',
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (!interactive) return;
        (e.currentTarget as HTMLDivElement).style.background = 'var(--dome-surface)';
      }}
      onMouseLeave={(e) => {
        if (!interactive) return;
        (e.currentTarget as HTMLDivElement).style.background = selected ? 'var(--dome-surface)' : '';
      }}
    >
      {icon ? <div className="shrink-0 mt-0.5">{icon}</div> : null}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">{title}</div>
        {subtitle ? (
          <div className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
            {subtitle}
          </div>
        ) : null}
        {meta ? <div className="mt-1">{meta}</div> : null}
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
  );
}
