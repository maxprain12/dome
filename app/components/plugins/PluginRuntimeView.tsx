import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTabStore } from '@/lib/store/useTabStore';
import PluginContentView from '@/components/plugins/PluginContentView';
import type { DomePluginInfo } from '@/types/plugin';

function bridgeScript(hostOrigin: string) {
  const origin = JSON.stringify(hostOrigin);
  return `<script>(()=>{const pending=new Map();let seq=0;window.DomePlugin={request(method,params={}){const id='dome_'+(++seq);parent.postMessage({source:'dome-plugin',type:'request',id,method,params},${origin});return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}))}};addEventListener('message',event=>{const data=event.data||{};if(data.source!=='dome-host'||!data.id)return;const item=pending.get(data.id);if(!item)return;pending.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data.result)})})();</script>`;
}

function prepareDocument(html: string) {
  const hostOrigin = globalThis.window?.location?.origin || 'null';
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:">`;
  const injected = `${policy}${bridgeScript(hostOrigin)}`;
  return html.includes('</head>') ? html.replace('</head>', `${injected}</head>`) : `${injected}${html}`;
}

export default function PluginRuntimeView({ pluginId }: { pluginId: string }) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [plugin, setPlugin] = useState<DomePluginInfo | null>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    setPlugin(null);
    setSrcDoc('');
    window.electron.plugins.list().then(async (result) => {
      const current = result.data?.find((item) => item.id === pluginId);
      if (!current || !current.enabled) throw new Error(t('plugins.unavailable'));
      if (current.contributes?.vaultTemplate) {
        if (active) setPlugin(current);
        return;
      }
      const asset = await window.electron.plugins.readAsset(current.id, current.entry || 'index.html');
      if (!asset.success || !asset.text) {
        throw new Error(asset.error || t('plugins.entry_missing'));
      }
      if (active) {
        setPlugin(current);
        setSrcDoc(prepareDocument(asset.text));
      }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : t('plugins.unavailable'));
    });
    return () => { active = false; };
  }, [pluginId, reloadKey, t]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data || {};
      if (event.source !== iframeRef.current?.contentWindow || data.source !== 'dome-plugin' || data.type !== 'request') return;
      const response = await window.electron.plugins.request(pluginId, String(data.method || ''), data.params || {});
      iframeRef.current?.contentWindow?.postMessage({
        source: 'dome-host',
        id: data.id,
        ...(response.success ? { result: response.data } : { error: response.error || t('plugins.load_error') }),
      }, 'null');
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [pluginId, t]);

  useEffect(() => window.electron.on('plugin:open-note', (payload: unknown) => {
    const note = payload as { id?: string; title?: string; projectId?: string };
    if (note.id) useTabStore.getState().openNoteTab(note.id, note.title || t('notes.untitled_note'), note.projectId);
  }), [t]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert variant="destructive">
          <AlertTitle>{t('plugins.error_title')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!plugin) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />{t('plugins.loading')}
      </div>
    );
  }
  if (plugin.contributes?.vaultTemplate) {
    return <PluginContentView plugin={plugin} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-sm font-medium">{plugin.name}</span>
        <Badge variant="outline">v{plugin.version}</Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={() => setReloadKey((value) => value + 1)}
          aria-label={t('plugins.reload')}
        >
          <HugeiconsIcon icon={RefreshIcon} />
        </Button>
      </header>
      <iframe key={reloadKey} ref={iframeRef} title={plugin.name} srcDoc={srcDoc} sandbox="allow-scripts" className="min-h-0 flex-1 border-0" />
    </div>
  );
}
