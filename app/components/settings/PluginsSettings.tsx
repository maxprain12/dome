
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Trash2, Puzzle } from 'lucide-react';
import type { DomePluginInfo } from '@/types/plugin';
import PluginRuntimeModal from './PluginRuntimeModal';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeListState from '@/components/ui/DomeListState';
import DomeBadge from '@/components/ui/DomeBadge';

export default function PluginsSettings() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<DomePluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [runtimePlugin, setRuntimePlugin] = useState<DomePluginInfo | null>(null);

  const loadPlugins = async () => {
    setLoading(true);
    try {
      const r = await window.electron?.plugins?.list?.();
      if (r?.success && r.data) setPlugins(r.data);
    } catch {
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleInstall = async () => {
    const r = await window.electron?.plugins?.installFromFolder?.();
    if (r?.cancelled) return;
    if (r?.success) {
      showMessage('success', t('settings.plugins.installed_ok'));
      loadPlugins();
    } else {
      showMessage('error', r?.error || t('settings.plugins.install_error'));
    }
  };

  const handleUninstall = async (id: string) => {
    if (!confirm(t('settings.plugins.uninstall_confirm'))) return;
    const r = await window.electron?.plugins?.uninstall?.(id);
    if (r?.success) {
      showMessage('success', t('settings.plugins.uninstalled_ok'));
      loadPlugins();
    } else {
      showMessage('error', r?.error || t('settings.plugins.uninstall_error'));
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const r = await window.electron?.plugins?.setEnabled?.(id, enabled);
    if (r?.success) loadPlugins();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title="Plugins"
        subtitle={t('settings.plugins.subtitle')}
      />

      {message ? (
        <DomeCallout tone={message.type === 'success' ? 'success' : 'error'}>{message.text}</DomeCallout>
      ) : null}

      {/* Installed plugins */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.plugins.section_installed')}</DomeSectionLabel>
        {loading ? (
          <DomeListState variant="loading" loadingLabel={t('settings.plugins.loading')} />
        ) : plugins.length === 0 ? (
          <DomeCard className="py-6">
            <DomeListState
              variant="empty"
              title={t('settings.plugins.empty_title')}
              description={t('settings.plugins.empty_desc')}
              icon={<Puzzle className="w-8 h-8 text-[var(--dome-text-muted)] opacity-50" aria-hidden />}
            />
          </DomeCard>
        ) : (
          <div className="space-y-2">
            {plugins.map((p) => (
              <DomeCard key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{p.name}</span>
                      <DomeBadge
                        label={p.enabled ? t('settings.plugins.status_active') : t('settings.plugins.status_inactive')}
                        size="xs"
                        color={p.enabled ? 'var(--dome-accent)' : 'var(--dome-text-muted)'}
                      />
                      {p.type ? (
                        <DomeBadge label={p.type} size="xs" color="var(--dome-text-muted)" variant="soft" />
                      ) : null}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                      {p.description} · v{p.version} · {p.author}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.type === 'view' && p.enabled ? (
                      <DomeButton type="button" variant="primary" size="xs" onClick={() => setRuntimePlugin(p)}>
                        {t('settings.plugins.open')}
                      </DomeButton>
                    ) : null}
                    <DomeToggle
                      checked={p.enabled}
                      onChange={(v) => void handleToggleEnabled(p.id, v)}
                      size="sm"
                    />
                    <DomeButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() => void handleUninstall(p.id)}
                      className="text-[var(--dome-text-muted)]"
                      title="Desinstalar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </DomeButton>
                  </div>
                </div>
              </DomeCard>
            ))}
          </div>
        )}
      </div>

      {/* Install from folder */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.plugins.section_install')}</DomeSectionLabel>
        <DomeButton
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleInstall()}
          leftIcon={<FolderOpen className="w-3.5 h-3.5" aria-hidden />}
        >
          {t('settings.plugins.install_from_folder')}
        </DomeButton>
        <p className="text-[11px] mt-2" style={{ color: 'var(--dome-text-muted)', opacity: 0.7 }}>
          {t('settings.plugins.install_hint')}
        </p>
      </div>

      {runtimePlugin && (
        <PluginRuntimeModal
          plugin={runtimePlugin}
          onClose={() => setRuntimePlugin(null)}
        />
      )}
    </div>
  );
}
