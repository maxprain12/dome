import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { LayoutGridIcon, RotateLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { TOGGLEABLE_FEATURES, FEATURE_GROUPS, isFeatureVisible } from '@/lib/features/featureKeys';
import { EDITION_PRESETS, getEdition, resolveEditionId } from '@/lib/editions/catalog';

export default function FeaturesSection() {
  const { t } = useTranslation();
  const role = useFeaturesStore((s) => s.role);
  const visibility = useFeaturesStore((s) => s.visibility);
  const loaded = useFeaturesStore((s) => s.loaded);
  const loadFeatures = useFeaturesStore((s) => s.loadFeatures);
  const setVisible = useFeaturesStore((s) => s.setVisible);
  const applyEdition = useFeaturesStore((s) => s.applyEdition);
  const resetToRolePreset = useFeaturesStore((s) => s.resetToRolePreset);

  useEffect(() => {
    if (!loaded) void loadFeatures();
  }, [loaded, loadFeatures]);

  const editionId = role ? resolveEditionId(role) : null;
  const preset = editionId ? getEdition(editionId) : null;
  const editionLabel = preset ? t(preset.labelKey) : t('features.no_role');

  return (
    <SettingsSurface
      icon={LayoutGridIcon}
      title={t('features.title')}
      description={t('features.subtitle')}
    >
      <SettingsGroup>
        <SettingsRow
          title={t('features.current_role')}
          description={t('features.switch_hint')}
          control={
            <Select
              value={editionId ?? undefined}
              onValueChange={(value) => {
                if (!value) return;
                applyEdition(value).catch(() => {});
              }}
            >
              <SelectTrigger className="w-44" size="sm" aria-label={t('features.current_role')}>
                <SelectValue>{editionLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {EDITION_PRESETS.map((edition) => (
                    <SelectItem key={edition.id} value={edition.id}>
                      {t(edition.labelKey)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          title={t('features.reset_hint')}
          control={
            preset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  resetToRolePreset().catch(() => {});
                }}
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
                    onCheckedChange={(value) => {
                      setVisible(feature.key, value).catch(() => {});
                    }}
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
