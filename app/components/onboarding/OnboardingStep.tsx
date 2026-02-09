
import { useImperativeHandle, forwardRef } from 'react';
import type { ReactNode } from 'react';
import MartinAvatar from '@/components/martin/MartinAvatar';

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
      nextLabel = 'Continuar',
      backLabel = 'Atrás',
      canProceed = true,
    },
    ref
  ) => {
    useImperativeHandle(ref, () => ({
      triggerNext: () => {
        if (canProceed && onNext) {
          onNext();
        }
      },
    }));

    return (
      <div className="p-8 flex flex-col flex-1 min-h-0">
        {/* Many's message */}
        <div className="flex gap-4 mb-6 flex-shrink-0">
          <MartinAvatar size="lg" />
          <div
            className="flex-1 p-4 rounded-lg rounded-tl-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--primary-text)' }}>
              {message}
            </p>
          </div>
        </div>

        {/* Step content - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto ml-16 pr-2">{children}</div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onBack}
            disabled={!onBack}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: onBack ? 'var(--bg-secondary)' : 'transparent',
              color: 'var(--primary-text)',
              border: onBack ? '1px solid var(--border)' : 'none',
            }}
          >
            {backLabel}
          </button>
          <button
            onClick={onNext}
            disabled={!canProceed || !onNext}
            className="px-6 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: canProceed && onNext ? 'var(--accent)' : 'var(--bg-secondary)',
            }}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    );
  }
);

OnboardingStep.displayName = 'OnboardingStep';

export default OnboardingStep;
