
import { useImperativeHandle, forwardRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ManyAvatar from '@/components/many/ManyAvatar';
import DomeButton from '@/components/ui/DomeButton';

interface OnboardingStepProps {
  message: string;
  children: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  canProceed?: boolean;
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
    },
    ref
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
      <div className="p-8 flex flex-col flex-1 min-h-0">
        <div className="flex gap-4 mb-6 flex-shrink-0">
          <ManyAvatar size="lg" />
          <div
            className="flex-1 p-4 rounded-xl rounded-tl-none"
            style={{
              backgroundColor: 'var(--dome-surface)',
              border: '1px solid var(--dome-border)',
            }}
          >
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--dome-text)' }}>
              {message}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto ml-16 pr-2">{children}</div>

        <div
          className="flex items-center justify-between mt-8 pt-6 border-t flex-shrink-0"
          style={{ borderColor: 'var(--dome-border)' }}
        >
          <DomeButton
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={!onBack}
          >
            {backLabel ?? t('onboarding.back_label')}
          </DomeButton>
          <DomeButton
            type="button"
            variant="primary"
            size="sm"
            onClick={onNext}
            disabled={!canProceed || !onNext}
          >
            {nextLabel ?? t('onboarding.continue')}
          </DomeButton>
        </div>
      </div>
    );
  }
);

OnboardingStep.displayName = 'OnboardingStep';

export default OnboardingStep;
