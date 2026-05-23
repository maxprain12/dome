import type { ReactNode, KeyboardEvent, DragEventHandler } from 'react';
import { cn } from '@/lib/utils';

export interface HubBentoCardProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  /** Always visible actions (e.g. favorite star) — editorial rows only. */
  persistentTrailing?: ReactNode;
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
  /** `editorial` = fila plana con divisor (hub tabs); `card` = tarjeta con borde (legacy). */
  variant?: 'card' | 'editorial';
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
  persistentTrailing,
  onClick,
  selected,
  disabled,
  className,
  draggable,
  onDragStart,
  onDragEnd,
  layout = 'list',
  variant = 'card',
}: HubBentoCardProps) {
  const isEditorial = variant === 'editorial';
  const interactive = Boolean(onClick) && !disabled;
  const surfaceRole = interactive ? 'button' : draggable ? 'group' : undefined;

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

  const trailingWrap =
    trailing || persistentTrailing ? (
      <div className="shrink-0 flex items-center gap-0.5">
        {persistentTrailing}
        {trailing ? (
          <div
            role="toolbar"
            aria-orientation="horizontal"
            className={cn('flex items-center gap-0.5', isEditorial && 'hub-row-actions')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {trailing}
          </div>
        ) : null}
      </div>
    ) : null;

  const subtitleBlock = subtitle ? (
    <div
      className={cn('text-xs leading-relaxed min-w-0', isEditorial && 'hub-list-row-sub')}
      style={{ color: 'var(--dome-text-muted)' }}
    >
      {subtitle}
    </div>
  ) : null;

  const metaBlock = meta ? (
    <div
      className={cn(
        isEditorial ? 'hub-list-row-meta' : 'border-t pt-3 mt-0',
      )}
      style={isEditorial ? undefined : { borderColor: 'var(--dome-border)' }}
    >
      {meta}
    </div>
  ) : null;

  const baseStyle = isEditorial
    ? { opacity: disabled ? 0.55 : 1 }
    : ({
        background: selected ? 'var(--dome-surface)' : 'var(--dome-bg)',
        borderColor: selected ? 'var(--dome-accent)' : 'var(--dome-border)',
        opacity: disabled ? 0.55 : 1,
      } as const);

  const interactiveCls =
    !isEditorial &&
    interactive &&
    'focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1 hover:shadow-md hover:-translate-y-0.5';
  const cursorCls = (interactive || draggable) && 'cursor-pointer';

  if (layout === 'list') {
    return (
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- optional click + HTML5 drag on same wrapper
      <div
        role={surfaceRole}
        tabIndex={interactive ? 0 : undefined}
        draggable={Boolean(draggable)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={interactive ? handleClick : undefined}
        onKeyDown={interactive ? handleKey : undefined}
        className={cn(
          isEditorial
            ? 'hub-list-row flex w-full max-w-full min-w-0 flex-row items-start gap-4 px-4 py-4 transition-colors outline-none'
            : 'flex w-full max-w-full min-w-0 flex-row items-start gap-4 rounded-xl border p-4 transition-all outline-none',
          isEditorial && selected && 'hub-list-row-selected',
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
              <div
                className={cn(
                  'flex min-w-0 flex-wrap items-center gap-2',
                  isEditorial && 'hub-list-row-title',
                )}
              >
                {title}
              </div>
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
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- optional click + HTML5 drag on same wrapper
    <div
      role={surfaceRole}
      tabIndex={interactive ? 0 : undefined}
      draggable={Boolean(draggable)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={interactive ? handleKey : undefined}
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
