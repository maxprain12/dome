import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, Delete02Icon, Key01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { request, type Credential } from '@/lib/manys/api';
import { splitList } from './governanceRules';

const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

/**
 * Sign-in details the Many can use without ever seeing them. The secret is sent once and never comes
 * back; to change it, delete the credential and save it again.
 */
export default function ManyCredentials({ manyId }: { manyId: string }) {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [hosts, setHosts] = useState('');
  const [everyMany, setEveryMany] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await request<{ credentials: Credential[] }>(`/${manyId}/credentials`);
      setCredentials(result.credentials);
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

  const save = async () => {
    const saved = await mutate(() => request(`/${manyId}/credentials`, 'POST', {
      scope: everyMany ? 'all' : 'many',
      label: label.trim(),
      ...(username.trim() ? { username: username.trim() } : {}),
      secret,
      hosts: splitList(hosts),
    }));
    // The secret leaves the form as soon as it is sent, whatever the answer was.
    setSecret('');
    if (saved) {
      setLabel('');
      setUsername('');
      setHosts('');
      setEveryMany(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label={t('manys.access.credentials.title')}>
      <div className={`${labelClass} mb-0`}>{t('manys.access.credentials.title')}</div>
      <p className="text-muted-foreground">{t('manys.access.credentials.intro')}</p>
      {error && (
        <div className="dome-card dome-card-err flex items-center gap-2 px-3 py-2 text-sm">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 grow">{t(`manys.errors.${error}`, { defaultValue: t('manys.errors.request_failed') })}</span>
        </div>
      )}
      {credentials.length === 0 && <p className="text-muted-foreground">{t('manys.access.credentials.none')}</p>}
      {credentials.map((credential) => (
        <div key={credential.id} className="dome-card flex items-start gap-2.5 px-3 py-2.5">
          <HugeiconsIcon icon={Key01Icon} className="mt-0.5 size-[18px] shrink-0" aria-hidden />
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-0 truncate font-medium">{credential.label}</span>
              {credential.many_id === null && <Badge variant="outline">{t('manys.governance.everyMany')}</Badge>}
            </div>
            <span className="truncate text-muted-foreground">{[credential.username, credential.hosts.join(', ')].filter(Boolean).join(' · ')}</span>
            <span className="text-muted-foreground">
              {credential.last_used_at ? t('manys.access.credentials.lastUsed', { when: new Date(credential.last_used_at).toLocaleString() }) : t('manys.access.credentials.neverUsed')}
            </span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            aria-label={t('manys.access.credentials.delete', { name: credential.label })}
            onClick={() => { void mutate(() => request(`/${manyId}/credentials/${credential.id}`, 'DELETE')); }}
          >
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </div>
      ))}
      <form
        className="flex flex-col gap-3"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div>
          <label htmlFor="many-cred-label" className={labelClass}>{t('manys.access.credentials.label')}</label>
          <Input id="many-cred-label" value={label} maxLength={120} required placeholder={t('manys.access.credentials.labelPlaceholder')} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label htmlFor="many-cred-username" className={labelClass}>{t('manys.access.credentials.username')}</label>
          <Input id="many-cred-username" value={username} maxLength={300} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label htmlFor="many-cred-secret" className={labelClass}>{t('manys.access.credentials.secret')}</label>
          <Input id="many-cred-secret" type="password" value={secret} maxLength={4096} required autoComplete="new-password" onChange={(e) => setSecret(e.target.value)} />
          <p className="mt-1.5 text-muted-foreground">{t('manys.access.credentials.secretHint')}</p>
        </div>
        <div>
          <label htmlFor="many-cred-hosts" className={labelClass}>{t('manys.access.credentials.hosts')}</label>
          <Input id="many-cred-hosts" value={hosts} required placeholder="accounts.example.com, *.example.com" onChange={(e) => setHosts(e.target.value)} />
          <p className="mt-1.5 text-muted-foreground">{t('manys.access.credentials.hostsHint')}</p>
        </div>
        <label htmlFor="many-cred-every" className="flex items-center gap-2.5">
          <Switch id="many-cred-every" size="sm" checked={everyMany} onCheckedChange={setEveryMany} />
          {t('manys.governance.allManys')}
        </label>
        <Button type="submit" disabled={busy || !label.trim() || !secret || splitList(hosts).length === 0} className="self-start">{t('manys.access.credentials.save')}</Button>
      </form>
    </section>
  );
}
