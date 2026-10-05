import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { splitList } from './credentialHosts';

const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

export interface CredentialInput {
  label: string;
  username: string;
  secret: string;
  hosts: string[];
  everyMany: boolean;
}

interface Props {
  /** What the agent suggested for the form: a name and the sites the access is for. The person can change it. */
  defaults?: { label?: string; hosts?: string };
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: CredentialInput) => void | Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
}

/**
 * Sign-in details to keep for a Many. The secret leaves the field as soon as it is sent, whatever the
 * answer was; the Many never sees it, it is only typed on the sites listed here.
 */
export default function ManyCredentialForm({ defaults, busy, submitLabel, onSubmit, onCancel, cancelLabel }: Props) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(defaults?.label ?? '');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [hosts, setHosts] = useState(defaults?.hosts ?? '');
  const [everyMany, setEveryMany] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        const input = { label: label.trim(), username: username.trim(), secret, hosts: splitList(hosts), everyMany };
        setSecret('');
        void onSubmit(input);
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
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy || !label.trim() || !secret || splitList(hosts).length === 0}>{submitLabel}</Button>
        {onCancel && <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>}
      </div>
    </form>
  );
}
