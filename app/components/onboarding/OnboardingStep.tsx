
import { useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ManyAvatar from '@/components/many/ManyAvatar';
import { ACCENT_END } from '@/lib/ui/accent';

interface OnboardingStepProps {
  message: string;
  children: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  canProceed?: boolean;
  stepIndex?: number;
  totalSteps?: number;
}

export interface OnboardingStepRef {
  triggerNext: () => void;
}

const OnboardingStep = forwardRef<OnboardingStepRef, OnboardingStepProps>(
  (
    {
      message,
      children,
      onNext,
      onBack,
      nextLabel,
      backLabel,
      canProceed = true,
      stepIndex = 0,
      totalSteps = 1,
    },
    ref,
  ) => {
    const { t } = useTranslation();

    useImperativeHandle(ref, () => ({
      triggerNext: () => {
        if (canProceed && onNext) {
          onNext();
        }
      },
    }));

    return (
      <div className="flex flex-1 min-h-0 h-full w-full">
        {/* Brand panel — hidden on narrow viewports */}
        <aside
          className="hidden md:flex md:w-[42%] lg:w-[45%] flex-col justify-between p-10 lg:p-14 shrink-0"
          style={{
            background: `linear-gradient(160deg, var(--primary) 0%, ${ACCENT_END} 55%, var(--background) 100%)`,
          }}
        >
          <div className="flex flex-col gap-8">
            <ManyAvatar size="xl" />
            <p
              className="text-base lg:text-lg leading-relaxed whitespace-pre-line font-medium text-primary-foreground"
            >
              {message}
            </p>
          </div>

          {totalSteps > 1 ? (
            <div className="flex items-center gap-2" aria-label={t('onboarding.progress_label')}>
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                  style={{
                    width: i === stepIndex ? '2rem' : '0.5rem',
                    backgroundColor:
                      i <= stepIndex ? 'var(--primary-foreground)' : 'rgba(255,255,255,0.35)',
                    opacity: i <= stepIndex ? 1 : 0.6,
                  }}
                />
              ))}
            </div>
          ) : null}
        </aside>

        {/* Content panel */}
        <div
          className="flex flex-col flex-1 min-h-0 min-w-0 bg-background"
        >
          {/* Mobile header */}
          <div
            className="md:hidden flex gap-3 p-5 border-b shrink-0 border-border"
          >
            <ManyAvatar size="md" />
            <p
              className="flex-1 text-sm leading-relaxed whitespace-pre-line text-foreground"
            >
              {message}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center px-6 py-8 md:px-12 lg:px-16">
            <div className="w-full max-w-md mx-auto">{children}</div>
          </div>

          <div
            className="flex items-center justify-between px-6 py-5 md:px-12 lg:px-16 border-t shrink-0 border-border"
          >
            <Button type="button" variant="outline" onClick={onBack} disabled={!onBack} size="sm">
              {backLabel ?? t('onboarding.back_label')}
            </Button>
            <Button type="button" onClick={onNext} disabled={!canProceed || !onNext} size="sm">
              {nextLabel ?? t('onboarding.continue')}
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

OnboardingStep.displayName = 'OnboardingStep';

export default OnboardingStep;
