import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_EDITION } from './roles';
import {
  computeSteps,
  nextStep,
  previousStep,
  type OnboardingData,
  type OnboardingEnv,
  type OnboardingStepId,
} from './flow';

export interface OnboardingProgress {
  stepIndex: number;
  totalSteps: number;
}

export interface UseOnboardingFlow {
  step: OnboardingStepId;
  data: OnboardingData;
  progress: OnboardingProgress;
  update: (patch: Partial<OnboardingData>) => void;
  /** Merge `patch` and move forward (the step list is recomputed with the new data). */
  next: (patch?: Partial<OnboardingData>) => void;
  back: (() => void) | undefined;
}

interface FlowState {
  step: OnboardingStepId;
  data: OnboardingData;
}

function withAccountIdentity(data: OnboardingData): OnboardingData {
  if (data.account?.mode !== 'account') return data;
  return {
    ...data,
    name: data.name || data.account.name?.trim() || '',
    email: data.email || data.account.email?.trim() || '',
  };
}

export function useOnboardingFlow(
  env: OnboardingEnv,
  initial: { name?: string; email?: string } = {},
): UseOnboardingFlow {
  const [state, setState] = useState<FlowState>(() => ({
    step: computeSteps({ account: null }, env)[0],
    data: {
      account: null,
      name: initial.name ?? '',
      email: initial.email ?? '',
      roleId: DEFAULT_EDITION,
      freeText: '',
      aiProvider: null,
    },
  }));

  const steps = useMemo(() => computeSteps(state.data, env), [state.data, env]);

  const update = useCallback((patch: Partial<OnboardingData>) => {
    setState((prev) => ({ ...prev, data: { ...prev.data, ...patch } }));
  }, []);

  const next = useCallback((patch: Partial<OnboardingData> = {}) => {
    setState((prev) => {
      const data = withAccountIdentity({ ...prev.data, ...patch });
      return { data, step: nextStep(prev.step, computeSteps(data, env)) };
    });
  }, [env]);

  const previous = previousStep(state.step, steps);
  const back = useMemo(
    () => (previous ? () => setState((prev) => ({ ...prev, step: previous })) : undefined),
    [previous],
  );

  const progress = useMemo(
    () => ({ stepIndex: Math.max(0, steps.indexOf(state.step)), totalSteps: steps.length }),
    [steps, state.step],
  );

  return { step: state.step, data: state.data, progress, update, next, back };
}
