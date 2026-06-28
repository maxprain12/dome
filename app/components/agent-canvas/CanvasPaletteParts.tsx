'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';

export function CanvasPaletteSectionHeader({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 mb-2 text-left"
    >
      {expanded ? (
        <ChevronDown className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
      ) : (
        <ChevronRight className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
      )}
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
        {label}
      </span>
    </button>
  );
}

export function CanvasPaletteRow({
  icon: Icon,
  label,
  description,
  color,
  onAdd,
  onDragStart,
  title,
}: {
  icon: React.ElementType;
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
      className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-[var(--dome-bg)] border border-transparent hover:border-[var(--dome-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-1"
      title={title ?? description}
    >
      <div
        className="size-7 rounded-md flex items-center justify-center shrink-0"
        style={{ background: color }}
      >
        <Icon className="size-3.5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate leading-tight" style={{ color: 'var(--dome-text)' }}>
          {label}
        </p>
        <p className="text-[11px] truncate leading-snug mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
          {description}
        </p>
      </div>
    </button>
  );
}
