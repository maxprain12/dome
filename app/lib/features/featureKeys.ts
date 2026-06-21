/**
 * Toggleable features registry.
 *
 * Each `key` matches a nav-item `key` in `UnifiedSidebar.tsx`
 * (`primaryUnifiedNavItems` / `secondaryUnifiedNavItems`). The onboarding role
 * presets and the Settings → Features panel both operate on these keys.
 *
 * `library` (Home/workspace) is intentionally NOT toggleable — it is always
 * visible so the user always has a way back to their resources and to Settings.
 */

export type FeatureGroupId = 'workspace' | 'automation' | 'study' | 'extensions';

export interface FeatureDef {
  /** Stable key — must match the sidebar nav-item key. */
  key: string;
  /** i18n key for the feature label. */
  labelKey: string;
  /** i18n key for a short description. */
  descKey: string;
  /** Grouping used by the Settings → Features panel. */
  group: FeatureGroupId;
}

export const TOGGLEABLE_FEATURES: FeatureDef[] = [
  { key: 'projects', labelKey: 'features.items.projects.label', descKey: 'features.items.projects.desc', group: 'workspace' },
  { key: 'calendar', labelKey: 'features.items.calendar.label', descKey: 'features.items.calendar.desc', group: 'workspace' },
  { key: 'email', labelKey: 'features.items.email.label', descKey: 'features.items.email.desc', group: 'workspace' },
  { key: 'tags', labelKey: 'features.items.tags.label', descKey: 'features.items.tags.desc', group: 'workspace' },
  { key: 'github', labelKey: 'features.items.github.label', descKey: 'features.items.github.desc', group: 'automation' },
  { key: 'agents', labelKey: 'features.items.agents.label', descKey: 'features.items.agents.desc', group: 'automation' },
  { key: 'workflows', labelKey: 'features.items.workflows.label', descKey: 'features.items.workflows.desc', group: 'automation' },
  { key: 'automations', labelKey: 'features.items.automations.label', descKey: 'features.items.automations.desc', group: 'automation' },
  { key: 'runs', labelKey: 'features.items.runs.label', descKey: 'features.items.runs.desc', group: 'automation' },
  { key: 'learn', labelKey: 'features.items.learn.label', descKey: 'features.items.learn.desc', group: 'study' },
  { key: 'marketplace', labelKey: 'features.items.marketplace.label', descKey: 'features.items.marketplace.desc', group: 'extensions' },
];

export const TOGGLEABLE_FEATURE_KEYS: string[] = TOGGLEABLE_FEATURES.map((f) => f.key);

export const FEATURE_GROUPS: { id: FeatureGroupId; labelKey: string }[] = [
  { id: 'workspace', labelKey: 'features.groups.workspace' },
  { id: 'automation', labelKey: 'features.groups.automation' },
  { id: 'study', labelKey: 'features.groups.study' },
  { id: 'extensions', labelKey: 'features.groups.extensions' },
];

/** A feature is visible unless explicitly set to `false` in the map. */
export function isFeatureVisible(visibility: Record<string, boolean>, key: string): boolean {
  return visibility[key] !== false;
}
