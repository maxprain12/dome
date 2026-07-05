'use client';

import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

export function CanvasPaletteSectionHeader({
  expanded,
  onToggle,
  label,
  count,
  trailing,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
  count?: number;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-[var(--dome-bg)]"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        ) : (
          <ChevronRight className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        )}
        <span
          className="truncate text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--dome-text-muted)' }}
        >
          {label}
        </span>
        {typeof count === 'number' ? (
          <span
            className="shrink-0 rounded-full px-1.5 text-[9px] font-semibold tabular-nums"
            style={{
              background: 'var(--dome-bg-hover)',
              color: 'var(--dome-text-muted)',
              border: '1px solid var(--dome-border)',
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
      {trailing}
    </div>
  );
}

/**
 * Draggable palette block. Tinted icon chip (soft background + colored glyph)
 * instead of a solid color block, and a "+" affordance on hover so it reads
 * as both drag-source and click-to-add.
 */
export function CanvasPaletteRow({
  icon: Icon,
  iconImage,
  label,
  description,
  color,
  onAdd,
  onDragStart,
  title,
}: {
  icon?: React.ElementType;
  /** Optional sprite image path — takes precedence over `icon`. */
  iconImage?: string;
  label: string;
  description: string;
  color: string;
  onAdd: () => void;
  onDragStart: (e: React.DragEvent) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      className="group flex w-full cursor-grab select-none items-center gap-2.5 rounded-xl border px-2 py-2 text-left transition-all active:cursor-grabbing hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1"
      style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
      title={title ?? description}
    >
      <div
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        {iconImage ? (
          <img src={iconImage} alt="" className="size-full object-contain p-0.5" />
        ) : Icon ? (
          <Icon className="size-4" style={{ color }} strokeWidth={1.75} />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-tight" style={{ color: 'var(--dome-text)' }}>
          {label}
        </p>
        <p className="mt-0.5 truncate text-[10px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
          {description}
        </p>
      </div>
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
      >
        <Plus className="size-3" />
      </span>
    </button>
  );
}
