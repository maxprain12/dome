import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { LayoutGridIcon, RotateLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { TOGGLEABLE_FEATURES, FEATURE_GROUPS, isFeatureVisible } from '@/lib/features/featureKeys';
import { getRolePreset } from '@/lib/onboarding/roles';

export default function FeaturesSection() {
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
    <SettingsSurface
      icon={LayoutGridIcon}
      title={t('features.title')}
      description={t('features.subtitle')}
    >
      <SettingsGroup>
        <SettingsRow
          title={
            <>
              {t('features.current_role')}: <strong>{roleLabel}</strong>
            </>
          }
          description={t('features.reset_hint')}
          control={
            preset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void resetToRolePreset()}
              >
                <HugeiconsIcon icon={RotateLeft01Icon} data-icon="inline-start" />
                {t('features.reset_button')}
              </Button>
            ) : undefined
          }
        />
      </SettingsGroup>

      {FEATURE_GROUPS.map((group) => {
        const items = TOGGLEABLE_FEATURES.filter((f) => f.group === group.id);
        if (items.length === 0) return null;
        return (
          <SettingsGroup key={group.id} title={t(group.labelKey)}>
            {items.map((feature) => (
              <SettingsRow
                key={feature.key}
                title={t(feature.labelKey)}
                description={t(feature.descKey)}
                control={
                  <Switch
                    checked={isFeatureVisible(visibility, feature.key)}
                    onCheckedChange={(value) => void setVisible(feature.key, value)}
                    aria-label={t(feature.labelKey)}
                  />
                }
              />
            ))}
          </SettingsGroup>
        );
      })}
    </SettingsSurface>
  );
}
