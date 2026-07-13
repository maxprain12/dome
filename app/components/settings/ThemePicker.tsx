import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ComputerIcon, MoonIcon, Sun03Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type ThemeValue = 'light' | 'dark' | 'auto';

interface ThemeOption {
  value: ThemeValue;
  labelKey: string;
  descKey: string;
  icon: IconSvgElement;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', labelKey: 'settings.appearance.light', descKey: 'settings.appearance.light_desc', icon: Sun03Icon },
  { value: 'auto', labelKey: 'settings.appearance.system', descKey: 'settings.appearance.system_desc', icon: ComputerIcon },
  { value: 'dark', labelKey: 'settings.appearance.dark', descKey: 'settings.appearance.dark_desc', icon: MoonIcon },
];

export interface ThemePickerProps {
  value: ThemeValue;
  onChange: (theme: ThemeValue) => void;
  'aria-label': string;
}

export default function ThemePicker({ value, onChange, 'aria-label': ariaLabel }: ThemePickerProps) {
  const { t } = useTranslation();

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => values[0] && onChange(values[0] as ThemeValue)}
      aria-label={ariaLabel}
      className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {THEME_OPTIONS.map((theme) => (
        <ToggleGroupItem
          key={theme.value}
          value={theme.value}
          variant="outline"
          className="h-auto min-h-24 w-full flex-col items-start justify-start gap-2 rounded-xl p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
          aria-label={t(theme.labelKey)}
        >
          <HugeiconsIcon icon={theme.icon} />
          <span className="font-medium">{t(theme.labelKey)}</span>
          <span className="whitespace-normal text-xs font-normal text-muted-foreground">{t(theme.descKey)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
