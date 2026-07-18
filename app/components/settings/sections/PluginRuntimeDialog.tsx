import { useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { Spinner } from '@/components/ui/spinner';
import type { DomePluginInfo } from '@/types/plugin';
import { permissionForPluginMethod } from '@/components/plugins/pluginPermissions';

interface PluginRuntimeDialogProps {
  plugin: DomePluginInfo;
  onClose: () => void;
}

/**
 * Sandboxed runtime for `view` plugins: loads the plugin's entry HTML in an
 * iframe (allow-scripts only) and bridges `DomePlugin.request` calls to the
 * whitelisted host methods, gated by the plugin's declared permissions.
 */

function buildBridgeScript() {
  return `
    <script>
      (() => {
        const pending = new Map();
        let seq = 0;
        window.DomePlugin = {
          request(method, params) {
            const id = "plugin_req_" + (++seq);
            window.parent.postMessage({ source: "dome-plugin", type: "request", id, method, params }, window.origin);
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

export default function PluginRuntimeDialog({ plugin, onClose }: PluginRuntimeDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const permissions = useMemo(() => new Set(plugin.permissions || []), [plugin.permissions]);
  const entry = plugin.entry || 'index.html';

  const pluginLoadKey = `${plugin.id}:${entry}:${reloadKey}`;
  const prevPluginLoadKeyRef = useRef(pluginLoadKey);
  useEffect(() => {
    if (pluginLoadKey === prevPluginLoadKeyRef.current) return;
    prevPluginLoadKeyRef.current = pluginLoadKey;
    setLoading(true);
    setError(null);
  }, [pluginLoadKey]);

  useEffect(() => {
    let cancelled = false;

    void window.electron?.plugins
      ?.readAsset?.(plugin.id, entry)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result?.success || !result.text) {
          throw new Error(result?.error || 'No se pudo cargar el entry HTML del plugin');
        }
        setSrcDoc(injectBridge(result.text));
        setLoading(false);
      })
      .catch((loadError) => {
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
      if (
        data.source !== 'dome-plugin' ||
        data.type !== 'request' ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }

      const respond = (payload: { result?: unknown; error?: string }) => {
        iframeRef.current?.contentWindow?.postMessage(
          {
            source: 'dome-host',
            id: data.id,
            ...payload,
          },
          window.origin,
        );
      };

      try {
        const requiredPermission = permissionForPluginMethod(String(data.method || ''));
        if (requiredPermission && !permissions.has(requiredPermission)) {
          throw new Error(`Permiso ${requiredPermission} requerido`);
        }
        switch (data.method) {
          case 'resources.search':
            respond({ result: await electronDb.resources.search(String(data.params?.query || '')) });
            return;
          case 'resources.list':
            respond({ result: await electronDb.resources.getAll(200) });
            return;
          case 'projects.list':
            respond({ result: await electronDb.projects.getAll() });
            return;
          case 'calendar.upcoming':
            respond({
              result: await window.electron.calendar.getUpcoming({
                windowMinutes: 60 * 24,
                limit: 20,
              }),
            });
            return;
          case 'settings.get':
            respond({ result: await electronDb.settings.get(String(data.params?.key || '')) });
            return;
          default:
            throw new Error(`Método no soportado: ${String(data.method || '')}`);
        }
      } catch (messageError) {
        respond({
          error: messageError instanceof Error ? messageError.message : 'Plugin runtime error',
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [permissions]);

  return (
    <AppModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="xl" className="h-[85vh] sm:max-w-6xl">
        <AppModalHeader
          title={plugin.name}
          description={`${plugin.author} · v${plugin.version} · ${entry}`}
        />
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-4 pb-3">
          {plugin.permissions?.map((permission) => (
            <Badge key={permission} variant="outline">
              {permission}
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setReloadKey((value) => value + 1)}
            title="Recargar plugin"
            aria-label="Recargar plugin"
          >
            <HugeiconsIcon icon={RefreshIcon} />
          </Button>
        </div>
        <AppModalBody className="min-h-0 flex-1">
          <div className="relative h-full min-h-[60vh] overflow-hidden rounded-xl border bg-background">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Cargando plugin...
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center p-8">
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
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
        </AppModalBody>
      </AppModalContent>
    </AppModal>
  );
}
