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
import { ShellSidebar, ShellNavItem, ShellNavSection } from '@/components/shared/ShellSidebar';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

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
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          const haystack = [
            t(entry.titleKey),
            t(entry.groupLabelKey),
            ...entry.keywords,
            ...entry.legacyAliases,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, query, t]);

  const normalizedActive = resolveSettingsSection(activeSection);
  const firstMatch = visibleGroups.flatMap((group) => group.entries).find(
    (entry) => t(entry.titleKey).toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
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

      <ScrollArea className="min-h-0 flex-1">
        <nav className="pb-5" aria-label={t('settings.nav.sidebar')}>
          {visibleGroups.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-sidebar-foreground/60">
              {t('settings.search_empty')}
            </p>
          ) : (
            <SidebarGroup>
              <SidebarGroupLabel>{t('settings.title')}</SidebarGroupLabel>
              {visibleGroups.map((group) => {
                if (group.entries.length === 1) {
                  const entry = group.entries[0];
                  return <SidebarMenu key={group.labelKey}><ShellNavItem icon={entry.icon} label={t(entry.titleKey)} active={normalizedActive === entry.id} onClick={() => selectSection(entry.id)} /></SidebarMenu>;
                }
                return <ShellNavSection key={group.labelKey} label={t(group.labelKey)} icon={group.entries[0].icon} activeId={group.entries.find((entry) => normalizedActive === entry.id)?.id} forceOpen={Boolean(query.trim())}>
                  {group.entries.map((entry) => <ShellNavItem key={entry.id} nested icon={entry.icon} label={t(entry.titleKey)} active={normalizedActive === entry.id} onClick={() => selectSection(entry.id)} />)}
                </ShellNavSection>;
              })}
            </SidebarGroup>
          )}
        </nav>
      </ScrollArea>
    </ShellSidebar>
  );
}
