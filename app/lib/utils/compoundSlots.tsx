import {
  Children,
  isValidElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';

export type SlotComponent = ComponentType<{ children?: ReactNode }> & { slotName?: string };

/** Marker component — parent collects `children` by matching `displayName`. */
export function defineSlot(displayName: string): SlotComponent {
  function Slot({ children }: { children?: ReactNode }) {
    return children ?? null;
  }
  Slot.displayName = displayName;
  Slot.slotName = displayName;
  return Slot;
}

export function collectCompoundSlots(
  children: ReactNode,
  slots: Record<string, SlotComponent>,
): Record<string, ReactNode> {
  const byDisplayName = new Map<string, string>();
  for (const [key, Comp] of Object.entries(slots)) {
    if (Comp.displayName) byDisplayName.set(Comp.displayName, key);
  }

  const result: Record<string, ReactNode> = {};
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ children?: ReactNode }>;
    const type = el.type as SlotComponent;
    const key = type.displayName ? byDisplayName.get(type.displayName) : undefined;
    if (key) result[key] = el.props.children;
  });
  return result;
}
