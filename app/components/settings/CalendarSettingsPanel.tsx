import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar03Icon as Calendar,
  PlugSocketIcon as Unplug,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/lib/store/useToastStore';
import SubpageHeader from '@/components/shared/SubpageHeader';
import ListState from '@/components/shared/ListState';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { useAppStore } from '@/lib/store/useAppStore';

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
export default function CalendarSettingsPanel() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncAuto, setSyncAuto] = useState(true);
  const [syncInterval, setSyncInterval] = useState(30);
  const [inAppOn, setInAppOn] = useState(true);
  const [leadMin, setLeadMin] = useState(15);
  const [accounts, setAccounts] = useState<Array<{ id: string; account_email: string; status: string }>>([]);

  const load = useCallback(async () => {
    const cal = window.electron?.calendar;
    if (!cal?.getSettings) {
      setLoading(false);
      return;
    }
    try {
      const [st, acc] = await Promise.all([
        cal.getSettings(),
        cal.getGoogleAccounts?.({ projectId }) ?? Promise.resolve({ success: true, accounts: [] }),
      ]);
      if (st.success && st.settings) {
        setSyncAuto(st.settings.sync_auto_enabled !== false);
        setSyncInterval(st.settings.sync_interval_minutes ?? 30);
        setInAppOn(st.settings.in_app_notifications_enabled !== false);
        setLeadMin(st.settings.in_app_reminder_lead_minutes ?? 15);
      }
      if (acc.success && acc.accounts) setAccounts(acc.accounts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const cal = window.electron?.calendar;
    if (!cal?.setSettings) return;
    setSaving(true);
    try {
      const r = await cal.setSettings({
        sync_auto_enabled: syncAuto,
        sync_interval_minutes: syncInterval,
        in_app_notifications_enabled: inAppOn,
        in_app_reminder_lead_minutes: leadMin,
      });
      if (r.success) {
        showToast('success', t('settings.calendar.saved'));
      } else {
        showToast('error', r.error || t('settings.calendar.error_save'));
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('settings.calendar.error_save'));
    } finally {
      setSaving(false);
    }
  };

  const connectGoogle = async () => {
    try {
      const r = await window.electron?.calendar?.connectGoogle?.({ projectId });
      if (r?.success) {
        showToast('success', t('settings.calendar.connected'));
        void load();
      } else if (r?.error) {
        showToast('error', r.error);
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('settings.calendar.error_connect'));
    }
  };

  const disconnect = async (id: string) => {
    try {
      const r = await window.electron?.calendar?.disconnectGoogle?.(id);
      if (r?.success) {
        showToast('success', t('settings.calendar.disconnected'));
        void load();
      } else if (r?.error) {
        showToast('error', r.error);
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('settings.calendar.error_disconnect'));
    }
  };

  if (loading) {
    return <ListState variant="loading" fullHeight loadingLabel={t('common.loading')} />;
  }

  return (
    <SettingsPanel>
      <SubpageHeader className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 mb-2">
        <SubpageHeader.Title>{t('settings.calendar.title')}</SubpageHeader.Title>
        <SubpageHeader.Subtitle>{t('settings.calendar.subtitle')}</SubpageHeader.Subtitle>
        <SubpageHeader.Trailing>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary">
            <HugeiconsIcon icon={Calendar} className="size-5 text-primary-foreground" aria-hidden />
          </div>
        </SubpageHeader.Trailing>
      </SubpageHeader>

      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.calendar.section_google')}</p>
        <Card className="p-4">
          <div className="flex flex-col gap-3">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('settings.calendar.no_accounts')}
              </p>
            ) : (
              accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm truncate text-foreground">
                    {a.account_email}
                  </span>
                  <Button type="button"
  variant="outline"
  onClick={() => void disconnect(a.id)}
  size="xs">{<HugeiconsIcon icon={Unplug} className="size-3.5" />}
                    {t('settings.calendar.disconnect')}
                  </Button>
                </div>
              ))
            )}
            <Button type="button"
  onClick={() => void connectGoogle()}
  size="sm">
              {t('settings.calendar.connect_google')}
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.calendar.section_sync')}</p>
        <Card className="p-4">
          <div className="flex items-start gap-3 mb-4">
            <Switch checked={syncAuto} onCheckedChange={setSyncAuto} size="sm" className="mt-0.5" />
            <span className="text-sm pt-0.5 text-foreground">
              {t('settings.calendar.sync_auto')}
            </span>
          </div>
          <Field className="gap-1.5 max-w-[160px]"><FieldLabel htmlFor="fld-input-7" className="text-xs">{t('settings.calendar.sync_interval')}</FieldLabel><Input id="fld-input-7" type="number" min={5} max={1440} value={String(syncInterval)} onChange={(e) => setSyncInterval(Math.max(5, Math.min(1440, Number(e.target.value) || 30)))} /></Field>
        </Card>
      </div>

      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.calendar.section_notifications')}</p>
        <Card className="p-4">
          <div className="flex items-start gap-3 mb-4">
            <Switch checked={inAppOn} onCheckedChange={setInAppOn} size="sm" className="mt-0.5" />
            <span className="text-sm pt-0.5 text-foreground">
              {t('settings.calendar.in_app_enable')}
            </span>
          </div>
          <Field className="gap-1.5 max-w-[160px]"><FieldLabel htmlFor="fld-input-8" className="text-xs">{t('settings.calendar.in_app_lead')}</FieldLabel><Input id="fld-input-8" type="number" min={1} max={10080} value={String(leadMin)} onChange={(e) => setLeadMin(Math.max(1, Math.min(10080, Number(e.target.value) || 15)))} /></Field>
        </Card>
      </div>

      <Button type="button"
  disabled={saving}
  loading={saving}
  onClick={() => void save()}>
        {t('settings.calendar.save')}
      </Button>
    </SettingsPanel>
  );
}
