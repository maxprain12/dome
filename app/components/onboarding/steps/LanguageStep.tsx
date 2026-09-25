import { useTranslation } from 'react-i18next';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import type { OnboardingProgress } from '@/lib/onboarding/useOnboardingFlow';
import OnboardingStep from '../OnboardingStep';

interface LanguageStepProps {
  progress: OnboardingProgress;
  onNext: () => void;
  onBack?: () => void;
}

/** Welcome + language: everything after this step is shown in the chosen language. */
export default function LanguageStep({ progress, onNext, onBack }: LanguageStepProps) {
  const { t, i18n } = useTranslation();
  const current =
    SUPPORTED_LANGUAGES.find((lang) => i18n.language === lang || i18n.language.startsWith(`${lang}-`)) ?? 'es';

  return (
    <OnboardingStep
      message={t('onboarding.welcome_message')}
      progress={progress}
      onNext={onNext}
      onBack={onBack}
      nextLabel={t('onboarding.start')}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t('onboarding.language_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('onboarding.language_subtitle')}</p>
        </div>
        <div role="radiogroup" aria-label={t('onboarding.language_title')} className="grid grid-cols-2 gap-2">
          {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => {
            const selected = lang === current;
            return (
              <button
                key={lang}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => changeLanguage(lang)}
                className={selectionSurfaceClass(selected, 'flex flex-col items-start gap-0.5 border-border p-3 text-left')}
              >
                <span className="text-sm font-medium">{t(`onboarding.language_native.${lang}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`settings.language.languages.${lang}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </OnboardingStep>
  );
}
