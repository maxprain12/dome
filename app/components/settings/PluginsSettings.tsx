'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Trash2, Download } from 'lucide-react';
import type { DomePluginInfo } from '@/types/plugin';

interface MarketplacePlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  repo?: string;
}

declare global {
  interface Window {
    electron?: {
      plugins?: {
        list: () => Promise<{ success: boolean; data?: DomePluginInfo[] }>;
        installFromFolder: () => Promise<{ success?: boolean; cancelled?: boolean; error?: string }>;
        installFromRepo: (repo: string) => Promise<{ success?: boolean; error?: string }>;
        uninstall: (id: string) => Promise<{ success: boolean; error?: string }>;
        setEnabled: (id: string, enabled: boolean) => Promise<{ success: boolean }>;
        readAsset: (pluginId: string, relativePath: string) => Promise<{ success: boolean; dataUrl?: string; text?: string; error?: string }>;
      };
    };
  }
}

export default function PluginsSettings() {
  const [plugins, setPlugins] = useState<DomePluginInfo[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingRepo, setInstallingRepo] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  useEffect(() => {
    setMarketplaceLoading(true);
    fetch('/plugins.json')
      .then((r) => r.json())
      .then((data: MarketplacePlugin[]) => setMarketplace(Array.isArray(data) ? data : []))
      .catch(() => setMarketplace([]))
      .finally(() => setMarketplaceLoading(false));
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

  const handleInstallFromRepo = async (repo: string) => {
    if (!repo) return;
    setInstallingRepo(repo);
    try {
      const r = await window.electron?.plugins?.installFromRepo?.(repo);
      if (r?.success) {
        showMessage('success', 'Plugin instalado correctamente');
        loadPlugins();
      } else {
        showMessage('error', r?.error || 'Error al instalar');
      }
    } finally {
      setInstallingRepo(null);
    }
  };

  const installedIds = new Set(plugins.map((p) => p.id));

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          Plugins
        </h2>
        <p className="text-sm opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Instala plugins de la comunidad para extender Dome
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

      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--secondary-text)' }}>
          Marketplace
        </h3>
        {marketplaceLoading ? (
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Cargando marketplace...</p>
        ) : marketplace.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            No hay plugins disponibles. Añade entradas a plugins.json para listarlos aquí.
          </p>
        ) : (
          <div className="space-y-3 mb-6">
            {marketplace.map((p) => (
              <div
                key={p.id}
                className="p-4 rounded-lg border flex items-center justify-between"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div>
                  <div className="font-medium" style={{ color: 'var(--primary-text)' }}>{p.name}</div>
                  <div className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                    {p.description} • por {p.author}
                  </div>
                </div>
                {p.repo && (
                  <button
                    onClick={() => handleInstallFromRepo(p.repo!)}
                    disabled={installingRepo !== null || installedIds.has(p.id)}
                    className="btn btn-primary flex items-center gap-2 text-sm py-1.5"
                  >
                    <Download className="w-4 h-4" />
                    {installedIds.has(p.id) ? 'Instalado' : installingRepo === p.repo ? 'Instalando...' : 'Instalar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <h3 className="text-xs uppercase tracking-wider font-semibold mb-4 mt-6" style={{ color: 'var(--secondary-text)' }}>
          Instalar desde carpeta
        </h3>
        <button onClick={handleInstall} className="btn btn-secondary flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          Instalar desde carpeta
        </button>
        <p className="text-xs mt-2 opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Selecciona una carpeta que contenga manifest.json y main.js
        </p>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--secondary-text)' }}>
          Plugins instalados
        </h3>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Cargando...</p>
        ) : plugins.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            No hay plugins instalados
          </p>
        ) : (
          <div className="space-y-3">
            {plugins.map((p) => (
              <div
                key={p.id}
                className="p-4 rounded-lg border flex items-center justify-between"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div>
                  <div className="font-medium" style={{ color: 'var(--primary-text)' }}>{p.name}</div>
                  <div className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                    {p.description} • v{p.version} por {p.author}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => handleToggleEnabled(p.id, e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>Activo</span>
                  </label>
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
    </div>
  );
}
