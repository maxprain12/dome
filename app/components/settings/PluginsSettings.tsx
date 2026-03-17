'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Trash2, Power } from 'lucide-react';
import type { DomePluginInfo } from '@/types/plugin';
import PluginRuntimeModal from './PluginRuntimeModal';

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
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          Plugins
        </h2>
        <p className="text-sm opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Gestiona los plugins instalados en Dome. Instala nuevos plugins desde el Marketplace.
        </p>
      </div>

      {message && (
        <p
          className="text-sm py-2 px-3 rounded-lg"
          style={{
            color: message.type === 'success' ? 'var(--success)' : 'var(--error)',
            backgroundColor: message.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
          }}
        >
          {message.text}
        </p>
      )}

      {/* Installed plugins */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--secondary-text)' }}>
          Plugins instalados
        </h3>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Cargando...</p>
        ) : plugins.length === 0 ? (
          <div
            className="py-10 rounded-xl flex flex-col items-center gap-3 border"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <Power className="w-8 h-8 opacity-20" style={{ color: 'var(--secondary-text)' }} />
            <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
              No hay plugins instalados
            </p>
            <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
              Explora el Marketplace para descubrir plugins
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {plugins.map((p) => (
              <div
                key={p.id}
                className="p-4 rounded-lg border flex items-center justify-between"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium" style={{ color: 'var(--primary-text)' }}>{p.name}</span>
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: p.enabled ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                        color: p.enabled ? 'var(--accent)' : 'var(--tertiary-text)',
                      }}
                    >
                      {p.enabled ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                    {p.description} · v{p.version} · {p.author}
                  </div>
                  {p.type && (
                    <span
                      className="inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px]"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary-text)' }}
                    >
                      {p.type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {p.type === 'view' && p.enabled && (
                    <button
                      type="button"
                      onClick={() => setRuntimePlugin(p)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--accent)' }}
                    >
                      Abrir
                    </button>
                  )}
                  {/* Toggle activo/inactivo */}
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(p.id, !p.enabled)}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    style={{
                      backgroundColor: p.enabled ? 'var(--accent)' : 'var(--bg-tertiary)',
                    }}
                    title={p.enabled ? 'Desactivar' : 'Activar'}
                    aria-label={p.enabled ? 'Desactivar plugin' : 'Activar plugin'}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      style={{ transform: p.enabled ? 'translateX(1.25rem)' : 'translateX(0.125rem)' }}
                    />
                  </button>
                  <button
                    onClick={() => handleUninstall(p.id)}
                    className="p-1.5 rounded hover:bg-[var(--error-bg)] transition-colors"
                    style={{ color: 'var(--error)' }}
                    title="Desinstalar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Install from folder */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--secondary-text)' }}>
          Instalar plugin
        </h3>
        <button onClick={handleInstall} className="btn btn-secondary flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          Instalar desde carpeta
        </button>
        <p className="text-xs mt-2" style={{ color: 'var(--tertiary-text)' }}>
          Selecciona una carpeta que contenga <code>manifest.json</code>. También puedes instalar desde el Marketplace.
        </p>
      </section>

      {runtimePlugin && (
        <PluginRuntimeModal
          plugin={runtimePlugin}
          onClose={() => setRuntimePlugin(null)}
        />
      )}
    </div>
  );
}
