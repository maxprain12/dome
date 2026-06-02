import { useTranslation } from 'react-i18next';

interface WizardStepperProps {
  step: 0 | 1 | 2;
}

const STEPS = [
  { key: 'type', labelKey: 'learn.wizard_step_type', fallback: 'Type' },
  { key: 'sources', labelKey: 'learn.wizard_step_sources', fallback: 'Sources' },
  { key: 'configure', labelKey: 'learn.wizard_step_configure', fallback: 'Configure' },
] as const;

export default function WizardStepper({ step }: WizardStepperProps) {
  const { t } = useTranslation();

  return (
    <div className="lr-stepper" aria-label={t('learn.wizard_steps', 'Generation steps')}>
      {STEPS.map((s, index) => {
        const done = index < step;
        const active = index === step;
        const cls = `lr-step${active ? ' active' : ''}${done ? ' done' : ''}`;
        return (
          <span key={s.key} style={{ display: 'contents' }}>
            {index > 0 ? <span className="lr-stepper-line" aria-hidden /> : null}
            <span className={cls}>
              <span className="num">{index + 1}</span>
              {t(s.labelKey, s.fallback)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
