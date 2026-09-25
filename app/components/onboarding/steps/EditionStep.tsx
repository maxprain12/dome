import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { ROLE_PRESETS, type RoleId } from '@/lib/onboarding/roles';
import type { OnboardingProgress } from '@/lib/onboarding/useOnboardingFlow';
import OnboardingStep from '../OnboardingStep';

interface EditionStepProps {
  progress: OnboardingProgress;
  initialRoleId: RoleId;
  initialFreeText: string;
  onNext: (data: { roleId: RoleId; freeText: string }) => void;
  onBack?: () => void;
}

/** Edition (Pro / Study / Dev) decides visible modules and Many's persona; free text seeds its memory. */
export default function EditionStep({ progress, initialRoleId, initialFreeText, onNext, onBack }: EditionStepProps) {
  const { t } = useTranslation();
  const [roleId, setRoleId] = useState<RoleId>(initialRoleId);
  const [freeText, setFreeText] = useState(initialFreeText);

  return (
    <OnboardingStep
      message={t('onboarding.role_message')}
      progress={progress}
      onNext={() => onNext({ roleId, freeText: freeText.trim() })}
      onBack={onBack}
    >
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label={t('onboarding.role_message')} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {ROLE_PRESETS.map((role) => {
            const selected = roleId === role.id;
            return (
              <button
                key={role.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRoleId(role.id)}
                className={selectionSurfaceClass(selected, 'flex flex-col items-start gap-1 border-border p-3 text-left')}
              >
                <span className="text-sm font-semibold text-foreground">{t(role.labelKey)}</span>
                <span className="text-xs leading-snug text-muted-foreground">{t(role.descriptionKey)}</span>
              </button>
            );
          })}
        </div>

        <Field>
          <FieldLabel htmlFor="onboarding-about">{t('onboarding.role_about_label')}</FieldLabel>
          <Textarea
            id="onboarding-about"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={t('onboarding.role_about_placeholder')}
            rows={3}
            className="resize-none"
          />
          <FieldDescription>{t('onboarding.role_about_hint')}</FieldDescription>
        </Field>
      </div>
    </OnboardingStep>
  );
}
