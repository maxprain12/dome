import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTabStore } from '@/lib/store/useTabStore';
import type { DomePluginInfo } from '@/types/plugin';

function bridgeScript() {
  return `<script>(()=>{const pending=new Map();let seq=0;window.DomePlugin={request(method,params={}){const id='dome_'+(++seq);parent.postMessage({source:'dome-plugin',type:'request',id,method,params},'*');return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}))}};addEventListener('message',event=>{const data=event.data||{};if(data.source!=='dome-host'||!data.id)return;const item=pending.get(data.id);if(!item)return;pending.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data.result)})})();</script>`;
}

function prepareDocument(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:">`;
  const injected = `${policy}${bridgeScript()}`;
  return html.includes('</head>') ? html.replace('</head>', `${injected}</head>`) : `${injected}${html}`;
}

export default function PluginRuntimeView({ pluginId }: { pluginId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [plugin, setPlugin] = useState<DomePluginInfo | null>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void window.electron.plugins.list().then(async (result) => {
      const current = result.data?.find((item) => item.id === pluginId);
      if (!current || !current.enabled) throw new Error('Plugin unavailable or disabled');
      const asset = await window.electron.plugins.readAsset(current.id, current.entry || 'index.html');
      if (!asset.success || !asset.text) {
        throw new Error(asset.error || 'Plugin entry could not be loaded');
      }
      if (active) {
        setPlugin(current);
        setSrcDoc(prepareDocument(asset.text));
      }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Plugin could not be loaded');
    });
    return () => { active = false; };
  }, [pluginId, reloadKey]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data || {};
      if (event.source !== iframeRef.current?.contentWindow || data.source !== 'dome-plugin' || data.type !== 'request') return;
      const response = await window.electron.plugins.request(pluginId, String(data.method || ''), data.params || {});
      iframeRef.current?.contentWindow?.postMessage({
        source: 'dome-host',
        id: data.id,
        ...(response.success ? { result: response.data } : { error: response.error || 'Plugin request failed' }),
      }, '*');
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [pluginId]);

  useEffect(() => window.electron.on('plugin:open-note', (payload: unknown) => {
    const note = payload as { id?: string; title?: string; projectId?: string };
    if (note.id) useTabStore.getState().openNoteTab(note.id, note.title || 'Note', note.projectId);
  }), []);

  if (error) {
    return <div className="flex h-full items-center justify-center p-8"><Alert variant="destructive"><AlertTitle>Plugin error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>;
  }
  if (!plugin || !srcDoc) {
    return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner />Loading plugin…</div>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-sm font-medium">{plugin.name}</span>
        <Badge variant="outline">v{plugin.version}</Badge>
        <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setReloadKey((value) => value + 1)} aria-label="Reload plugin">
          <HugeiconsIcon icon={RefreshIcon} />
        </Button>
      </header>
      <iframe key={reloadKey} ref={iframeRef} title={plugin.name} srcDoc={srcDoc} sandbox="allow-scripts" className="min-h-0 flex-1 border-0" />
    </div>
  );
}
