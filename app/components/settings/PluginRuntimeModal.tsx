'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { DomePluginInfo } from '@/types/plugin';

type PluginRuntimeModalProps = {
  plugin: DomePluginInfo;
  onClose: () => void;
};

function buildBridgeScript() {
  return `
    <script>
      (() => {
        const pending = new Map();
        let seq = 0;
        window.DomePlugin = {
          request(method, params) {
            const id = "plugin_req_" + (++seq);
            window.parent.postMessage({ source: "dome-plugin", type: "request", id, method, params }, "*");
            return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
          }
        };
        window.addEventListener("message", (event) => {
          const data = event.data || {};
          if (data.source !== "dome-host" || !data.id) return;
          const entry = pending.get(data.id);
          if (!entry) return;
          pending.delete(data.id);
          if (data.error) {
            entry.reject(new Error(data.error));
            return;
          }
          entry.resolve(data.result);
        });
      })();
    </script>
  `;
}

function injectBridge(html: string): string {
  if (html.includes('</head>')) {
    return html.replace('</head>', `${buildBridgeScript()}</head>`);
  }
  return `${buildBridgeScript()}${html}`;
}

export default function PluginRuntimeModal({ plugin, onClose }: PluginRuntimeModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const permissions = useMemo(() => new Set(plugin.permissions || []), [plugin.permissions]);
  const entry = plugin.entry || 'index.html';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void window.electron?.plugins?.readAsset?.(plugin.id, entry).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result?.success || !result.text) {
        throw new Error(result?.error || 'No se pudo cargar el entry HTML del plugin');
      }
      setSrcDoc(injectBridge(result.text));
      setLoading(false);
    }).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Error al cargar plugin');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [entry, plugin.id, reloadKey]);

  useEffect(() => {
    const electronDb = window.electron?.db;
    if (!electronDb) {
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      const data = event.data || {};
      if (data.source !== 'dome-plugin' || data.type !== 'request' || event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const respond = (payload: { result?: unknown; error?: string }) => {
        iframeRef.current?.contentWindow?.postMessage({
          source: 'dome-host',
          id: data.id,
          ...payload,
        }, '*');
      };

      try {
        switch (data.method) {
          case 'resources.search':
            if (!permissions.has('resources')) {
              throw new Error('Permiso resources requerido');
            }
            respond({ result: await electronDb.resources.search(String(data.params?.query || '')) });
            return;
          case 'resources.list':
            if (!permissions.has('resources')) {
              throw new Error('Permiso resources requerido');
            }
            respond({ result: await electronDb.resources.getAll(200) });
            return;
          case 'projects.list':
            if (!permissions.has('projects')) {
              throw new Error('Permiso projects requerido');
            }
            respond({ result: await electronDb.projects.getAll() });
            return;
          case 'calendar.upcoming':
            if (!permissions.has('calendar')) {
              throw new Error('Permiso calendar requerido');
            }
            respond({ result: await window.electron.calendar.getUpcoming({ windowMinutes: 60 * 24, limit: 20 }) });
            return;
          case 'settings.get':
            if (!permissions.has('settings')) {
              throw new Error('Permiso settings requerido');
            }
            respond({ result: await electronDb.settings.get(String(data.params?.key || '')) });
            return;
          default:
            throw new Error(`Método no soportado: ${String(data.method || '')}`);
        }
      } catch (messageError) {
        respond({ error: messageError instanceof Error ? messageError.message : 'Plugin runtime error' });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [permissions]);

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div
        className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border"
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--dome-border)' }}>
          <div>
            <h3 className="text-sm font-semibold text-[var(--dome-text)]">{plugin.name}</h3>
            <p className="text-xs text-[var(--dome-text-muted)]">{entry}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="rounded-lg p-2 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg)]"
              title="Recargar plugin"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg)]"
              title="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-white">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Cargando plugin...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-8 text-sm text-[var(--dome-error)]">
              {error}
            </div>
          ) : (
            <iframe
              key={reloadKey}
              ref={iframeRef}
              title={plugin.name}
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
