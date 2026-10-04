import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const APPEARANCE_STORAGE_KEY = 'dome:appearance-v1';

interface AppearanceState {
  /** Frosted glass off: sidebar, tabs, Many panel and menus render solid. */
  reduceTransparency: boolean;
  setReduceTransparency: (value: boolean) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      reduceTransparency: false,
      setReduceTransparency: (value) => set({ reduceTransparency: value }),
    }),
    { name: APPEARANCE_STORAGE_KEY },
  ),
);
