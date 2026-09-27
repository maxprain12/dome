import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useCloudEntitlements, type CloudFeature } from '@/lib/hooks/useCloudEntitlements';
import { featureAccess } from '@/lib/account/access';
import { useTabStore } from '@/lib/store/useTabStore';

/** Explain a denied capability without mounting or enabling the protected controls. */
export function FeatureAccessNotice({ feature }: { feature: CloudFeature }) {
  const { t } = useTranslation();
  const access = useCloudEntitlements();
  const decision = featureAccess(access, feature);
  const [failed, setFailed] = useState(false);
  if (decision === 'allowed') return null;
  if (decision === 'loading') return <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Spinner />{t('access.checking')}</p>;
  async function act() {
    setFailed(false);
    if (decision === 'unavailable') { await access.refresh(); return; }
    if (decision === 'account_required') { useSettingsUiStore.getState().setActiveSection('general'); useTabStore.getState().openSettingsTab(); return; }
    try {
      const result = await window.electron.domeAuth.openDashboard();
      if (!result.success) setFailed(true);
    } catch { setFailed(true); }
  }
  return <Alert>
    <AlertTitle>{t(`access.${decision}`)}</AlertTitle>
    <AlertDescription>
      <p>{t('access.requirement', { feature: t(`access.features.${feature}`) })}</p>
      <p>{t('access.local_unaffected')}</p>
      {failed && <p role="alert">{t('access.action_error')}</p>}
      <Button variant="outline" size="sm" onClick={() => { void act(); }}>{t(decision === 'unavailable' ? 'access.retry' : decision === 'account_required' ? 'access.connect' : 'access.manage')}</Button>
    </AlertDescription>
  </Alert>;
}
