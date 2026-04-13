import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Unplug } from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeButton from '@/components/ui/DomeButton';
import DomeToggle from '@/components/ui/DomeToggle';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeListState from '@/components/ui/DomeListState';

export default function CalendarSettingsPanel() {
  const { t } = useTranslation();
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
      const [st, acc] = await Promise.all([cal.getSettings(), cal.getGoogleAccounts?.() ?? Promise.resolve({ success: true, accounts: [] })]);
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
  }, []);

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
      const r = await window.electron?.calendar?.connectGoogle?.();
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
    return <DomeListState variant="loading" fullHeight loadingLabel={t('common.loading')} />;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <DomeSubpageHeader
        title={t('settings.calendar.title')}
        subtitle={t('settings.calendar.subtitle')}
        trailing={
          <DomeIconBox size="md" className="!w-10 !h-10" background="var(--accent)">
            <Calendar className="w-5 h-5 text-[var(--base-text)]" aria-hidden />
          </DomeIconBox>
        }
        className="rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"
      />

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.calendar.section_google')}</DomeSectionLabel>
        <DomeCard>
          <div className="space-y-3">
            {accounts.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.calendar.no_accounts')}
              </p>
            ) : (
              accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm truncate" style={{ color: 'var(--dome-text)' }}>
                    {a.account_email}
                  </span>
                  <DomeButton
                    type="button"
                    variant="outline"
                    size="xs"
                    leftIcon={<Unplug className="w-3.5 h-3.5" />}
                    onClick={() => void disconnect(a.id)}
                  >
                    {t('settings.calendar.disconnect')}
                  </DomeButton>
                </div>
              ))
            )}
            <DomeButton type="button" variant="primary" size="sm" onClick={() => void connectGoogle()}>
              {t('settings.calendar.connect_google')}
            </DomeButton>
          </div>
        </DomeCard>
      </div>

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.calendar.section_sync')}</DomeSectionLabel>
        <DomeCard>
          <div className="flex items-start gap-3 mb-4">
            <DomeToggle checked={syncAuto} onChange={setSyncAuto} size="sm" className="mt-0.5" />
            <span className="text-sm pt-0.5" style={{ color: 'var(--dome-text)' }}>
              {t('settings.calendar.sync_auto')}
            </span>
          </div>
          <DomeInput
            label={t('settings.calendar.sync_interval')}
            type="number"
            min={5}
            max={1440}
            value={String(syncInterval)}
            onChange={(e) => setSyncInterval(Math.max(5, Math.min(1440, Number(e.target.value) || 30)))}
            className="max-w-[160px]"
          />
        </DomeCard>
      </div>

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.calendar.section_notifications')}</DomeSectionLabel>
        <DomeCard>
          <div className="flex items-start gap-3 mb-4">
            <DomeToggle checked={inAppOn} onChange={setInAppOn} size="sm" className="mt-0.5" />
            <span className="text-sm pt-0.5" style={{ color: 'var(--dome-text)' }}>
              {t('settings.calendar.in_app_enable')}
            </span>
          </div>
          <DomeInput
            label={t('settings.calendar.in_app_lead')}
            type="number"
            min={1}
            max={10080}
            value={String(leadMin)}
            onChange={(e) => setLeadMin(Math.max(1, Math.min(10080, Number(e.target.value) || 15)))}
            className="max-w-[160px]"
          />
        </DomeCard>
      </div>

      <DomeButton
        type="button"
        variant="primary"
        disabled={saving}
        loading={saving}
        onClick={() => void save()}
      >
        {t('settings.calendar.save')}
      </DomeButton>
    </div>
  );
}
