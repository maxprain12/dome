import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
import { HubSearch } from '@/components/hub';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SETTINGS_GROUPS,
  filterSettingsGroups,
  resolveSettingsSection,
  type SettingsSection,
} from './registry';
import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import { SETTINGS_TAB_ID, useTabStore } from '@/lib/store/useTabStore';
import { cn } from '@/lib/utils';

interface SettingsNavProps {
  collapsed: boolean;
}

/** Same density as UnifiedSidebar `SidebarNavButton`. */
function SettingsNavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconSvgElement;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'h-auto w-full justify-start gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-sidebar-foreground/80',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent'
          : 'hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Button>
  );
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
  const firstMatch = visibleGroups[0]?.entries[0];

  const selectSection = (section: SettingsSection) => {
    setQuery('');
    setActiveSection(section);
  };

  const handleBack = () => {
    useTabStore.getState().closeTab(SETTINGS_TAB_ID);
  };

  return (
    <aside
      className={cn(
        'dome-left-sidebar flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width,opacity] duration-200 ease-out',
        collapsed ? 'w-0 opacity-0' : 'w-62 opacity-100',
      )}
      aria-hidden={collapsed}
      aria-label={t('settings.nav.sidebar')}
    >
      <div className="shrink-0 px-2 pb-2 pt-2.5">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBack}
          className="mb-1.5 h-auto w-full justify-start gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t('settings.back_to_app')}</span>
        </Button>
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
        <nav className="flex flex-col gap-3 px-2 pb-5 pt-1" aria-label={t('settings.nav.sidebar')}>
          {visibleGroups.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-sidebar-foreground/60">
              {t('settings.search_empty')}
            </p>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.labelKey} className="flex flex-col gap-0.5">
                <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {t(group.labelKey)}
                </p>
                {group.entries.map((entry) => (
                  <SettingsNavButton
                    key={entry.id}
                    icon={entry.icon}
                    label={t(entry.titleKey)}
                    active={normalizedActive === entry.id}
                    onClick={() => selectSection(entry.id)}
                  />
                ))}
              </div>
            ))
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}
