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
  /**
   * `list` = fila a ancho completo (icono + texto + acciones), evita columnas estrechas en grid.
   * `card` = diseño tipo mosaico apilado (columna).
   */
  layout?: 'card' | 'list';
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
  layout = 'list',
}: HubBentoCardProps) {
  const interactive = Boolean(onClick) && !disabled;

  const handleKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const handleClick = () => {
    if (!interactive) return;
    onClick?.();
  };

  const trailingWrap = trailing ? (
    <div
      className="shrink-0 flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {trailing}
    </div>
  ) : null;

  const subtitleBlock = subtitle ? (
    <div className="text-xs leading-relaxed min-w-0" style={{ color: 'var(--dome-text-muted)' }}>
      {subtitle}
    </div>
  ) : null;

  const metaBlock = meta ? (
    <div className="border-t pt-3 mt-0" style={{ borderColor: 'var(--dome-border)' }}>
      {meta}
    </div>
  ) : null;

  const baseStyle = {
    background: selected ? 'var(--dome-surface)' : 'var(--dome-bg)',
    borderColor: selected ? 'var(--dome-accent)' : 'var(--dome-border)',
    opacity: disabled ? 0.55 : 1,
  } as const;

  const interactiveCls =
    interactive &&
    'focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1 hover:shadow-md hover:-translate-y-0.5';
  const cursorCls = (interactive || draggable) && 'cursor-pointer';

  if (layout === 'list') {
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
          'flex w-full max-w-full min-w-0 flex-row items-start gap-4 rounded-xl border p-4 transition-all outline-none',
          interactiveCls,
          cursorCls,
          className,
        )}
        style={baseStyle}
      >
        {icon ? <div className="shrink-0">{icon}</div> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">{title}</div>
            </div>
            {trailingWrap}
          </div>
          {subtitleBlock}
          {metaBlock}
        </div>
      </div>
    );
  }

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
        'flex flex-col gap-3 p-4 rounded-xl border transition-all outline-none min-w-0',
        interactiveCls,
        cursorCls,
        className,
      )}
      style={baseStyle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon ? <div className="shrink-0">{icon}</div> : null}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">{title}</div>
          </div>
        </div>
        {trailingWrap}
      </div>

      {subtitle ? (
        <div className="text-xs leading-relaxed min-w-0" style={{ color: 'var(--dome-text-muted)' }}>
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
