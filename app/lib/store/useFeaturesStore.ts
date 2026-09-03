import { create } from 'zustand';
import {
  getUserRole,
  setUserRole as persistUserRole,
  getFeatureVisibility,
  setFeatureVisibility as persistVisibility,
} from '@/lib/settings';
import {
  fillMissingVisibility,
  resolveEditionId,
  visibilityForEdition,
} from '@/lib/editions/catalog';
import { TOGGLEABLE_FEATURE_KEYS, isFeatureVisible } from '@/lib/features/featureKeys';

interface FeaturesState {
  /** Active edition id (`pro` | `study` | `dev`), or null if never set. */
  role: string | null;
  /** featureKey → visible. A missing key means visible (default). */
  visibility: Record<string, boolean>;
  loaded: boolean;

  loadFeatures: () => Promise<void>;
  /** Toggle a single feature and persist. */
  setVisible: (key: string, visible: boolean) => Promise<void>;
  /** Apply an edition's default visibility + persist edition id and map. */
  applyEdition: (editionId: string) => Promise<void>;
  /** @deprecated Use applyEdition */
  applyRolePreset: (roleId: string) => Promise<void>;
  /** Re-apply the current edition's preset (used by the "reset" button). */
  resetToRolePreset: () => Promise<void>;
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  role: null,
  visibility: {},
  loaded: false,

  loadFeatures: async () => {
    const [rawRole, storedVisibility] = await Promise.all([getUserRole(), getFeatureVisibility()]);
    const role = rawRole ? resolveEditionId(rawRole) : null;
    if (rawRole && role && rawRole !== role) {
      await persistUserRole(role);
    }
    const visibility = fillMissingVisibility(role, storedVisibility || {});
    set({ role, visibility, loaded: true });
  },

  setVisible: async (key, visible) => {
    const next = { ...get().visibility, [key]: visible };
    set({ visibility: next });
    await persistVisibility(next);
  },

  applyEdition: async (editionId) => {
    const role = resolveEditionId(editionId);
    const visibility = visibilityForEdition(role);
    set({ role, visibility });
    await Promise.all([persistUserRole(role), persistVisibility(visibility)]);
  },

  applyRolePreset: async (roleId) => {
    await get().applyEdition(roleId);
  },

  resetToRolePreset: async () => {
    const role = get().role;
    if (role) await get().applyEdition(role);
  },
}));

/** Selector helper: number of features currently hidden. */
export function useHiddenFeatureCount(): number {
  return useFeaturesStore((s) =>
    TOGGLEABLE_FEATURE_KEYS.reduce((n, k) => (isFeatureVisible(s.visibility, k) ? n : n + 1), 0),
  );
}
