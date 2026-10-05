import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, Key01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { request, type Credential } from '@/lib/manys/api';

/**
 * The accesses a Many keeps (a name, the user and the sites; never the secret). The Many asks for them
 * itself, in the conversation, when a site needs one; here they are only seen and removed.
 */
export default function ManyCredentials({ manyId }: { manyId: string }) {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await request<{ credentials: Credential[] }>(`/${manyId}/credentials`);
      setCredentials(result.credentials ?? []);
    } catch {
      /* the list is a convenience: the conversation is where accesses are asked for */
    }
  }, [manyId]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await request(`/${manyId}/credentials/${id}`, 'DELETE');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (credentials.length === 0) return <p className="text-xs text-muted-foreground">{t('manys.access.credentials.none')}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {credentials.map((credential) => (
        <li key={credential.id} className="flex items-center gap-2.5 rounded-xl bg-muted px-3 py-2">
          <HugeiconsIcon icon={Key01Icon} className="size-4 shrink-0" aria-hidden />
          <div className="flex min-w-0 grow flex-col">
            <span className="truncate font-medium">{credential.label}</span>
            <span className="truncate text-xs text-muted-foreground">{[credential.username, credential.hosts.join(', ')].filter(Boolean).join(' · ')}</span>
          </div>
          <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={t('manys.access.credentials.delete', { name: credential.label })} onClick={() => { void remove(credential.id); }}>
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </li>
      ))}
    </ul>
  );
}
