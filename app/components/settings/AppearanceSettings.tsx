import { useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { RotateLeft01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAppStore } from '@/lib/store/useAppStore';
import SettingsPanel from '@/components/settings/SettingsPanel';
import ThemePicker from '@/components/settings/ThemePicker';
import { resetLayoutPreferences } from '@/lib/shell/layoutReset';

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const currentTheme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);
  const handleResetLayout = useCallback(() => resetLayoutPreferences(), []);

  return (
    <SettingsPanel>
      <PageHeader title={t('settings.appearance.title')} description={t('settings.appearance.subtitle')} />

      <section className="flex flex-col gap-3" aria-labelledby="appearance-theme-title">
        <h2 id="appearance-theme-title" className="text-sm font-medium">{t('settings.appearance.theme')}</h2>
        <ThemePicker aria-label={t('settings.appearance.theme')} value={currentTheme} onChange={updateTheme} />
      </section>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t('settings.appearance.reset_layout_label')}</CardTitle>
          <CardDescription>{t('settings.appearance.reset_layout_desc')}</CardDescription>
          <CardAction>
            <Button type="button" variant="secondary" size="sm" onClick={handleResetLayout}>
              <HugeiconsIcon icon={RotateLeft01Icon} data-icon="inline-start" />
              {t('settings.appearance.reset_layout_action')}
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
    </SettingsPanel>
  );
}
