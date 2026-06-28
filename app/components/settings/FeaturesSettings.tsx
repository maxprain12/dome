
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { TOGGLEABLE_FEATURES, FEATURE_GROUPS, isFeatureVisible } from '@/lib/features/featureKeys';
import { getRolePreset } from '@/lib/onboarding/roles';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeButton from '@/components/ui/DomeButton';
import SettingsPanel from '@/components/settings/SettingsPanel';

export default function FeaturesSettings() {
  const { t } = useTranslation();
  const role = useFeaturesStore((s) => s.role);
  const visibility = useFeaturesStore((s) => s.visibility);
  const loaded = useFeaturesStore((s) => s.loaded);
  const loadFeatures = useFeaturesStore((s) => s.loadFeatures);
  const setVisible = useFeaturesStore((s) => s.setVisible);
  const resetToRolePreset = useFeaturesStore((s) => s.resetToRolePreset);

  useEffect(() => {
    if (!loaded) void loadFeatures();
  }, [loaded, loadFeatures]);

  const preset = getRolePreset(role);
  const roleLabel = preset ? t(preset.labelKey) : t('features.no_role');

  return (
    <SettingsPanel>
      <DomeSubpageHeader className={"rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"}>
  <DomeSubpageHeader.Title>{t('features.title')}</DomeSubpageHeader.Title>
  <DomeSubpageHeader.Subtitle>{t('features.subtitle')}</DomeSubpageHeader.Subtitle>
</DomeSubpageHeader>

      <div
        className="settings-split-row rounded-xl px-4 py-3"
        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
            {t('features.current_role')}: <strong>{roleLabel}</strong>
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
            {t('features.reset_hint')}
          </p>
        </div>
        {preset && (
          <DomeButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void resetToRolePreset()}
            className="shrink-0 settings-split-row__actions"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            {t('features.reset_button')}
          </DomeButton>
        )}
      </div>

      {FEATURE_GROUPS.map((group) => {
        const items = TOGGLEABLE_FEATURES.filter((f) => f.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id}>
            <DomeSectionLabel className="settings-section-label">
              {t(group.labelKey)}
            </DomeSectionLabel>
            <div className="flex flex-col gap-2">
              {items.map((feature) => (
                <div
                  key={feature.key}
                  className="settings-toggle-row rounded-lg px-4 py-3"
                  style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
                >
                  <div className="settings-toggle-row__label">
                    <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      {t(feature.labelKey)}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                      {t(feature.descKey)}
                    </p>
                  </div>
                  <DomeToggle
                    checked={isFeatureVisible(visibility, feature.key)}
                    onChange={(value) => void setVisible(feature.key, value)}
                    size="sm"
                    className="settings-toggle-row__control"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </SettingsPanel>
  );
}
