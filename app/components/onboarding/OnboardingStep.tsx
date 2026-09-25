import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import ManyAvatar from '@/components/many/ManyAvatar';
import { ACCENT_END } from '@/lib/ui/accent';
import type { OnboardingProgress } from '@/lib/onboarding/useOnboardingFlow';
import { cn } from '@/lib/utils';

interface OnboardingStepProps {
  message: string;
  children: ReactNode;
  progress: OnboardingProgress;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  canProceed?: boolean;
  /** Shows a spinner on the primary button and blocks double submits. */
  busy?: boolean;
  /** `wide` for catalogue steps (AI providers). */
  width?: 'narrow' | 'wide';
  /** Extra footer action between back and next (e.g. "Set up later"). */
  secondaryAction?: ReactNode;
}

/** Full-screen wizard frame: Many + message + progress on the left, form and footer on the right. */
export default function OnboardingStep({
  message,
  children,
  progress,
  onNext,
  onBack,
  nextLabel,
  canProceed = true,
  busy = false,
  width = 'narrow',
  secondaryAction,
}: OnboardingStepProps) {
  const { t } = useTranslation();
  const { stepIndex, totalSteps } = progress;

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      <aside
        className="hidden shrink-0 flex-col justify-between p-10 md:flex md:w-[38%] lg:w-[40%] lg:p-14"
        style={{ background: `linear-gradient(160deg, var(--primary) 0%, ${ACCENT_END} 55%, var(--background) 100%)` }}
      >
        <div className="flex flex-col gap-8">
          <ManyAvatar size="xl" />
          <p className="whitespace-pre-line text-base font-medium leading-relaxed text-primary-foreground lg:text-lg">
            {message}
          </p>
        </div>

        {totalSteps > 1 ? (
          <div
            className="flex items-center gap-2"
            role="progressbar"
            aria-label={t('onboarding.progress_label')}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={stepIndex + 1}
          >
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none',
                  i === stepIndex ? 'w-8' : 'w-2',
                  i <= stepIndex ? 'bg-primary-foreground' : 'bg-primary-foreground/35',
                )}
              />
            ))}
          </div>
        ) : null}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div className="flex shrink-0 gap-3 border-b border-border p-5 md:hidden">
          <ManyAvatar size="md" />
          <p className="flex-1 whitespace-pre-line text-sm leading-relaxed text-foreground">{message}</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-6 py-8 md:px-12 lg:px-16">
          <div className={cn('mx-auto w-full', width === 'wide' ? 'max-w-3xl' : 'max-w-md')}>{children}</div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-5 md:px-12 lg:px-16">
          <Button type="button" variant="outline" onClick={onBack} disabled={!onBack || busy} size="sm">
            {t('onboarding.back_label')}
          </Button>
          <div className="flex items-center gap-2">
            {secondaryAction}
            <Button type="button" onClick={onNext} disabled={!canProceed || !onNext || busy} size="sm">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {nextLabel ?? t('onboarding.continue')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
