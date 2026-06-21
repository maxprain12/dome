import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Trash2, Loader2, CheckCircle2, Plus } from 'lucide-react';
import EmailErrorNotice, { type EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import EmailProviderGuides from '@/components/settings/EmailProviderGuides';
import EmailProviderPicker from '@/components/settings/EmailProviderPicker';
import SettingsPanel from '@/components/settings/SettingsPanel';
import {
  applyProviderPreset,
  EMAIL_PROVIDER_BY_ID,
  type EmailProviderId,
} from '@/lib/email/providerPresets';

interface EmailAccount {
  id: string;
  email: string;
  display_name?: string;
  imap_host: string;
  smtp_host: string;
  username: string;
  is_default?: boolean;
  status?: string;
  secret_masked?: string | null;
}

const EMPTY_FORM = {
  email: '',
  display_name: '',
  imap_host: '',
  imap_port: 993,
  imap_encryption: 'tls',
  smtp_host: '',
  smtp_port: 465,
  smtp_encryption: 'tls',
  username: '',
  password: '',
};

export default function EmailSettings() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [providerId, setProviderId] = useState<EmailProviderId>('custom');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EmailErrorInfo | null>(null);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  const load = useCallback(async () => {
    const res = await window.electron.email.listAccounts();
    if (res.success) setAccounts((res.accounts as EmailAccount[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: string, value: string | number) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'email' && !f.username) {
        next.username = String(value);
      }
      return next;
    });
  };

  const handleProviderChange = (nextProviderId: EmailProviderId) => {
    setProviderId(nextProviderId);
    setForm((f) => ({
      ...f,
      ...applyProviderPreset(
        {
          email: f.email,
          username: f.username,
          ...EMAIL_PROVIDER_BY_ID[nextProviderId].servers,
        },
        nextProviderId,
      ),
    }));
  };

  const handleServerFieldChange = (key: string, value: string | number) => {
    if (providerId !== 'custom' && (key === 'imap_host' || key === 'smtp_host' || key === 'imap_port' || key === 'smtp_port')) {
      setProviderId('custom');
    }
    update(key, value);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setProviderId('custom');
    setError(null);
    setTestState('idle');
  };

  const openForm = () => {
    resetForm();
    setShowForm(true);
  };

  const handleAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.electron.email.addAccount({
        ...form,
        username: form.username || form.email,
      });
      if (!res.success) {
        setError({ error: res.error || t('email.settings.add_failed'), errorCode: res.errorCode, helpUrl: res.helpUrl });
        return;
      }
      resetForm();
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    await window.electron.email.removeAccount(id);
    await load();
  };

  const handleTest = async () => {
    setTestState('testing');
    setError(null);
    if (!form.email || !form.imap_host || !form.smtp_host) {
      setError({ error: t('email.settings.required_fields') });
      setTestState('fail');
      return;
    }
    const res = await window.electron.email.addAccount({ ...form, username: form.username || form.email });
    if (!res.success) {
      setError({ error: res.error || t('email.settings.add_failed'), errorCode: res.errorCode, helpUrl: res.helpUrl });
      setTestState('fail');
      return;
    }
    const test = await window.electron.email.testConnection(res.accountId);
    if (test.success) {
      setTestState('ok');
      resetForm();
      setShowForm(false);
    } else {
      setError({ error: test.error || t('email.settings.test_failed'), errorCode: test.errorCode, helpUrl: test.helpUrl });
      setTestState('fail');
      if (res.accountId) await window.electron.email.removeAccount(res.accountId);
    }
    await load();
  };

  return (
    <SettingsPanel>
      <div className="flex items-center gap-2 mb-1">
        <Mail className="size-5" style={{ color: 'var(--dome-accent)' }} />
        <h1 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
          {t('email.settings.title')}
        </h1>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--dome-text-muted)' }}>
        {t('email.settings.description')}
      </p>

      <div className="space-y-2 mb-6">
        {accounts.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('email.settings.no_accounts')}
          </p>
        )}
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="settings-split-row rounded-lg px-4 py-3"
            style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                {acc.display_name || acc.email}
              </div>
              <div className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {acc.email} · {acc.imap_host}
                {acc.is_default ? ` · ${t('email.settings.default')}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(acc.id)}
              className="p-2 rounded-md hover:bg-[var(--dome-bg-hover)]"
              title={t('email.settings.remove')}
            >
              <Trash2 className="size-4" style={{ color: 'var(--dome-error)' }} />
            </button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={openForm}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
          style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)' }}
        >
          <Plus className="size-4" />
          {t('email.settings.add_account')}
        </button>
      ) : (
        <div
          className="rounded-lg p-4 space-y-4 min-w-0"
          style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
        >
          <EmailProviderPicker value={providerId} onChange={handleProviderChange} />
          <EmailProviderGuides providerId={providerId} />

          <Field label={t('email.settings.email')} value={form.email} onChange={(v) => update('email', v)} placeholder="you@example.com" />
          <Field label={t('email.settings.display_name')} value={form.display_name} onChange={(v) => update('display_name', v)} />
          <div className="settings-field-grid settings-field-grid--2 gap-3">
            <Field label={t('email.settings.imap_host')} value={form.imap_host} onChange={(v) => handleServerFieldChange('imap_host', v)} placeholder="imap.example.com" />
            <Field label={t('email.settings.imap_port')} value={String(form.imap_port)} onChange={(v) => handleServerFieldChange('imap_port', Number(v) || 993)} />
          </div>
          <div className="settings-field-grid settings-field-grid--2 gap-3">
            <Field label={t('email.settings.smtp_host')} value={form.smtp_host} onChange={(v) => handleServerFieldChange('smtp_host', v)} placeholder="smtp.example.com" />
            <Field label={t('email.settings.smtp_port')} value={String(form.smtp_port)} onChange={(v) => handleServerFieldChange('smtp_port', Number(v) || 465)} />
          </div>
          <Field label={t('email.settings.username')} value={form.username} onChange={(v) => update('username', v)} placeholder={form.email} />
          <Field label={t('email.settings.password')} value={form.password} onChange={(v) => update('password', v)} type="password" />
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {t('email.settings.app_password_hint')}
          </p>

          <EmailErrorNotice info={error} compact />
          {error?.errorCode === 'app_password_required' && (
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('email.settings.app_password_hint')}
            </p>
          )}

          <div className="settings-action-row pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={handleTest}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)', opacity: busy ? 0.6 : 1 }}
            >
              {testState === 'testing' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {t('email.settings.test_and_save')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleAdd}
              className="px-3 py-2 rounded-md text-sm"
              style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            >
              {t('email.settings.save_without_test')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-3 py-2 rounded-md text-sm"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-w-0 rounded-md px-3 py-2 text-sm"
        style={{
          background: 'var(--dome-bg)',
          border: '1px solid var(--dome-border)',
          color: 'var(--dome-text)',
        }}
      />
    </label>
  );
}
