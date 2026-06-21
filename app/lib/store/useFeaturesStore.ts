import { create } from 'zustand';
import {
  getUserRole,
  setUserRole as persistUserRole,
  getFeatureVisibility,
  setFeatureVisibility as persistVisibility,
} from '@/lib/settings';
import { getRolePreset } from '@/lib/onboarding/roles';
import { TOGGLEABLE_FEATURE_KEYS, isFeatureVisible } from '@/lib/features/featureKeys';

interface FeaturesState {
  /** Active role id, or null if onboarding never set one. */
  role: string | null;
  /** featureKey → visible. A missing key means visible (default). */
  visibility: Record<string, boolean>;
  loaded: boolean;

  loadFeatures: () => Promise<void>;
  /** Toggle a single feature and persist. */
  setVisible: (key: string, visible: boolean) => Promise<void>;
  /** Apply a role's default visibility + persist role and map. */
  applyRolePreset: (roleId: string) => Promise<void>;
  /** Re-apply the current role's preset (used by the "reset" button). */
  resetToRolePreset: () => Promise<void>;
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  role: null,
  visibility: {},
  loaded: false,

  loadFeatures: async () => {
    const [role, visibility] = await Promise.all([getUserRole(), getFeatureVisibility()]);
    set({ role, visibility: visibility || {}, loaded: true });
  },

  setVisible: async (key, visible) => {
    const next = { ...get().visibility, [key]: visible };
    set({ visibility: next });
    await persistVisibility(next);
  },

  applyRolePreset: async (roleId) => {
    const preset = getRolePreset(roleId);
    const visibility: Record<string, boolean> = {};
    for (const key of TOGGLEABLE_FEATURE_KEYS) {
      visibility[key] = preset ? preset.visibleFeatures.includes(key) : true;
    }
    set({ role: roleId, visibility });
    await Promise.all([persistUserRole(roleId), persistVisibility(visibility)]);
  },

  resetToRolePreset: async () => {
    const role = get().role;
    if (role) await get().applyRolePreset(role);
  },
}));

/** Selector helper: number of features currently hidden. */
export function useHiddenFeatureCount(): number {
  return useFeaturesStore((s) =>
    TOGGLEABLE_FEATURE_KEYS.reduce((n, k) => (isFeatureVisible(s.visibility, k) ? n : n + 1), 0),
  );
}
