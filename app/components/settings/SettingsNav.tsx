import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
import { HubSearch } from '@/components/hub';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SETTINGS_GROUPS,
  filterSettingsGroups,
  resolveSettingsSection,
  type SettingsSection,
} from './registry';
import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import { SETTINGS_TAB_ID, useTabStore } from '@/lib/store/useTabStore';
import { ShellSidebar } from '@/components/shared/ShellSidebar';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';


function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

interface SettingsNavProps {
  collapsed: boolean;
}

/**
 * Left-shell navigation for Settings mode — replaces UnifiedSidebar while the
 * settings tab is active. Back exits settings; section state lives in
 * useSettingsUiStore so the content pane can stay in ContentRouter.
 */
export default function SettingsNav({ collapsed }: SettingsNavProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const activeSection = useSettingsUiStore((s) => s.activeSection);
  const hiddenSections = useSettingsUiStore((s) => s.hiddenSections);
  const setActiveSection = useSettingsUiStore((s) => s.setActiveSection);

  const groups = useMemo(
    () => filterSettingsGroups(SETTINGS_GROUPS, hiddenSections),
    [hiddenSections],
  );

  const visibleGroups = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          const haystack = normalizeSearch([
            t(entry.titleKey),
            t(entry.groupLabelKey),
            t(`settingsGuide.sections.${entry.id}.description`),
            t(`settingsGuide.sections.${entry.id}.start`),
            ...entry.keywords,
            ...entry.legacyAliases,
          ]
            .join(' '));
          return q.split(/\s+/).every((word) => haystack.includes(word));
        }),
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, query, t]);

  const normalizedActive = resolveSettingsSection(activeSection);
  const firstMatch = visibleGroups.flatMap((group) => group.entries).find(
    (entry) => normalizeSearch(t(entry.titleKey)) === normalizeSearch(query),
  ) ?? visibleGroups[0]?.entries[0];

  const selectSection = (section: SettingsSection) => {
    setQuery('');
    setActiveSection(section);
  };

  const handleBack = () => {
    useTabStore.getState().closeTab(SETTINGS_TAB_ID);
  };

  return (
    <ShellSidebar collapsed={collapsed} label={t('settings.nav.sidebar')}>
      <div className="shrink-0 px-2 py-2">
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton
          type="button"
          onClick={handleBack}
          className="mb-2"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t('settings.back_to_app')}</span>
        </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        <div className="px-0.5">
          <HubSearch
            value={query}
            onChange={setQuery}
            onSubmit={() => {
              if (firstMatch) selectSection(firstMatch.id);
            }}
            placeholder={t('settings.search')}
            aria-label={t('settings.search')}
            clearLabel={t('common.clear')}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
      <ScrollArea className="h-full">
        <nav className="pb-5" aria-label={t('settings.nav.sidebar')}>
          {visibleGroups.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-sidebar-foreground/60">
              {t('settings.search_empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleGroups.map((group) => (
                <SidebarGroup key={group.labelKey}>
                  <SidebarGroupLabel className="h-auto px-2 pb-2 text-xs font-medium">{t(group.labelKey)}</SidebarGroupLabel>
                  <SidebarMenu>
                    {group.entries.map((entry) => <SidebarMenuItem key={entry.id}><SidebarMenuButton type="button" isActive={normalizedActive === entry.id} aria-current={normalizedActive === entry.id ? 'page' : undefined} onClick={() => selectSection(entry.id)} className="h-auto min-h-9 items-start py-2">
                      <HugeiconsIcon icon={entry.icon} className="mt-0.5" aria-hidden /><span className="min-w-0 flex-1 whitespace-normal leading-snug">{t(entry.titleKey)}</span>
                    </SidebarMenuButton></SidebarMenuItem>)}
                  </SidebarMenu>
                </SidebarGroup>
              ))}
            </div>
          )}
        </nav>
      </ScrollArea>
      </div>
    </ShellSidebar>
  );
}
