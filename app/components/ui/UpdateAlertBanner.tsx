'use client';

import { useState, useEffect } from 'react';
import { Download, RotateCw, X } from 'lucide-react';

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';

interface UpdaterState {
  status: UpdaterStatus;
  version?: string;
  percent?: number;
  error?: string;
}

const SHOW_STATUSES: UpdaterStatus[] = ['available', 'downloading', 'downloaded'];

export default function UpdateAlertBanner() {
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: 'idle' });
  const [dismissedStatus, setDismissedStatus] = useState<UpdaterStatus | null>(null);

  useEffect(() => {
    if (!window.electron?.updater?.onStatus) return;
    const unsub = window.electron.updater.onStatus((s) => setUpdaterState(s as UpdaterState));
    return unsub;
  }, []);

  const { status, version, percent } = updaterState;
  const shouldShow = SHOW_STATUSES.includes(status) && dismissedStatus !== status;

  const handleDismiss = () => {
    setDismissedStatus(status);
  };

  const handleDownload = async () => {
    try {
      await window.electron?.updater?.download();
    } catch (e) {
      console.error('[UpdateAlertBanner] Download failed:', e);
    }
  };

  const handleInstall = () => {
    window.electron?.updater?.install();
  };

  if (!shouldShow) return null;

  return (
    <div
      className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-2.5 animate-in slide-in-from-top-2 duration-200"
      style={{
        background: 'var(--accent)',
        color: 'var(--bg)',
        borderBottom: '1px solid var(--dome-border)',
      }}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {status === 'available' && (
          <>
            <span className="text-sm font-medium truncate">
              Nueva versión {version ?? ''} disponible
            </span>
            <button
              type="button"
              onClick={handleDownload}
              className="btn btn-secondary flex items-center gap-2 shrink-0"
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.4)',
              }}
            >
              <Download className="w-4 h-4" />
              Descargar
            </button>
          </>
        )}
        {status === 'downloading' && (
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <span className="text-sm font-medium">
              Descargando actualización... {percent?.toFixed(0) ?? 0}%
            </span>
            <div className="h-1.5 rounded-full overflow-hidden bg-[rgba(255,255,255,0.3)] max-w-[200px]">
              <div
                className="h-full transition-all duration-300 bg-white"
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
          </div>
        )}
        {status === 'downloaded' && (
          <>
            <span className="text-sm font-medium">Actualización lista para instalar</span>
            <button
              type="button"
              onClick={handleInstall}
              className="btn btn-secondary flex items-center gap-2 shrink-0"
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.4)',
              }}
            >
              <RotateCw className="w-4 h-4" />
              Reiniciar para instalar
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded hover:bg-[rgba(255,255,255,0.2)] transition-colors"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
