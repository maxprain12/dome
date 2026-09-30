import { create } from 'zustand';
import type { ComplementCategory } from '@/lib/marketplace/editorial';

export interface ComplementIntent { category: ComplementCategory; id: string }
interface ComplementIntentState {
  intent: ComplementIntent | null;
  setIntent: (intent: ComplementIntent | null) => void;
}
// Retained until the catalog view finishes loading; it must survive a cold start.
export const useComplementIntentStore = create<ComplementIntentState>((set) => ({
  intent: null,
  setIntent: (intent) => set({ intent }),
}));
