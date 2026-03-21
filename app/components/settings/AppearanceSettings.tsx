
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';

const DOME_GREEN = '#596037';
const DOME_GREEN_DARK = '#A4AD7A';
const DOME_GREEN_LIGHT = '#E0EAB4';
const DOME_GREEN_LIGHT_DARK = '#2A3015';

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
  const currentTheme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);

  const accentColor = 'var(--dome-accent)';

  const themes = [
    { value: 'light', labelKey: 'settings.appearance.light', icon: Sun, descKey: 'settings.appearance.light_desc' },
    { value: 'auto', labelKey: 'settings.appearance.system', icon: Monitor, descKey: 'settings.appearance.system_desc' },
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
            return (
              <button
                key={value}
                onClick={() => updateTheme(value as 'light' | 'dark' | 'auto')}
                className="p-4 rounded-xl text-left transition-all"
                style={{
                  backgroundColor: isActive ? 'var(--translucent)' : 'var(--dome-surface)',
                  border: isActive ? `2px solid ${accentColor}` : '2px solid var(--dome-border)',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
                  style={{ backgroundColor: isActive ? 'var(--dome-accent-bg)' : 'var(--dome-bg-hover)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: isActive ? accentColor : 'var(--dome-text-muted)' }} />
                </div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: isActive ? accentColor : 'var(--dome-text)' }}>
                  {t(labelKey)}
                </p>
                <p className="text-[10px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
                  {t(descKey)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Customization placeholder ── */}
      <div>
        <SectionLabel>{t('settings.appearance.customization')}</SectionLabel>
        <SettingsCard className="p-4">
          <div className="flex items-center gap-3 opacity-40">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'var(--dome-accent-bg)' }} />
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
