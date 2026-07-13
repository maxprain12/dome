import type { ReactNode } from 'react';
import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import SettingsNavDropdown from '@/components/settings/SettingsNavDropdown';
import SettingsSearch from '@/components/settings/SettingsSearch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  NAV_GROUPS,
  filterNavGroups,
  getGroupItems,
  type SettingsSection,
} from '@/components/settings/settingsNavConfig';

export type { SettingsSection } from '@/components/settings/settingsNavConfig';

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  hiddenSections?: ReadonlySet<SettingsSection>;
  children: ReactNode;
}

function SettingsNavItem({
  id,
  icon,
  isActive,
  label,
  onSelect,
}: {
  id: SettingsSection;
  icon: IconSvgElement;
  isActive: boolean;
  label: string;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <Button
      type="button"
      variant={isActive ? 'secondary' : 'ghost'}
      title={label}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onSelect(id)}
      className="w-full justify-start"
      size="sm"
    >
      <HugeiconsIcon icon={icon} data-icon="inline-start" />
      <span className="truncate">{label}</span>
    </Button>
  );
}

export default function SettingsLayout({ activeSection, onSectionChange, hiddenSections, children }: SettingsLayoutProps) {
  const { t } = useTranslation();
  const navGroups = hiddenSections?.size
    ? filterNavGroups(NAV_GROUPS, hiddenSections)
    : NAV_GROUPS;

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-border bg-card md:flex" aria-label={t('settings.title')}>
        <div className="shrink-0 px-4 pb-3 pt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t('settings.title')}
          </p>
          <div className="mt-3">
            <SettingsSearch onSectionChange={onSectionChange} hiddenSections={hiddenSections} />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-5 px-2 pb-5" aria-label={t('settings.nav.sidebar')}>
          {navGroups.map((group) => {
            const runs = getGroupItems(group);
            return (
              <div key={group.labelKey} className="flex flex-col gap-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t(group.labelKey)}</p>

                {runs.map((run, runIndex) => (
                  <div key={`${group.labelKey}-${runIndex}`} className="flex flex-col gap-0.5">
                    {run.map(({ id, icon }) => (
                      <SettingsNavItem
                        key={id}
                        id={id}
                        icon={icon}
                        isActive={activeSection === id || (activeSection === 'transcription' && id === 'ai')}
                        label={t(`settings.tabs.${id}`)}
                        onSelect={onSectionChange}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </nav>
        </ScrollArea>
      </aside>

      <main className="min-h-0 min-w-0 overflow-y-auto bg-background">
        <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background/95 p-3 backdrop-blur md:hidden">
          <SettingsNavDropdown activeSection={activeSection} onSectionChange={onSectionChange} hiddenSections={hiddenSections} />
          <SettingsSearch onSectionChange={onSectionChange} hiddenSections={hiddenSections} />
        </div>
        <div className="mx-auto w-full max-w-3xl p-5 pb-20 md:p-8 md:pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}
