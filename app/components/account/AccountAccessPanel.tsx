import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AccountForm from './AccountForm';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { useDomeSession } from '@/lib/hooks/useDomeSession';
import { useUserStore } from '@/lib/store/useUserStore';
import { SettingsGroup } from '@/components/settings/blocks';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

export default function AccountAccessPanel() {
  const { t } = useTranslation();
  const access = useCloudEntitlements();
  const session = useDomeSession();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function manage(disconnect = false) {
    setBusy(true); setFailed(false);
    try {
      const result = disconnect ? await window.electron.domeAuth.disconnect() : await window.electron.domeAuth.openDashboard();
      if (!result.success) throw new Error('action_failed');
      if (disconnect) { await session.refresh(); await access.refresh(); }
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  return <SettingsGroup title={t('access.title')}>
    <div className="flex flex-col gap-5 p-4">
      {access.loading || session.loading ? <div role="status" className="flex items-center gap-2"><Spinner />{t('access.checking')}</div> : <>
        <div><h3 className="text-xl font-semibold">{t(access.error ? 'access.unavailable' : `access.tiers.${access.tier}.title`)}</h3><p className="mt-1 text-sm text-muted-foreground">{access.error ? t('access.retry_hint') : t(`access.tiers.${access.tier}.description`)}</p>{access.planName && <p className="mt-2 text-sm">{access.planName}</p>}</div>
        {failed && <Alert variant="destructive"><AlertDescription>{t('access.action_error')}</AlertDescription></Alert>}
        {!showForm && <div className="flex flex-wrap gap-2">
          {access.error && <Button variant="outline" onClick={() => { void access.refresh(); }}>{t('access.retry')}</Button>}
          {session.connected ? <>
            <Button disabled={busy} onClick={() => { void manage(); }}>{t('access.manage')}</Button>
            <Button variant="outline" disabled={busy} onClick={() => { void manage(true); }}>{t('access.disconnect')}</Button>
          </> : <Button onClick={() => setShowForm(true)}>{t('access.connect')}</Button>}
        </div>}
        <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium focus-visible:outline-ring">{t('settingsGuide.access_details')}</summary>
        <p className="my-3 text-sm leading-relaxed text-muted-foreground">{t('access.editions_separate')}</p>
        <dl className="grid gap-4 sm:grid-cols-3">
          {(['local', 'account', 'subscription'] as const).map((tier) => <div key={tier}><dt className="text-sm font-medium">{t(`access.tiers.${tier}.title`)}</dt><dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(`access.tiers.${tier}.description`)}</dd></div>)}
        </dl></details>
      </>}
        {showForm && <AccountForm onCancel={() => setShowForm(false)} onConnected={async (identity) => {
          await useUserStore.getState().updateUserProfile({ name: identity.name ?? '', email: identity.email ?? '' });
          setShowForm(false); await session.refresh(); await access.refresh();
        }} />}
    </div>
  </SettingsGroup>;
}
