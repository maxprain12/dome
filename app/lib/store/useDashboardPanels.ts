import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DashboardPanelLayout = { id: string; visible: boolean; wide: boolean };
export type DashboardScope = 'home' | 'social';

/** Ignore stale IDs and malformed values, and append newly available panels. */
export function normalizeDashboardPanels(raw: unknown, defaults: DashboardPanelLayout[]): DashboardPanelLayout[] {
  if (!Array.isArray(raw)) return defaults.map((panel) => ({ ...panel }));
  const remaining = new Map(defaults.map((panel) => [panel.id, panel]));
  const result: DashboardPanelLayout[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const base = remaining.get(entry.id);
    if (!base) continue;
    result.push({
      id: base.id,
      visible: typeof entry.visible === 'boolean' ? entry.visible : base.visible,
      wide: typeof entry.wide === 'boolean' ? entry.wide : base.wide,
    });
    remaining.delete(base.id);
  }
  return [...result, ...remaining.values()];
}

interface DashboardPanelsState {
  layouts: Partial<Record<DashboardScope, DashboardPanelLayout[]>>;
  setLayout: (scope: DashboardScope, panels: DashboardPanelLayout[]) => void;
}

export const useDashboardPanels = create<DashboardPanelsState>()(persist(
  (set) => ({
    layouts: {},
    setLayout: (scope, panels) => set((state) => ({ layouts: { ...state.layouts, [scope]: panels } })),
  }),
  {
    name: 'dome:dashboard-panels:v2',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ layouts: state.layouts }),
    merge: (saved, current) => {
      const layouts = (saved as Partial<DashboardPanelsState> | null)?.layouts;
      return { ...current, layouts: layouts && typeof layouts === 'object' ? layouts : {} };
    },
  },
));
