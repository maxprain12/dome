/**
 * Dome edition catalog — source of truth for navigation and module visibility.
 *
 * Docs: docs/product/positioning.md, docs/product/editions.md.
 * Feature keys must match `TOGGLEABLE_FEATURE_KEYS` in featureKeys.ts.
 * `library` is always visible and never listed in `modules`.
 */

import { TOGGLEABLE_FEATURE_KEYS, isFeatureVisible } from '@/lib/features/featureKeys';

export type EditionId = 'pro' | 'study' | 'dev';

export const DEFAULT_EDITION: EditionId = 'pro';

export const EDITION_IDS: readonly EditionId[] = ['pro', 'study', 'dev'];

/** Sidebar + command-palette order. Keep in sync with UnifiedSidebar. */
export const NAV_ITEM_ORDER = [
  'library',
  'projects',
  'people',
  'email',
  'social',
  'calendar',
  'github',
  'manys',
  'pipelines',
  'learn',
  'marketplace',
] as const;

const LEGACY_ROLE_TO_EDITION: Record<string, EditionId> = {
  pro: 'pro',
  study: 'study',
  dev: 'dev',
  developer: 'dev',
  research: 'pro',
  generalist: 'pro',
};

export function resolveEditionId(raw: string | null | undefined): EditionId {
  if (!raw) return DEFAULT_EDITION;
  return LEGACY_ROLE_TO_EDITION[raw] ?? DEFAULT_EDITION;
}

/** Workspace organization only. Billing capabilities live in the account access model. */
export interface EditionPreset {
  id: EditionId;
  labelKey: string;
  descriptionKey: string;
  modules: string[];
}

export const EDITION_PRESETS: EditionPreset[] = [
  { id: 'pro', labelKey: 'roles.pro.label', descriptionKey: 'roles.pro.desc', modules: ['projects', 'people', 'email', 'social', 'manys', 'marketplace'] },
  { id: 'study', labelKey: 'roles.study.label', descriptionKey: 'roles.study.desc', modules: ['projects', 'calendar', 'learn', 'marketplace'] },
  { id: 'dev', labelKey: 'roles.dev.label', descriptionKey: 'roles.dev.desc', modules: ['projects', 'github', 'manys', 'marketplace'] },
];

export function getEdition(id: string | null | undefined): EditionPreset {
  const resolved = resolveEditionId(id);
  const found = EDITION_PRESETS.find((edition) => edition.id === resolved);
  if (found) return found;
  return EDITION_PRESETS[0];
}

export function visibilityForEdition(editionId: string | null | undefined): Record<string, boolean> {
  const edition = getEdition(editionId);
  const visibility: Record<string, boolean> = {};
  for (const key of TOGGLEABLE_FEATURE_KEYS) {
    visibility[key] = edition.modules.includes(key);
  }
  return visibility;
}

/**
 * Fill keys missing from a stored map using the edition default.
 * New modules (e.g. `people`) must not leak on for editions that omit them.
 */
export function fillMissingVisibility(
  editionId: string | null | undefined,
  visibility: Record<string, boolean>,
): Record<string, boolean> {
  if (!editionId) return visibility;
  const defaults = visibilityForEdition(editionId);
  const next = { ...visibility };
  for (const key of TOGGLEABLE_FEATURE_KEYS) {
    if (!(key in next)) next[key] = defaults[key];
  }
  return next;
}

export function visibleNavKeys(
  visibility: Record<string, boolean>,
  order: readonly string[] = NAV_ITEM_ORDER,
): string[] {
  const keys: string[] = [];
  for (const key of order) {
    if (key === 'library' || isFeatureVisible(visibility, key)) keys.push(key);
  }
  return keys;
}

export function expectedNavKeys(editionId: EditionId): string[] {
  return visibleNavKeys(visibilityForEdition(editionId));
}
