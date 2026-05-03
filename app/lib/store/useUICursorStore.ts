import { create } from 'zustand';

export interface UICursorState {
  visible: boolean;
  /** CSS selector OR [data-ui-target="name"] shorthand (just pass the name, e.g. "tab-home") */
  targetSelector: string | null;
  tooltip: string | null;

  show: (target: string, tooltip?: string) => void;
  hide: () => void;
}

export const useUICursorStore = create<UICursorState>((set) => ({
  visible: false,
  targetSelector: null,
  tooltip: null,

  show: (target, tooltip) =>
    set({ visible: true, targetSelector: target, tooltip: tooltip ?? null }),

  hide: () => set({ visible: false, targetSelector: null, tooltip: null }),
}));

/**
 * Resolve a target string to a CSS selector.
 * If the target already contains '[', '.' or '#' it's used as-is.
 * Otherwise it's treated as a data-ui-target name.
 */
export function resolveSelector(target: string): string {
  if (target.includes('[') || target.startsWith('.') || target.startsWith('#')) {
    return target;
  }
  return `[data-ui-target="${target}"]`;
}
