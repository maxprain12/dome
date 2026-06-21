
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ROLE_PRESETS, type RoleId } from '@/lib/onboarding/roles';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';

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
              className="flex flex-col items-start gap-1 rounded-xl p-3 text-left transition-all"
              style={{
                background: selected ? 'var(--dome-accent-subtle, rgba(101,93,197,0.12))' : 'var(--dome-surface)',
                border: `1px solid ${selected ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-border-hover, var(--dome-accent))';
              }}
              onMouseLeave={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-border)';
              }}
            >
              <span className="text-xl leading-none select-none" aria-hidden>{role.emoji}</span>
              <span className="font-semibold text-sm" style={{ color: 'var(--dome-text)' }}>
                {t(role.labelKey)}
              </span>
              <span className="text-xs leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                {t(role.descriptionKey)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <DomeSectionLabel>{t('onboarding.role_about_label')}</DomeSectionLabel>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder={t('onboarding.role_about_placeholder')}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors"
          style={{
            background: 'var(--dome-bg-hover)',
            border: '1px solid var(--dome-border)',
            color: 'var(--dome-text)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--dome-accent)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--dome-border)'; }}
        />
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          {t('onboarding.role_about_hint')}
        </p>
      </div>
    </div>
  );
}
