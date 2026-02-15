'use client';

import { useState, useEffect } from 'react';
import { Download, RefreshCw, RotateCw } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import type { CitationStyle } from '@/types';

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';

interface UpdaterState {
  status: UpdaterStatus;
  version?: string;
  percent?: number;
  error?: string;
}

const citationStyles: { value: CitationStyle; label: string; description: string }[] = [
  { value: 'apa', label: 'APA', description: 'American Psychological Association' },
  { value: 'mla', label: 'MLA', description: 'Modern Language Association' },
  { value: 'chicago', label: 'Chicago', description: 'Chicago Manual of Style' },
  { value: 'harvard', label: 'Harvard', description: 'Harvard Referencing' },
  { value: 'vancouver', label: 'Vancouver', description: 'Vancouver System' },
  { value: 'ieee', label: 'IEEE', description: 'Institute of Electrical and Electronics Engineers' },
];

export default function AdvancedSettings() {
  const { citationStyle, autoSave, autoBackup, updateCitationStyle, updatePreferences } = useAppStore();
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: 'idle' });
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    window.electron?.getAppVersion?.().then((v) => setAppVersion(v || '0.1.0'));
  }, []);

  useEffect(() => {
    if (!window.electron?.updater?.onStatus) return;
    const unsub = window.electron.updater.onStatus((s) => setUpdaterState(s as UpdaterState));
    return unsub;
  }, []);

  const handleCheckUpdate = async () => {
    setUpdaterState((s) => ({ ...s, status: 'checking' }));
    try {
      const result = await window.electron?.updater?.check();
      const r = result as { status?: string } | null;
      if (r?.status === 'skipped') {
        setUpdaterState({ status: 'idle' });
      }
    } catch (e) {
      setUpdaterState({ status: 'error', error: String(e) });
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      await window.electron?.updater?.download();
    } catch (e) {
      setUpdaterState({ status: 'error', error: String(e) });
    }
  };

  const handleInstallUpdate = () => {
    window.electron?.updater?.install();
  };

  const handleToggleAutoSave = () => {
    updatePreferences({ autoSave: !autoSave });
  };

  const handleToggleAutoBackup = () => {
    updatePreferences({ autoBackup: !autoBackup });
  };

  const handleCitationStyleChange = (style: CitationStyle) => {
    updateCitationStyle(style);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          Advanced
        </h2>
        <p className="text-sm opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Configure advanced settings and preferences
        </p>
      </div>

      {/* Application Updates */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Application Updates
        </h3>
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            Current version: {appVersion}
          </p>
          {updaterState.status === 'idle' && (
            <button onClick={handleCheckUpdate} className="btn btn-secondary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Check for updates
            </button>
          )}
          {updaterState.status === 'checking' && (
            <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Checking for updates...</p>
          )}
          {updaterState.status === 'available' && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--primary-text)' }}>
                New version {updaterState.version} available
              </p>
              <button onClick={handleDownloadUpdate} className="btn btn-primary flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download update
              </button>
            </div>
          )}
          {updaterState.status === 'downloading' && (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Downloading... {updaterState.percent?.toFixed(0) ?? 0}%</p>
              <div className="h-2 rounded-full overflow-hidden bg-[var(--border)]">
                <div
                  className="h-full transition-all duration-300 bg-[var(--accent)]"
                  style={{ width: `${updaterState.percent ?? 0}%` }}
                />
              </div>
            </div>
          )}
          {updaterState.status === 'downloaded' && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--success)' }}>Update ready to install</p>
              <button onClick={handleInstallUpdate} className="btn btn-primary flex items-center gap-2">
                <RotateCw className="w-4 h-4" />
                Restart to install
              </button>
            </div>
          )}
          {updaterState.status === 'not-available' && (
            <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>You have the latest version</p>
          )}
          {updaterState.status === 'error' && (
            <p className="text-sm" style={{ color: 'var(--error)' }}>{updaterState.error || 'Update check failed'}</p>
          )}
        </div>
      </section>

      {/* System Preferences */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          System Preferences
        </h3>

        <div className="space-y-4">
          {/* Auto-Save */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 pr-8">
              <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--primary-text)' }}>
                Auto-Save
              </h3>
              <p className="text-xs opacity-80" style={{ color: 'var(--secondary-text)' }}>
                Automatically save your work as you type
              </p>
            </div>
            <button
              onClick={handleToggleAutoSave}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSave ? '' : ''}`}
              style={{
                backgroundColor: autoSave ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSave ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Auto-Backup */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 pr-8">
              <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--primary-text)' }}>
                Auto-Backup
              </h3>
              <p className="text-xs opacity-80" style={{ color: 'var(--secondary-text)' }}>
                Automatically create backups of your data
              </p>
            </div>
            <button
              onClick={handleToggleAutoBackup}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoBackup ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              style={{
                backgroundColor: autoBackup ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoBackup ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Sync (Export/Import) */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Sincronización
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
          Exporta o importa tus datos para llevar todo a otro equipo.
        </p>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              const r = await window.electron?.sync?.export?.();
              if (r?.success) alert('Exportación completada en: ' + r.path);
              else if (!r?.cancelled) alert('Error: ' + (r?.error || 'Unknown'));
            }}
            className="btn btn-secondary"
          >
            Exportar datos
          </button>
          <button
            onClick={async () => {
              const r = await window.electron?.sync?.import?.();
              if (r?.success) {
                alert(r.restartRequired ? 'Importación completada. Reinicia Dome para ver los datos.' : 'Importación completada.');
                if (r.restartRequired) window.location.reload();
              } else if (!r?.cancelled) alert('Error: ' + (r?.error || 'Unknown'));
            }}
            className="btn btn-secondary"
          >
            Importar datos
          </button>
        </div>
      </section>

      {/* Citation Style */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Citation Style
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {citationStyles.map((style) => (
            <button
              key={style.value}
              onClick={() => handleCitationStyleChange(style.value)}
              className={`p-4 rounded-lg text-left transition-all border ${citationStyle === style.value ? 'bg-blue-50/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              style={{
                backgroundColor: citationStyle === style.value ? 'var(--bg-secondary)' : 'transparent',
                borderColor: citationStyle === style.value ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div className="font-medium text-sm mb-1" style={{ color: 'var(--primary-text)' }}>
                {style.label}
              </div>
              <div className="text-xs opacity-70" style={{ color: 'var(--secondary-text)' }}>
                {style.description}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
