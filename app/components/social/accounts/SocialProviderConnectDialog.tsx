import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, Key01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { SocialAccount, SocialProvider } from '@/components/social/socialTypes';
import { SocialMessagingFlags } from '@/components/social/accounts/SocialMessagingFlags';

export interface SocialProviderStatus {
  provider: SocialProvider;
  clientId: string;
  hasClientSecret: boolean;
  supportsManualToken: boolean;
  requiresMedia: boolean;
  redirectUri: string;
  orgEnabled?: boolean;
  commentsEnabled?: boolean;
  dmEnabled?: boolean;
}

export const SOCIAL_PROVIDER_NAMES: Record<SocialProvider, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
};

export function SocialProviderConnectDialog({
  provider,
  accounts,
  onClose,
  onChanged,
}: {
  provider: SocialProviderStatus | null;
  accounts: SocialAccount[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [token, setToken] = useState('');
  const [orgEnabled, setOrgEnabled] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [dmEnabled, setDmEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedSecret, setHasSavedSecret] = useState(false);

  useEffect(() => {
    setError(null);
    setHasSavedSecret(Boolean(provider?.hasClientSecret));
    setClientId(provider?.clientId ?? '');
    setClientSecret('');
    setToken('');
    setOrgEnabled(Boolean(provider?.orgEnabled));
    setCommentsEnabled(Boolean(provider?.commentsEnabled));
    setDmEnabled(Boolean(provider?.dmEnabled));
  }, [provider]);

  if (!provider) return null;

  const saveConfig = async () => {
    const payload: Record<string, string | boolean> = {
      provider: provider.provider,
      clientId: clientId.trim(),
    };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
    if (provider.provider === 'linkedin') payload.orgEnabled = orgEnabled;
    if (provider.provider === 'instagram') {
      payload.commentsEnabled = commentsEnabled;
      payload.dmEnabled = dmEnabled;
    }
    if (provider.provider === 'x') payload.dmEnabled = dmEnabled;
    const response = await window.electron.invoke('social:providers:set-config', payload);
    if (!response?.success) throw new Error(response?.error || 'Error');
    if (clientSecret.trim()) setHasSavedSecret(true);
    setClientSecret('');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const connectOAuth = () => {
    run(async () => {
      await saveConfig();
      const response = await window.electron.invoke('social:connect-oauth', { provider: provider.provider });
      if (!response?.success) throw new Error(response?.error || 'Error');
      onClose();
    }).catch(() => undefined);
  };

  const connectToken = () => {
    run(async () => {
      const response = await window.electron.invoke('social:connect-token', {
        provider: provider.provider,
        accessToken: token.trim(),
      });
      if (!response?.success) throw new Error(response?.error || 'Error');
      setToken('');
      onClose();
    }).catch(() => undefined);
  };

  const syncOrganizations = () => {
    run(async () => {
      for (const member of accounts.filter((account) => account.accountKind === 'member' && account.status === 'active')) {
        const response = await window.electron.invoke('social:linkedin:sync-orgs', { accountId: member.id });
        if (!response?.success) throw new Error(response?.error || 'Error');
      }
    }).catch(() => undefined);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('social.studio.accounts.configure', { provider: SOCIAL_PROVIDER_NAMES[provider.provider] })}</DialogTitle>
          <DialogDescription>{t(`social.settings.hint_${provider.provider}`)}</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <p className="text-sm text-muted-foreground">{t('social.studio.accounts.multi_account_hint')}</p>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`studio-client-id-${provider.provider}`}>{t('social.settings.client_id')}</FieldLabel>
            <Input id={`studio-client-id-${provider.provider}`} value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`studio-client-secret-${provider.provider}`}>{t('social.settings.client_secret')}</FieldLabel>
            <Input
              id={`studio-client-secret-${provider.provider}`}
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={hasSavedSecret ? t('social.settings.secret_saved') : undefined}
            />
          </Field>
          <Field>
            <FieldLabel>{t('social.settings.redirect_uri')}</FieldLabel>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{provider.redirectUri}</code>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => navigator.clipboard?.writeText(provider.redirectUri)}>
                <HugeiconsIcon icon={Copy01Icon} />
                <span className="sr-only">{t('social.settings.copy')}</span>
              </Button>
            </div>
          </Field>
          {provider.provider === 'linkedin' ? (
            <Field orientation="horizontal">
              <Checkbox checked={orgEnabled} onCheckedChange={(checked) => setOrgEnabled(checked === true)} />
              <div className="flex flex-col gap-0.5">
                <FieldLabel>{t('social.settings.linkedin_org_enabled')}</FieldLabel>
                <FieldDescription>{t('social.settings.linkedin_org_hint')}</FieldDescription>
              </div>
            </Field>
          ) : null}
          <SocialMessagingFlags
            provider={provider.provider}
            commentsEnabled={commentsEnabled}
            dmEnabled={dmEnabled}
            onCommentsChange={setCommentsEnabled}
            onDmChange={setDmEnabled}
          />
          {provider.supportsManualToken ? (
            <Field>
              <FieldLabel htmlFor={`studio-token-${provider.provider}`}>{t('social.settings.connect_token')}</FieldLabel>
              <div className="flex gap-2">
                <Input id={`studio-token-${provider.provider}`} type="password" value={token} onChange={(event) => setToken(event.target.value)} />
                <Button type="button" variant="outline" onClick={connectToken} disabled={busy || !token.trim()}>
                  <HugeiconsIcon icon={Key01Icon} data-icon="inline-start" />
                  {t('social.settings.connect')}
                </Button>
              </div>
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          {provider.provider === 'linkedin' && accounts.some((account) => account.accountKind === 'member') ? (
            <Button type="button" variant="ghost" onClick={syncOrganizations} disabled={busy}>
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
              {t('social.settings.linkedin_sync_orgs')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => { run(saveConfig).catch(() => undefined); }} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t('social.settings.save')}
          </Button>
          <Button type="button" onClick={connectOAuth} disabled={busy || !clientId.trim() || (provider.provider !== 'x' && !hasSavedSecret && !clientSecret.trim())}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t('social.settings.connect_oauth')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
