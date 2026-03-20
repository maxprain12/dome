
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

export default function AppearanceSettings() {
  const { t } = useTranslation();
  // Only light mode is supported currently
  const currentTheme = 'light';

  const themes = [
    { value: 'light', labelKey: 'settings.appearance.light', icon: Sun, descKey: 'settings.appearance.light_desc' },
    { value: 'system', labelKey: 'settings.appearance.system', icon: Monitor, descKey: 'settings.appearance.system_desc' },
    { value: 'dark', labelKey: 'settings.appearance.dark', icon: Moon, descKey: 'settings.appearance.dark_desc' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>
          {t('settings.appearance.title')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          {t('settings.appearance.subtitle')}
        </p>
      </div>

      {/* ── Theme ── */}
      <div>
        <SectionLabel>{t('settings.appearance.theme')}</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {themes.map(({ value, labelKey, icon: Icon, descKey }) => {
            const isActive = currentTheme === value;
            const isDisabled = value === 'dark' || value === 'system';
            return (
              <button
                key={value}
                disabled={isDisabled}
                className="p-4 rounded-xl text-left transition-all disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isActive ? `${DOME_GREEN}10` : 'var(--dome-surface)',
                  border: isActive ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                  opacity: isDisabled && !isActive ? 0.45 : 1,
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
                  style={{ backgroundColor: isActive ? DOME_GREEN_LIGHT : 'var(--dome-bg-hover)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: isActive ? DOME_GREEN : 'var(--dome-text-muted)' }} />
                </div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: isActive ? DOME_GREEN : 'var(--dome-text)' }}>
                  {t(labelKey)}
                </p>
                <p className="text-[10px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
                  {t(descKey)}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--dome-text-muted)', opacity: 0.7 }}>
          {t('settings.appearance.dark_notice')}
        </p>
      </div>

      {/* ── Customization placeholder ── */}
      <div>
        <SectionLabel>{t('settings.appearance.customization')}</SectionLabel>
        <SettingsCard className="p-4">
          <div className="flex items-center gap-3 opacity-40">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: DOME_GREEN_LIGHT }} />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                {t('settings.appearance.custom_label')}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.appearance.custom_desc')}
              </p>
            </div>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
