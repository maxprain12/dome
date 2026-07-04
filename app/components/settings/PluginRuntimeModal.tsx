'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { DomePluginInfo } from '@/types/plugin';
import DomeButton from '@/components/ui/DomeButton';
import DomeModal from '@/components/ui/DomeModal';

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
            window.parent.postMessage({ source: "dome-plugin", type: "request", id, method, params }, origin);
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

  const pluginLoadKey = `${plugin.id}:${entry}:${reloadKey}`;
  const prevPluginLoadKeyRef = useRef(pluginLoadKey);
  if (pluginLoadKey !== prevPluginLoadKeyRef.current) {
    prevPluginLoadKeyRef.current = pluginLoadKey;
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;

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

      const targetOrigin = event.origin;
      const respond = (payload: { result?: unknown; error?: string }) => {
        iframeRef.current?.contentWindow?.postMessage({
          source: 'dome-host',
          id: data.id,
          ...payload,
        }, targetOrigin);
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
    <DomeModal
      open
      onClose={onClose}
      title={plugin.name}
      subtitle={entry}
      size="full"
      className="!p-0"
      headerActions={
        <DomeButton
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          onClick={() => setReloadKey((value) => value + 1)}
          title="Recargar plugin"
          aria-label="Recargar plugin"
        >
          <RefreshCw className="size-4" />
        </DomeButton>
      }
    >
      <div className="relative h-full min-h-[60vh] bg-[var(--bg)]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--secondary-text)]">
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
            className="size-full border-0"
          />
        )}
      </div>
    </DomeModal>
  );
}
