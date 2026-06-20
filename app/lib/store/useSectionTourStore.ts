import { create } from 'zustand';
import { getDismissedTours, setDismissedTours } from '@/lib/settings';

/**
 * Persisted acknowledgment for per-section "How to use" guides (modal).
 *
 * `seen` is stored under settings key `section_tours_dismissed` when the user
 * clicks "Entendido" in the guide modal.
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
    const seen = await getDismissedTours();
    set({ seen: seen || {}, loaded: true });
  },

  dismiss: async (key) => {
    const next = { ...get().seen, [key]: true };
    set({ seen: next });
    await setDismissedTours(next);
  },
}));
