import { HugeiconsIcon } from '@hugeicons/react';
import {
  RotateLeft01Icon as RotateCcw,
} from '@hugeicons/core-free-icons';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { TOGGLEABLE_FEATURES, FEATURE_GROUPS, isFeatureVisible } from '@/lib/features/featureKeys';
import { getRolePreset } from '@/lib/onboarding/roles';
import SubpageHeader from '@/components/shared/SubpageHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';

import { Switch } from '@/components/ui/switch';
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
      <SubpageHeader className={"rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 mb-2"}>
  <SubpageHeader.Title>{t('features.title')}</SubpageHeader.Title>
  <SubpageHeader.Subtitle>{t('features.subtitle')}</SubpageHeader.Subtitle>
</SubpageHeader>

      <div
        className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            {t('features.current_role')}: <strong>{roleLabel}</strong>
          </p>
          <p className="text-[11px] mt-0.5 text-muted-foreground">
            {t('features.reset_hint')}
          </p>
        </div>
        {preset && (
          <Button type="button"
  variant="outline"
  onClick={() => void resetToRolePreset()}
  className="shrink-0 flex items-center gap-2"
  size="sm">
            <HugeiconsIcon icon={RotateCcw} className="size-3.5 mr-1.5" />
            {t('features.reset_button')}
          </Button>
        )}
      </div>

      {FEATURE_GROUPS.map((group) => {
        const items = TOGGLEABLE_FEATURES.filter((f) => f.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ">
              {t(group.labelKey)}
            </p>
            <div className="flex flex-col gap-2">
              {items.map((feature) => (
                <div
                  key={feature.key}
                  className="flex items-start justify-between gap-4 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {t(feature.labelKey)}
                    </p>
                    <p className="text-[11px] mt-0.5 text-muted-foreground">
                      {t(feature.descKey)}
                    </p>
                  </div>
                  <Switch checked={isFeatureVisible(visibility, feature.key)} onCheckedChange={(value) => void setVisible(feature.key, value)} size="sm" className="shrink-0" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </SettingsPanel>
  );
}
