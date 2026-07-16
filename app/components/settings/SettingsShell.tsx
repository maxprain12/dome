import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SETTINGS_GROUPS,
  filterSettingsGroups,
  resolveSettingsSection,
  type SettingsSection,
} from './registry';
import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import { useResizeStore } from '@/lib/store/useResizeStore';

interface SettingsShellProps {
  children: ReactNode;
}

/**
 * Settings content frame. Section navigation lives in the shell left slot
 * (`SettingsNav`); this component only hosts the active section and a Select
 * fallback when the left sidebar is collapsed.
 */
export default function SettingsShell({ children }: SettingsShellProps) {
  const { t } = useTranslation();
  const activeSection = useSettingsUiStore((s) => s.activeSection);
  const setActiveSection = useSettingsUiStore((s) => s.setActiveSection);
  const hiddenSections = useSettingsUiStore((s) => s.hiddenSections);
  const leftSidebarCollapsed = useResizeStore((s) => s.leftSidebarCollapsed);

  const groups = useMemo(
    () => filterSettingsGroups(SETTINGS_GROUPS, hiddenSections),
    [hiddenSections],
  );

  const normalizedActive = resolveSettingsSection(activeSection);

  const selectSection = (section: SettingsSection) => {
    setActiveSection(section);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {leftSidebarCollapsed ? (
        <div className="sticky top-0 z-10 shrink-0 border-b bg-background/95 p-3 backdrop-blur">
          <Select
            value={normalizedActive}
            onValueChange={(value) => value && selectSection(value as SettingsSection)}
          >
            <SelectTrigger className="w-full" aria-label={t('settings.nav.select_section')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.labelKey}>
                  <SelectLabel>{t(group.labelKey)}</SelectLabel>
                  {group.entries.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {t(entry.titleKey)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-2xl p-5 pb-24 md:p-8 md:pb-24">{children}</div>
      </main>
    </div>
  );
}
