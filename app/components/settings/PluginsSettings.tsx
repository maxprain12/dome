
import { useState, useEffect } from 'react';
import { FolderOpen, Trash2, Power, CheckCircle2, AlertCircle, Puzzle } from 'lucide-react';
import type { DomePluginInfo } from '@/types/plugin';
import PluginRuntimeModal from './PluginRuntimeModal';

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

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200"
      style={{ backgroundColor: checked ? DOME_GREEN : 'var(--dome-border)' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

export default function PluginsSettings() {
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
      showMessage('success', 'Plugin instalado correctamente');
      loadPlugins();
    } else {
      showMessage('error', r?.error || 'Error al instalar');
    }
  };

  const handleUninstall = async (id: string) => {
    if (!confirm('¿Desinstalar este plugin?')) return;
    const r = await window.electron?.plugins?.uninstall?.(id);
    if (r?.success) {
      showMessage('success', 'Plugin desinstalado');
      loadPlugins();
    } else {
      showMessage('error', r?.error || 'Error al desinstalar');
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const r = await window.electron?.plugins?.setEnabled?.(id, enabled);
    if (r?.success) loadPlugins();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>Plugins</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          Gestiona los plugins instalados en Dome. Instala nuevos desde el Marketplace.
        </p>
      </div>

      {/* Feedback */}
      {message && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: message.type === 'success' ? `${DOME_GREEN}12` : 'rgba(239,68,68,0.08)',
            border: `1px solid ${message.type === 'success' ? `${DOME_GREEN}30` : 'rgba(239,68,68,0.2)'}`,
            color: message.type === 'success' ? DOME_GREEN : 'var(--dome-error, #ef4444)',
          }}
        >
          {message.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />
          }
          {message.text}
        </div>
      )}

      {/* Installed plugins */}
      <div>
        <SectionLabel>Plugins instalados</SectionLabel>
        {loading ? (
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Cargando...</p>
        ) : plugins.length === 0 ? (
          <SettingsCard className="py-10 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center opacity-30" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
              <Puzzle className="w-6 h-6" style={{ color: 'var(--dome-text-muted)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>Sin plugins instalados</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>Explora el Marketplace para descubrir plugins</p>
            </div>
          </SettingsCard>
        ) : (
          <div className="space-y-2">
            {plugins.map((p) => (
              <SettingsCard key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{p.name}</span>
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: p.enabled ? `${DOME_GREEN}15` : 'var(--dome-bg-hover)',
                          color: p.enabled ? DOME_GREEN : 'var(--dome-text-muted)',
                        }}
                      >
                        {p.enabled ? 'Activo' : 'Inactivo'}
                      </span>
                      {p.type && (
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px]"
                          style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
                        >
                          {p.type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                      {p.description} · v{p.version} · {p.author}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.type === 'view' && p.enabled && (
                      <button
                        type="button"
                        onClick={() => setRuntimePlugin(p)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={{ color: DOME_GREEN, backgroundColor: `${DOME_GREEN}10` }}
                      >
                        Abrir
                      </button>
                    )}
                    <Toggle
                      checked={p.enabled}
                      onChange={() => handleToggleEnabled(p.id, !p.enabled)}
                    />
                    <button
                      onClick={() => handleUninstall(p.id)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--dome-text-muted)' }}
                      title="Desinstalar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </SettingsCard>
            ))}
          </div>
        )}
      </div>

      {/* Install from folder */}
      <div>
        <SectionLabel>Instalar plugin</SectionLabel>
        <button
          onClick={handleInstall}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Instalar desde carpeta
        </button>
        <p className="text-[11px] mt-2" style={{ color: 'var(--dome-text-muted)', opacity: 0.7 }}>
          Selecciona una carpeta que contenga <code style={{ fontFamily: 'monospace' }}>manifest.json</code>. También puedes instalar desde el Marketplace.
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
