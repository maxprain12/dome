
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const currentTheme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);

  const themes = [
    { value: 'light', labelKey: 'settings.appearance.light', icon: Sun, descKey: 'settings.appearance.light_desc' },
    { value: 'auto', labelKey: 'settings.appearance.system', icon: Monitor, descKey: 'settings.appearance.system_desc' },
    { value: 'dark', labelKey: 'settings.appearance.dark', icon: Moon, descKey: 'settings.appearance.dark_desc' },
  ];

  const activeDesc = themes.find((th) => th.value === currentTheme)?.descKey;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        title={t('settings.appearance.title')}
        subtitle={t('settings.appearance.subtitle')}
        className="rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"
      />

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.appearance.theme')}</DomeSectionLabel>
        <DomeSegmentedControl
          className="w-full max-w-xl"
          aria-label={t('settings.appearance.theme')}
          value={currentTheme}
          onChange={(v) => updateTheme(v as 'light' | 'dark' | 'auto')}
          options={themes.map((th) => ({
            value: th.value,
            label: t(th.labelKey),
            icon: <th.icon className="w-3.5 h-3.5" aria-hidden />,
          }))}
        />
        {activeDesc ? (
          <p className="text-[10px] mt-2 text-[var(--dome-text-muted,var(--tertiary-text))]">{t(activeDesc)}</p>
        ) : null}
      </div>

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.appearance.customization')}</DomeSectionLabel>
        <DomeCard>
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
        </DomeCard>
      </div>
    </div>
  );
}
