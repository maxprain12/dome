import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, PlugSocketIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';

export default function CalendarSection() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncAuto, setSyncAuto] = useState(true);
  const [syncInterval, setSyncInterval] = useState(30);
  const [inAppOn, setInAppOn] = useState(true);
  const [leadMin, setLeadMin] = useState(15);
  const [accounts, setAccounts] = useState<
    Array<{ id: string; account_email: string; status: string }>
  >([]);

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
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <SettingsSurface
      icon={Calendar03Icon}
      title={t('settings.calendar.title')}
      description={t('settings.calendar.subtitle')}
      actions={
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          {t('settings.calendar.save')}
        </Button>
      }
    >
      <SettingsGroup
        title={t('settings.calendar.section_google')}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void connectGoogle()}>
            {t('settings.calendar.connect_google')}
          </Button>
        }
      >
        {accounts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {t('settings.calendar.no_accounts')}
          </p>
        ) : (
          accounts.map((a) => (
            <SettingsRow
              key={a.id}
              title={<span className="truncate">{a.account_email}</span>}
              control={
                <Button type="button" variant="outline" size="xs" onClick={() => void disconnect(a.id)}>
                  <HugeiconsIcon icon={PlugSocketIcon} data-icon="inline-start" />
                  {t('settings.calendar.disconnect')}
                </Button>
              }
            />
          ))
        )}
      </SettingsGroup>

      <SettingsGroup title={t('settings.calendar.section_sync')}>
        <SettingsRow
          title={t('settings.calendar.sync_auto')}
          control={
            <Switch
              checked={syncAuto}
              onCheckedChange={setSyncAuto}
              aria-label={t('settings.calendar.sync_auto')}
            />
          }
        />
        <SettingsRow title={t('settings.calendar.sync_interval')} htmlFor="calendar-sync-interval">
          <Field className="max-w-40">
            <FieldLabel htmlFor="calendar-sync-interval" className="sr-only">
              {t('settings.calendar.sync_interval')}
            </FieldLabel>
            <Input
              id="calendar-sync-interval"
              type="number"
              min={5}
              max={1440}
              value={String(syncInterval)}
              onChange={(e) =>
                setSyncInterval(Math.max(5, Math.min(1440, Number(e.target.value) || 30)))
              }
            />
          </Field>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.calendar.section_notifications')}>
        <SettingsRow
          title={t('settings.calendar.in_app_enable')}
          control={
            <Switch
              checked={inAppOn}
              onCheckedChange={setInAppOn}
              aria-label={t('settings.calendar.in_app_enable')}
            />
          }
        />
        <SettingsRow title={t('settings.calendar.in_app_lead')} htmlFor="calendar-lead-min">
          <Field className="max-w-40">
            <FieldLabel htmlFor="calendar-lead-min" className="sr-only">
              {t('settings.calendar.in_app_lead')}
            </FieldLabel>
            <Input
              id="calendar-lead-min"
              type="number"
              min={1}
              max={10080}
              value={String(leadMin)}
              onChange={(e) =>
                setLeadMin(Math.max(1, Math.min(10080, Number(e.target.value) || 15)))
              }
            />
          </Field>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSurface>
  );
}
