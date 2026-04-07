import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Loader2, Unplug } from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';

const DOME_GREEN = '#596037';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

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
    return (
      <div className="flex items-center justify-center py-24" style={{ color: 'var(--dome-text-muted)' }}>
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: DOME_GREEN }}>
          <Calendar className="w-5 h-5" style={{ color: '#E0EAB4' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            {t('settings.calendar.title')}
          </h2>
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.calendar.subtitle')}
          </p>
        </div>
      </div>

      <div>
        <SectionLabel>{t('settings.calendar.section_google')}</SectionLabel>
        <SettingsCard>
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
                  <button
                    type="button"
                    onClick={() => void disconnect(a.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border shrink-0"
                    style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    {t('settings.calendar.disconnect')}
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={() => void connectGoogle()}
              className="text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-accent-fg)' }}
            >
              {t('settings.calendar.connect_google')}
            </button>
          </div>
        </SettingsCard>
      </div>

      <div>
        <SectionLabel>{t('settings.calendar.section_sync')}</SectionLabel>
        <SettingsCard>
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input type="checkbox" checked={syncAuto} onChange={(e) => setSyncAuto(e.target.checked)} />
            <span className="text-sm" style={{ color: 'var(--dome-text)' }}>
              {t('settings.calendar.sync_auto')}
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.calendar.sync_interval')}
            </label>
            <input
              type="number"
              min={5}
              max={1440}
              value={syncInterval}
              onChange={(e) => setSyncInterval(Math.max(5, Math.min(1440, Number(e.target.value) || 30)))}
              className="rounded-lg border px-3 py-2 text-sm max-w-[120px]"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
            />
          </div>
        </SettingsCard>
      </div>

      <div>
        <SectionLabel>{t('settings.calendar.section_notifications')}</SectionLabel>
        <SettingsCard>
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input type="checkbox" checked={inAppOn} onChange={(e) => setInAppOn(e.target.checked)} />
            <span className="text-sm" style={{ color: 'var(--dome-text)' }}>
              {t('settings.calendar.in_app_enable')}
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.calendar.in_app_lead')}
            </label>
            <input
              type="number"
              min={1}
              max={10080}
              value={leadMin}
              onChange={(e) => setLeadMin(Math.max(1, Math.min(10080, Number(e.target.value) || 15)))}
              className="rounded-lg border px-3 py-2 text-sm max-w-[120px]"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
            />
          </div>
        </SettingsCard>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        style={{ background: DOME_GREEN, color: '#E0EAB4' }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {t('settings.calendar.save')}
      </button>
    </div>
  );
}
