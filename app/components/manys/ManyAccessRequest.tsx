import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ManyCredentialForm, { type CredentialInput } from './ManyCredentialForm';

interface Props {
  /** What the agent asked for: the name of the access and the sites it is for. */
  request: { label: string; hosts: string[] };
  /** Why the agent needs it, in its own words. */
  reason: string | null;
  busy: boolean;
  onSave: (input: CredentialInput) => void | Promise<void>;
  onDecline: () => void;
}

/**
 * The agent hit a sign-in it has no access for and asked for one it can keep. The person types the
 * username and password here, into a private form; they go straight to the vault and the agent only
 * ever gets to type them on the sites listed.
 */
export default function ManyAccessRequest({ request, reason, busy, onSave, onDecline }: Props) {
  const { t } = useTranslation();
  return (
    <section className="dome-card flex flex-col gap-3 p-4 sm:ml-9" aria-label={t('manys.access.request.title', { name: request.label })}>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{t('manys.access.request.title', { name: request.label })}</h3>
        {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
        <p className="text-xs text-muted-foreground">{t('manys.access.request.private')}</p>
      </div>
      <ManyCredentialForm
        defaults={{ label: request.label, hosts: request.hosts.join(', ') }}
        busy={busy}
        submitLabel={t('manys.access.request.save')}
        onSubmit={onSave}
      />
      <Button type="button" variant="ghost" size="sm" className="self-start" disabled={busy} onClick={onDecline}>{t('manys.access.request.decline')}</Button>
    </section>
  );
}
