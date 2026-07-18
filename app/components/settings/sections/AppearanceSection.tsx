import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ComputerIcon,
  MoonIcon,
  PaintBoardIcon,
  RotateLeft01Icon,
  Sun03Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { useAppStore } from '@/lib/store/useAppStore';
import { resetLayoutPreferences } from '@/lib/shell/layoutReset';

type ThemeValue = 'light' | 'dark' | 'auto';

const THEME_OPTIONS: Array<{
  value: ThemeValue;
  labelKey: string;
  descKey: string;
  icon: IconSvgElement;
}> = [
  { value: 'light', labelKey: 'settings.appearance.light', descKey: 'settings.appearance.light_desc', icon: Sun03Icon },
  { value: 'auto', labelKey: 'settings.appearance.system', descKey: 'settings.appearance.system_desc', icon: ComputerIcon },
  { value: 'dark', labelKey: 'settings.appearance.dark', descKey: 'settings.appearance.dark_desc', icon: MoonIcon },
];

export default function AppearanceSection() {
  const { t } = useTranslation();
  const currentTheme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);
  const handleResetLayout = useCallback(() => resetLayoutPreferences(), []);

  return (
    <SettingsSurface
      icon={PaintBoardIcon}
      title={t('settings.appearance.title')}
      description={t('settings.appearance.subtitle')}
    >
      <SettingsGroup title={t('settings.appearance.theme')} bare>
        <ToggleGroup
          value={[currentTheme]}
          onValueChange={(values) => values[0] && updateTheme(values[0] as ThemeValue)}
          aria-label={t('settings.appearance.theme')}
          className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {THEME_OPTIONS.map((theme) => (
            <ToggleGroupItem
              key={theme.value}
              value={theme.value}
              variant="outline"
              aria-label={t(theme.labelKey)}
              className="h-auto min-h-24 w-full flex-col items-start justify-start gap-2 rounded-xl p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
            >
              <HugeiconsIcon icon={theme.icon} />
              <span className="font-medium">{t(theme.labelKey)}</span>
              <span className="whitespace-normal text-xs font-normal text-muted-foreground">
                {t(theme.descKey)}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          title={t('settings.appearance.reset_layout_label')}
          description={t('settings.appearance.reset_layout_desc')}
          control={
            <Button type="button" variant="outline" size="sm" onClick={handleResetLayout}>
              <HugeiconsIcon icon={RotateLeft01Icon} data-icon="inline-start" />
              {t('settings.appearance.reset_layout_action')}
            </Button>
          }
        />
      </SettingsGroup>
    </SettingsSurface>
  );
}
