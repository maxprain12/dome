/**
 * Applies what the user chose in the wizard: profile, agent identity
 * (USER.md / SOUL.md / memory seed), edition modules and recommended skills.
 *
 * Profile, identity and edition are essential: if any fails we throw
 * `OnboardingApplyError` and leave `onboarding_completed` unset so the summary
 * step can retry. Skills are a bonus — failures are reported, not blocking.
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

export type OnboardingTask = 'profile' | 'identity' | 'edition' | 'skills' | 'complete';

export interface OnboardingApplyResult {
  skillsInstalled: number;
  skillsFailed: number;
}

export class OnboardingApplyError extends Error {
  constructor(readonly failed: OnboardingTask[]) {
    super(`onboarding_apply_failed:${failed.join(',')}`);
    this.name = 'OnboardingApplyError';
  }
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

function assertIpcOk(result: unknown) {
  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    throw new Error((result as { error?: string }).error || 'ipc_failed');
  }
}

async function run(task: OnboardingTask, failed: OnboardingTask[], fn: () => Promise<unknown>) {
  try {
    assertIpcOk(await fn());
  } catch (err) {
    console.warn(`[onboarding] ${task} failed:`, err);
    if (!failed.includes(task)) failed.push(task);
  }
}

export async function applyOnboardingConfig(input: OnboardingConfigInput): Promise<OnboardingApplyResult> {
  const { name, email, roleId, freeText } = input;
  const editionId = resolveEditionId(roleId);
  const ctx: RoleSoulContext = { name, freeText };
  const preset = getRolePreset(editionId);
  const failed: OnboardingTask[] = [];
  const personality = globalThis.window?.electron?.personality;

  await run('profile', failed, () => useUserStore.getState().updateUserProfile({ name, email }));
  await run('identity', failed, async () => personality?.writeFile('USER.md', buildUserMd(ctx, editionId)));
  await run('identity', failed, async () => personality?.writeFile('SOUL.md', preset.buildSoul(ctx)));
  await run('identity', failed, async () => personality?.addMemory(preset.buildMemorySeed(ctx)));
  await run('edition', failed, () => useFeaturesStore.getState().applyEdition(editionId));

  let skillsFailed = 0;
  for (const skill of preset.recommendedSkills) {
    const skillFailures: OnboardingTask[] = [];
    await run('skills', skillFailures, () => globalThis.window.electron.invoke('skills:installBundled', skill.bundledId));
    if (skillFailures.length > 0) skillsFailed += 1;
  }

  if (failed.length > 0) throw new OnboardingApplyError(failed);

  await run('complete', failed, () => useUserStore.getState().completeOnboarding());
  if (failed.length > 0) throw new OnboardingApplyError(failed);

  return { skillsInstalled: preset.recommendedSkills.length - skillsFailed, skillsFailed };
}
