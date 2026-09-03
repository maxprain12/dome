/**
 * Compatibility layer: onboarding still talks about a "role".
 * Editions (`app/lib/editions/catalog.ts`) are the source of truth.
 */

export type {
  EditionId as RoleId,
  EditionPreset as RolePreset,
  EditionSoulContext as RoleSoulContext,
  RecommendedSkill,
} from '@/lib/editions/catalog';

export {
  DEFAULT_EDITION,
  EDITION_PRESETS as ROLE_PRESETS,
  getEdition as getRolePreset,
  resolveEditionId,
} from '@/lib/editions/catalog';
