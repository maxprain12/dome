import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, Menu01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  NAV_GROUPS,
  filterNavGroups,
  findNavItem,
  getGroupItems,
  normalizeNavSection,
  type SettingsSection,
} from '@/components/settings/settingsNavConfig';

interface SettingsNavDropdownProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  hiddenSections?: ReadonlySet<SettingsSection>;
}

export default function SettingsNavDropdown({ activeSection, onSectionChange, hiddenSections }: SettingsNavDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const groups = hiddenSections?.size ? filterNavGroups(NAV_GROUPS, hiddenSections) : NAV_GROUPS;
  const normalizedActive = normalizeNavSection(activeSection);
  const activeItem = findNavItem(activeSection);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" size="sm" className="w-full justify-start" />}>
        <HugeiconsIcon icon={Menu01Icon} data-icon="inline-start" />
        {activeItem ? <HugeiconsIcon icon={activeItem.icon} /> : null}
        <span className="truncate">{t(`settings.tabs.${normalizedActive}`)}</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(88vw,22rem)] p-0" showCloseButton>
        <SheetHeader className="border-b">
          <SheetTitle>{t('settings.title')}</SheetTitle>
          <SheetDescription>{t('settings.nav.select_section')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="flex flex-col gap-5 p-3" aria-label={t('settings.nav.sidebar')}>
            {groups.map((group) => (
              <section key={group.labelKey} className="flex flex-col gap-1">
                <h2 className="px-2 text-xs font-medium text-muted-foreground">{t(group.labelKey)}</h2>
                {getGroupItems(group).flat().map(({ id, icon }) => {
                  const active = normalizedActive === id;
                  return (
                    <Button
                      key={id}
                      type="button"
                      variant={active ? 'secondary' : 'ghost'}
                      className="w-full justify-start"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        onSectionChange(id);
                        setOpen(false);
                      }}
                    >
                      <HugeiconsIcon icon={icon} data-icon="inline-start" />
                      <span className="min-w-0 flex-1 truncate text-left">{t(`settings.tabs.${id}`)}</span>
                      {active ? <HugeiconsIcon icon={CheckmarkCircle02Icon} data-icon="inline-end" /> : null}
                    </Button>
                  );
                })}
              </section>
            ))}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
