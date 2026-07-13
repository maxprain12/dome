'use client';

import {
  ChevronDownIcon as ChevronDownIcon,
  ChevronRightIcon as ChevronRightIcon,
  PlusSignIcon as PlusIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        aria-expanded={expanded}
        className="min-w-0 flex-1 justify-start px-1"
      >
        {expanded ? (
          <HugeiconsIcon icon={ChevronDownIcon} className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <HugeiconsIcon icon={ChevronRightIcon} className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span
          className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {label}
        </span>
        {typeof count === 'number' ? (
          <Badge variant="secondary" className="tabular-nums">
            {count}
          </Badge>
        ) : null}
      </Button>
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
    <Button
      type="button"
      variant="outline"
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      className="group h-auto w-full cursor-grab select-none justify-start gap-2.5 px-2 py-2 text-left active:cursor-grabbing"
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
        <p className="truncate text-xs font-semibold leading-tight text-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[10px] leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
      >
        <HugeiconsIcon icon={PlusIcon} />
      </span>
    </Button>
  );
}
