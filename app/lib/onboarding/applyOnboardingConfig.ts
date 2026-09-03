/**
 * Onboarding orchestrator.
 *
 * Runs after the wizard finishes. Applies everything the user implicitly chose
 * via their edition + free-text: profile, agent soul/memory, feature visibility,
 * and recommended skills. Every step is best-effort and isolated in try/catch —
 * a failure in one (e.g. skills install needs nothing here but personality IPC
 * could be unavailable) must never block onboarding from completing.
 */

import { getRolePreset, resolveEditionId, type RoleSoulContext } from './roles';
import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { useUserStore } from '@/lib/store/useUserStore';

export interface OnboardingConfigInput {
  name: string;
  email: string;
  roleId: string;
  freeText: string;
}

/** USER.md content — identity Dome injects into the agent's context. */
function buildUserMd(ctx: RoleSoulContext, editionId: string): string {
  const focus = ctx.freeText.trim();
  return `# User

**Name:** ${ctx.name || '—'}
**Dome edition:** ${editionId}

## About
${focus.length > 0 ? focus : 'No additional description provided during onboarding.'}

## Notes
<!-- Many keeps long-term facts about the user here. -->
`;
}

export async function applyOnboardingConfig(input: OnboardingConfigInput): Promise<void> {
  const { name, email, roleId, freeText } = input;
  const editionId = resolveEditionId(roleId);
  const ctx: RoleSoulContext = { name, freeText };
  const preset = getRolePreset(editionId);

  try {
    await useUserStore.getState().updateUserProfile({ name, email });
  } catch (err) {
    console.warn('[onboarding] updateUserProfile failed:', err);
  }

  try {
    await window.electron?.personality?.writeFile('USER.md', buildUserMd(ctx, editionId));
  } catch (err) {
    console.warn('[onboarding] write USER.md failed:', err);
  }
  try {
    await window.electron?.personality?.writeFile('SOUL.md', preset.buildSoul(ctx));
  } catch (err) {
    console.warn('[onboarding] write SOUL.md failed:', err);
  }
  try {
    await window.electron?.personality?.addMemory(preset.buildMemorySeed(ctx));
  } catch (err) {
    console.warn('[onboarding] addMemory failed:', err);
  }

  try {
    await useFeaturesStore.getState().applyEdition(editionId);
  } catch (err) {
    console.warn('[onboarding] applyEdition failed:', err);
  }

  for (const skill of preset.recommendedSkills) {
    try {
      await window.electron?.invoke('skills:installBundled', skill.bundledId);
    } catch (err) {
      console.warn(`[onboarding] install skill ${skill.bundledId} failed:`, err);
    }
  }

  try {
    await useUserStore.getState().completeOnboarding();
  } catch (err) {
    console.warn('[onboarding] completeOnboarding failed:', err);
  }
}
