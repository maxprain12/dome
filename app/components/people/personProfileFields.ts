/** First-class profile keys shown as dedicated fields. Everything else stays freeform. */

export const CORE_PROFILE_KEYS = [
  'occupation',
  'company',
  'website',
  'phone',
  'location',
  'how_we_met',
] as const;

export type CoreProfileKey = (typeof CORE_PROFILE_KEYS)[number];

export function isCoreProfileKey(key: string): key is CoreProfileKey {
  return (CORE_PROFILE_KEYS as readonly string[]).includes(key);
}

export function coreProfileValue(
  profile: Record<string, unknown> | undefined,
  key: CoreProfileKey,
): string {
  const value = profile?.[key];
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

export function splitProfile(profile: Record<string, unknown> | undefined): {
  core: Record<string, unknown>;
  custom: Record<string, unknown>;
} {
  const core: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile ?? {})) {
    if (isCoreProfileKey(key)) core[key] = value;
    else custom[key] = value;
  }
  return { core, custom };
}

export function mergeProfileParts(
  core: Record<string, unknown>,
  custom: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...custom };
  for (const key of CORE_PROFILE_KEYS) {
    const value = core[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
    } else if (value != null) {
      out[key] = value;
    }
  }
  return out;
}
