/**
 * Onboarding orchestrator.
 *
 * Runs after the wizard finishes. Applies everything the user implicitly chose
 * via their role + free-text: profile, agent soul/memory, feature visibility,
 * and recommended skills. Every step is best-effort and isolated in try/catch —
 * a failure in one (e.g. skills install needs nothing here but personality IPC
 * could be unavailable) must never block onboarding from completing.
 */

import { getRolePreset, type RoleSoulContext } from './roles';
import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { useUserStore } from '@/lib/store/useUserStore';

export interface OnboardingConfigInput {
  name: string;
  email: string;
  roleId: string;
  freeText: string;
}

/** USER.md content — identity Dome injects into the agent's context. */
function buildUserMd(ctx: RoleSoulContext, roleId: string): string {
  const focus = ctx.freeText.trim();
  return `# User

**Name:** ${ctx.name || '—'}
**Primary focus (onboarding role):** ${roleId}

## About
${focus.length > 0 ? focus : 'No additional description provided during onboarding.'}

## Notes
<!-- Many keeps long-term facts about the user here. -->
`;
}

export async function applyOnboardingConfig(input: OnboardingConfigInput): Promise<void> {
  const { name, email, roleId, freeText } = input;
  const ctx: RoleSoulContext = { name, freeText };
  const preset = getRolePreset(roleId);

  // 1) Profile (name/email) — via the user store so UI stays in sync.
  try {
    await useUserStore.getState().updateUserProfile({ name, email });
  } catch (err) {
    console.warn('[onboarding] updateUserProfile failed:', err);
  }

  // 2) Agent identity + soul.
  try {
    await window.electron?.personality?.writeFile('USER.md', buildUserMd(ctx, roleId));
  } catch (err) {
    console.warn('[onboarding] write USER.md failed:', err);
  }
  if (preset) {
    try {
      await window.electron?.personality?.writeFile('SOUL.md', preset.buildSoul(ctx));
    } catch (err) {
      console.warn('[onboarding] write SOUL.md failed:', err);
    }
    // 3) Seed long-term memory.
    try {
      await window.electron?.personality?.addMemory(preset.buildMemorySeed(ctx));
    } catch (err) {
      console.warn('[onboarding] addMemory failed:', err);
    }
  }

  // 4) Feature visibility from the role preset.
  try {
    await useFeaturesStore.getState().applyRolePreset(roleId);
  } catch (err) {
    console.warn('[onboarding] applyRolePreset failed:', err);
  }

  // 5) Recommended bundled skills (best-effort, offline, non-blocking).
  if (preset) {
    for (const skill of preset.recommendedSkills) {
      try {
        await window.electron?.invoke('skills:installBundled', skill.bundledId);
      } catch (err) {
        console.warn(`[onboarding] install skill ${skill.bundledId} failed:`, err);
      }
    }
  }

  // 6) Mark onboarding complete (keeps the user store flag in sync).
  try {
    await useUserStore.getState().completeOnboarding();
  } catch (err) {
    console.warn('[onboarding] completeOnboarding failed:', err);
  }
}
