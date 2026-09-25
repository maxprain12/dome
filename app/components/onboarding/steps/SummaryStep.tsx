import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PROVIDERS } from '@/lib/ai/models';
import { getRolePreset } from '@/lib/onboarding/roles';
import { applyOnboardingConfig, OnboardingApplyError, type OnboardingTask } from '@/lib/onboarding/applyOnboardingConfig';
import type { OnboardingData } from '@/lib/onboarding/flow';
import type { OnboardingProgress } from '@/lib/onboarding/useOnboardingFlow';
import OnboardingStep from '../OnboardingStep';

interface SummaryStepProps {
  progress: OnboardingProgress;
  data: OnboardingData;
  onFinished: () => void;
  onBack?: () => void;
}

/** Review what Dome will set up, then apply it. Stays open with "Retry" if an essential part fails. */
export default function SummaryStep({ progress, data, onFinished, onBack }: SummaryStepProps) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState<OnboardingTask[] | null>(null);
  const edition = getRolePreset(data.roleId);

  const finish = () => {
    setApplying(true);
    setFailed(null);
    applyOnboardingConfig({ name: data.name, email: data.email, roleId: data.roleId, freeText: data.freeText })
      .then(onFinished)
      .catch((err: unknown) => {
        console.error('[Onboarding] apply failed:', err);
        setFailed(err instanceof OnboardingApplyError ? err.failed : ['complete']);
      })
      .finally(() => setApplying(false));
  };

  const rows = [
    { label: t('onboarding.summary_name'), value: data.name || '—' },
    { label: t('onboarding.summary_edition'), value: t(edition.labelKey) },
    {
      label: t('onboarding.summary_ai'),
      value: data.aiProvider ? (PROVIDERS[data.aiProvider]?.name ?? t('onboarding.summary_ai_later')) : t('onboarding.summary_ai_later'),
    },
    {
      label: t('onboarding.summary_skills'),
      value: t('onboarding.summary_skills_value', { count: edition.recommendedSkills.length }),
    },
  ];

  return (
    <OnboardingStep
      message={t('onboarding.summary_message')}
      progress={progress}
      onNext={finish}
      onBack={applying ? undefined : onBack}
      nextLabel={failed ? t('onboarding.summary_retry') : t('onboarding.finalize')}
      busy={applying}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('onboarding.summary_title')}</h2>
        <dl className="flex flex-col divide-y rounded-xl border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 truncate text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        {failed ? (
          <Alert variant="destructive" role="alert">
            <HugeiconsIcon icon={AlertCircleIcon} aria-hidden />
            <AlertDescription className="text-xs">
              {t('onboarding.summary_error', {
                parts: failed.map((task) => t(`onboarding.summary_task.${task}`)).join(', '),
              })}
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-xs text-muted-foreground">{t('onboarding.summary_hint')}</p>
        )}
      </div>
    </OnboardingStep>
  );
}
