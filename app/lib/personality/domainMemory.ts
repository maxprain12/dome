/** Which domain LTM packs to inject for a Many/agent turn. */

export type MemoryDomainId = 'social' | 'email';

/**
 * Prefer active shell surface; also enable when related tools are in the run.
 */
export function resolveMemoryDomains(options: {
  shellTabType?: string | null;
  toolNames?: string[];
}): MemoryDomainId[] {
  const out = new Set<MemoryDomainId>();
  const tab = String(options.shellTabType || '').toLowerCase();
  if (tab === 'social') out.add('social');
  if (tab === 'email') out.add('email');

  for (const raw of options.toolNames || []) {
    const name = String(raw || '').toLowerCase();
    if (name.startsWith('social_') || name.includes('social_post') || name.includes('instagram') || name.includes('linkedin')) {
      out.add('social');
    }
    if (name.startsWith('email_')) {
      out.add('email');
    }
  }

  return [...out];
}
