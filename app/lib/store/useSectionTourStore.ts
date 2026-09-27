import { create } from 'zustand';
import { getDismissedTours, setDismissedTours } from '@/lib/settings';

/**
 * Persisted dismissal and read progress for section setup screens.
 *
 * Section keys acknowledge dismissal; `<section>:reviewed:<step>` records
 * explanations the user explicitly marked as read. Never infer task completion.
 */
interface SectionTourState {
  seen: Record<string, boolean>;
  loaded: boolean;

  load: () => Promise<void>;
  /** Mark section guide as acknowledged (persist). */
  dismiss: (key: string) => Promise<void>;
}

export const useSectionTourStore = create<SectionTourState>((set, get) => ({
  seen: {},
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const seen = await getDismissedTours().catch(() => ({}));
    set({ seen: seen || {}, loaded: true });
  },

  dismiss: async (key) => {
    const next = { ...get().seen, [key]: true };
    await setDismissedTours(next);
    set({ seen: { ...get().seen, [key]: true } });
  },
}));
