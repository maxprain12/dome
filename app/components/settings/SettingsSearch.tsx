import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  SETTINGS_REGISTRY,
  type SettingsSection,
} from '@/components/settings/settingsNavConfig';

interface SettingsSearchProps {
  onSectionChange: (section: SettingsSection) => void;
  hiddenSections?: ReadonlySet<SettingsSection>;
}

export default function SettingsSearch({ onSectionChange, hiddenSections }: SettingsSearchProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const entries = SETTINGS_REGISTRY.filter((entry) => !hiddenSections?.has(entry.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="w-full justify-start text-muted-foreground" />
        }
      >
        <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" />
        <span>{t('settings.search', 'Buscar ajustes')}</span>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[min(24rem,var(--available-width))] gap-0 p-0">
        <Command>
          <CommandInput placeholder={t('settings.search_placeholder', 'Buscar por nombre o función…')} />
          <CommandList>
            <CommandEmpty>{t('settings.search_empty', 'No se encontraron ajustes.')}</CommandEmpty>
            <CommandGroup heading={t('settings.title')}>
              {entries.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={[t(entry.titleKey), t(entry.groupLabelKey), ...entry.keywords, ...entry.legacyAliases].join(' ')}
                  onSelect={() => {
                    onSectionChange(entry.id);
                    setOpen(false);
                  }}
                >
                  <HugeiconsIcon icon={entry.icon} />
                  <span className="min-w-0 flex-1 truncate">{t(entry.titleKey)}</span>
                  <span className="text-xs text-muted-foreground">{t(entry.groupLabelKey)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
