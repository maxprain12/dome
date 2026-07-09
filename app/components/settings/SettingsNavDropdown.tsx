import { useTranslation } from 'react-i18next';
import { Menu } from '@mantine/core';
import { Check, ChevronDown } from 'lucide-react';
import DomeButton from '@/components/ui/DomeButton';
import { cn } from '@/lib/utils';
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

export default function SettingsNavDropdown({
  activeSection,
  onSectionChange,
  hiddenSections,
}: SettingsNavDropdownProps) {
  const { t } = useTranslation();
  const navGroups = hiddenSections?.size
    ? filterNavGroups(NAV_GROUPS, hiddenSections)
    : NAV_GROUPS;
  const normalizedActive = normalizeNavSection(activeSection);
  const activeItem = findNavItem(activeSection);
  const activeLabel = t(`settings.tabs.${normalizedActive}`);

  return (
    <Menu
      withinPortal
      position="bottom-start"
      width="target"
      shadow="md"
      offset={4}
      classNames={{
        dropdown: 'settings-nav-dropdown-menu',
        item: 'settings-nav-dropdown-item',
        label: 'settings-nav-dropdown-label',
      }}
    >
      <Menu.Target>
        <DomeButton
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="listbox"
          aria-label={t('settings.nav.select_section')}
          className="settings-nav-dropdown-trigger"
          rightIcon={<ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />}
          leftIcon={
            activeItem ? (
              <span className="settings-nav-dropdown-trigger-icon" aria-hidden>
                {activeItem.icon}
              </span>
            ) : undefined
          }
        >
          <span className="settings-nav-dropdown-trigger-text">{activeLabel}</span>
        </DomeButton>
      </Menu.Target>

      <Menu.Dropdown role="listbox" aria-label={t('settings.nav.select_section')}>
        {navGroups.map((group, groupIndex) => {
          const runs = getGroupItems(group);
          const groupLabel = t(group.labelKey);

          return (
            <div key={group.labelKey}>
              {groupIndex > 0 ? <Menu.Divider /> : null}
              <Menu.Label>{groupLabel}</Menu.Label>
              {runs.map((run, runIndex) => (
                <div key={`${group.labelKey}-${runIndex}`}>
                  {runIndex > 0 ? <Menu.Divider /> : null}
                  {run.map(({ id, icon }) => {
                    const isActive = normalizedActive === id;
                    const label = t(`settings.tabs.${id}`);

                    return (
                      <Menu.Item
                        key={id}
                        role="option"
                        aria-selected={isActive}
                        leftSection={
                          <span className={cn('settings-nav-dropdown-item-icon', isActive && 'is-active')}>
                            {icon}
                          </span>
                        }
                        rightSection={
                          isActive ? (
                            <Check className="size-3.5 shrink-0 text-[var(--dome-accent)]" aria-hidden />
                          ) : null
                        }
                        className={cn(isActive && 'is-active')}
                        onClick={() => onSectionChange(id)}
                      >
                        {label}
                      </Menu.Item>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
