'use client';

import * as React from 'react';
import { useMemo, type ReactNode, type RefObject } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';

export interface ComposerAnchorRect {
  top: number;
  left: number;
}

export interface ComposerFloatingPickerProps {
  open: boolean;
  anchorRect: ComposerAnchorRect | null;
  children: ReactNode;
  className?: string;
  panelRef?: RefObject<HTMLDivElement | null>;
  width?: number;
  maxHeight?: number;
}

export function ComposerFloatingPicker({
  open,
  anchorRect,
  children,
  className,
  panelRef,
  width = 300,
  maxHeight = 260,
}: ComposerFloatingPickerProps) {
  const virtualAnchor = useMemo(() => {
    if (!anchorRect) return null;
    const { top, left } = anchorRect;
    return {
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        top,
        left,
        right: left,
        bottom: top,
        x: left,
        y: top,
        toJSON: () => ({}),
      }),
    };
  }, [anchorRect]);

  if (!open || !virtualAnchor) return null;

  return (
    <PopoverPrimitive.Root open={open} modal={false}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={virtualAnchor}
          side="top"
          sideOffset={6}
          align="start"
          className="isolate z-50 outline-none"
        >
          <PopoverPrimitive.Popup
            data-slot="composer-floating-picker"
            className={cn(
              'z-50 flex origin-(--transform-origin) flex-col overflow-hidden rounded-3xl bg-popover p-0 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 dark:ring-foreground/10',
              className,
            )}
            style={{ width, maxHeight }}
          >
            <div ref={panelRef as React.Ref<HTMLDivElement>} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
