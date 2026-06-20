import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import DomeButton from '@/components/ui/DomeButton';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import SettingsNavDropdown from '@/components/settings/SettingsNavDropdown';
import {
  NAV_GROUPS,
  getGroupItems,
  type SettingsSection,
} from '@/components/settings/settingsNavConfig';
import '@/styles/settings-layout.css';

export type { SettingsSection } from '@/components/settings/settingsNavConfig';

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
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
  icon: ReactNode;
  isActive: boolean;
  label: string;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <DomeButton
      type="button"
      variant="ghost"
      size="sm"
      title={label}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onSelect(id)}
      className={cn('settings-nav-item', isActive && 'is-active')}
    >
      <span className="settings-nav-icon">{icon}</span>
      <span className="settings-nav-text">{label}</span>
    </DomeButton>
  );
}

export default function SettingsLayout({ activeSection, onSectionChange, children }: SettingsLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="settings-shell h-full w-full min-h-0">
      <aside className="settings-sidebar" aria-label={t('settings.title')}>
        <div className="settings-sidebar-header">
          <DomeSectionLabel
            compact={false}
            className="!text-xs !font-bold !tracking-widest text-[var(--dome-text-muted)]"
          >
            {t('settings.title')}
          </DomeSectionLabel>
        </div>

        <div className="settings-nav-dropdown">
          <SettingsNavDropdown
            activeSection={activeSection}
            onSectionChange={onSectionChange}
          />
        </div>

        <nav className="settings-nav" aria-label={t('settings.nav.sidebar')}>
          {NAV_GROUPS.map((group) => {
            const runs = getGroupItems(group);
            return (
              <div key={group.labelKey} className="settings-nav-group">
                <p className="settings-nav-group-label">{t(group.labelKey)}</p>

                {runs.map((run, runIndex) => (
                  <div key={`${group.labelKey}-${runIndex}`} className="settings-nav-subgroup">
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
      </aside>

      <main className="settings-content">
        <div className="settings-content-inner">
          {children}
        </div>
      </main>
    </div>
  );
}
