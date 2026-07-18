
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ROLE_PRESETS, type RoleId } from '@/lib/onboarding/roles';
interface RoleStepProps {
  initialRoleId?: RoleId | null;
  initialFreeText?: string;
  onComplete: (data: { roleId: RoleId; freeText: string }) => void;
  onValidationChange?: (isValid: boolean) => void;
}

export default function RoleStep({
  initialRoleId = null,
  initialFreeText = '',
  onComplete,
  onValidationChange,
}: RoleStepProps) {
  const { t } = useTranslation();
  const [roleId, setRoleId] = useState<RoleId | null>(initialRoleId);
  const [freeText, setFreeText] = useState(initialFreeText);

  const canProceed = roleId !== null;

  const handleNextRef = useRef<() => void>(() => {});
  const handleNext = useCallback(() => {
    if (!roleId) return;
    onComplete({ roleId, freeText: freeText.trim() });
  }, [roleId, freeText, onComplete]);
  handleNextRef.current = handleNext;

  useEffect(() => {
    onValidationChange?.(canProceed);
  }, [canProceed, onValidationChange]);

  useEffect(() => {
    const handler = () => handleNextRef.current();
    window.addEventListener('onboarding:role-validate', handler);
    return () => window.removeEventListener('onboarding:role-validate', handler);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5">
        {ROLE_PRESETS.map((role) => {
          const selected = roleId === role.id;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => setRoleId(role.id)}
              className="flex flex-col items-start gap-1 rounded-xl p-3 text-left transition-[color,background-color,border-color,box-shadow,opacity,transform]"
              style={{
                background: selected ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--card)',
                border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ring, var(--primary))';
              }}
              onMouseLeave={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              }}
            >
              <span className="text-xl leading-none select-none" aria-hidden>{role.emoji}</span>
              <span className="font-semibold text-sm text-foreground">
                {t(role.labelKey)}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {t(role.descriptionKey)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('onboarding.role_about_label')}</p>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder={t('onboarding.role_about_placeholder')}
          aria-label={t('onboarding.role_about_label')}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors"
          style={{
            background: 'var(--accent)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        />
        <p className="text-xs text-muted-foreground">
          {t('onboarding.role_about_hint')}
        </p>
      </div>
    </div>
  );
}
