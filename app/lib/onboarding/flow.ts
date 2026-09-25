/**
 * First-run wizard steps as data. The visible step list depends on what the
 * user already told us (a Dome account brings a name; permissions only exist
 * on macOS), so it is recomputed from the collected data on every move.
 */

import type { RoleId } from './roles';
import type { AIProviderType } from '@/lib/ai/models';

export type OnboardingStepId = 'account' | 'language' | 'profile' | 'edition' | 'ai' | 'permissions' | 'summary';

export interface OnboardingAccount {
  mode: 'account' | 'local';
  email?: string;
  name?: string;
  hadRemoteData?: boolean;
  alreadyOnboarded?: boolean;
}

export interface OnboardingData {
  account: OnboardingAccount | null;
  name: string;
  email: string;
  roleId: RoleId;
  freeText: string;
  /** Provider saved in the AI step; null when the user chose to set it up later. */
  aiProvider: AIProviderType | null;
}

export interface OnboardingEnv {
  domeEnabled: boolean;
  /** OS media permissions are requested by Dome (macOS). */
  managesPermissions: boolean;
}

export function accountProvidesName(account: OnboardingAccount | null): boolean {
  return account?.mode === 'account' && Boolean(account.name?.trim());
}

export function computeSteps(data: Pick<OnboardingData, 'account'>, env: OnboardingEnv): OnboardingStepId[] {
  const steps: OnboardingStepId[] = [];
  if (env.domeEnabled) steps.push('account');
  steps.push('language');
  if (!accountProvidesName(data.account)) steps.push('profile');
  steps.push('edition', 'ai');
  if (env.managesPermissions) steps.push('permissions');
  steps.push('summary');
  return steps;
}

export function nextStep(current: OnboardingStepId, steps: OnboardingStepId[]): OnboardingStepId {
  const i = steps.indexOf(current);
  return steps[Math.min(steps.length - 1, i + 1)] ?? current;
}

export function previousStep(current: OnboardingStepId, steps: OnboardingStepId[]): OnboardingStepId | null {
  const i = steps.indexOf(current);
  return i > 0 ? steps[i - 1] : null;
}
