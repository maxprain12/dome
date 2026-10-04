import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, Delete02Icon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { request, type Credential, type McpServer } from '@/lib/manys/api';
import { skillSlug } from './ManySkills';

const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

export function serverHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Remote tool servers. Tools that only read run on their own; every other tool waits for your approval. */
export default function ManyConnections({ manyId }: { manyId: string }) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [everyMany, setEveryMany] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, saved] = await Promise.all([
        request<{ servers: McpServer[] }>(`/${manyId}/mcp`),
        request<{ credentials: Credential[] }>(`/${manyId}/credentials`),
      ]);
      setServers(list.servers);
      setCredentials(saved.credentials);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
    }
  }, [manyId]);
  useEffect(() => { void load(); }, [load]);

  const mutate = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    let created: McpServer | null = null;
    const saved = await mutate(async () => {
      created = await request<McpServer>(`/${manyId}/mcp`, 'POST', {
        scope: everyMany ? 'all' : 'many', name: skillSlug(name), url: url.trim(), ...(credentialId ? { credentialId } : {}),
      });
    });
    if (!saved || !created) return;
    setName('');
    setUrl('');
    setCredentialId('');
    setEveryMany(false);
    // Reading the tool list is its own step so a server that is down is still saved and can be retried.
    await mutate(() => request(`/${manyId}/mcp/${(created as McpServer).id}/refresh`, 'POST', {}));
  };

  return (
    <section className="flex flex-col gap-3" aria-label={t('manys.access.connections.title')}>
      <div className={`${labelClass} mb-0`}>{t('manys.access.connections.title')}</div>
      <p className="text-muted-foreground">{t('manys.access.connections.intro')}</p>
      {error && (
        <div className="dome-card dome-card-err flex items-center gap-2 px-3 py-2 text-sm">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 grow">{t(`manys.errors.${error}`, { defaultValue: t('manys.errors.request_failed') })}</span>
        </div>
      )}
      {servers.length === 0 && <p className="text-muted-foreground">{t('manys.access.connections.none')}</p>}
      {servers.map((server) => {
        const reads = server.tools.filter((tool) => tool.readOnly).length;
        return (
          <div key={server.id} className="dome-card flex items-start gap-2.5 px-3 py-2.5">
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-0 truncate font-medium">{server.name}</span>
                {server.many_id === null && <Badge variant="outline">{t('manys.governance.everyMany')}</Badge>}
                {server.credential_id && <Badge variant="outline">{t('manys.access.connections.signedIn')}</Badge>}
              </div>
              <span className="truncate text-muted-foreground">{serverHost(server.url)}</span>
              <span className="text-muted-foreground">
                {server.tools_refreshed_at
                  ? t('manys.access.connections.tools', { count: server.tools.length, reads })
                  : t('manys.access.connections.notRead')}
              </span>
            </div>
            <Switch
              size="sm"
              checked={server.enabled}
              disabled={busy}
              aria-label={t('manys.access.connections.enable', { name: server.name })}
              onCheckedChange={(checked) => { void mutate(() => request(`/${manyId}/mcp/${server.id}`, 'PATCH', { enabled: checked })); }}
            />
            <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={t('manys.access.connections.refresh', { name: server.name })} onClick={() => { void mutate(() => request(`/${manyId}/mcp/${server.id}/refresh`, 'POST', {})); }}>
              <HugeiconsIcon icon={Refresh01Icon} />
            </Button>
            <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={t('manys.access.connections.delete', { name: server.name })} onClick={() => { void mutate(() => request(`/${manyId}/mcp/${server.id}`, 'DELETE')); }}>
              <HugeiconsIcon icon={Delete02Icon} />
            </Button>
          </div>
        );
      })}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void connect();
        }}
      >
        <div>
          <label htmlFor="many-mcp-name" className={labelClass}>{t('manys.access.connections.name')}</label>
          <Input id="many-mcp-name" value={name} maxLength={40} required placeholder="crm" onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="many-mcp-url" className={labelClass}>{t('manys.access.connections.url')}</label>
          <Input id="many-mcp-url" type="url" value={url} maxLength={500} required placeholder="https://mcp.example.com/mcp" onChange={(e) => setUrl(e.target.value)} />
          <p className="mt-1.5 text-muted-foreground">{t('manys.access.connections.urlHint')}</p>
        </div>
        <div>
          <label htmlFor="many-mcp-credential" className={labelClass}>{t('manys.access.connections.credential')}</label>
          <select
            id="many-mcp-credential"
            value={credentialId}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            onChange={(e) => setCredentialId(e.target.value)}
          >
            <option value="">{t('manys.access.connections.noCredential')}</option>
            {credentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.label}</option>)}
          </select>
          <p className="mt-1.5 text-muted-foreground">{t('manys.access.connections.credentialHint')}</p>
        </div>
        <label htmlFor="many-mcp-every" className="flex items-center gap-2.5">
          <Switch id="many-mcp-every" size="sm" checked={everyMany} onCheckedChange={setEveryMany} />
          {t('manys.governance.allManys')}
        </label>
        <Button type="submit" disabled={busy || !skillSlug(name) || !url.trim()} className="self-start">{t('manys.access.connections.connect')}</Button>
      </form>
    </section>
  );
}
