import { create } from 'zustand';
import type { SettingsSection } from '@/components/settings/registry';

interface SettingsUiState {
  activeSection: SettingsSection;
  hiddenSections: ReadonlySet<SettingsSection>;
  setActiveSection: (section: SettingsSection) => void;
  setHiddenSections: (hidden: ReadonlySet<SettingsSection>) => void;
}

export const useSettingsUiStore = create<SettingsUiState>((set) => ({
  activeSection: 'general',
  hiddenSections: new Set<SettingsSection>(),

  setActiveSection: (section) => set({ activeSection: section }),

  setHiddenSections: (hidden) => set({ hiddenSections: hidden }),
}));
