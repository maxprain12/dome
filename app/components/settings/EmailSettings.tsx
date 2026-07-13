import { HugeiconsIcon } from '@hugeicons/react';
import {
  Mail01Icon as Mail,
  Delete02Icon as Trash2,
  Loading03Icon as Loader2,
  CheckmarkCircle02Icon as CheckCircle2,
  PlusSignIcon as Plus,
} from '@hugeicons/core-free-icons';
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

import EmailErrorNotice, { type EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import EmailProviderGuides from '@/components/settings/EmailProviderGuides';
import EmailProviderPicker from '@/components/settings/EmailProviderPicker';
import SettingsPanel from '@/components/settings/SettingsPanel';
import {
  applyProviderPreset,
  EMAIL_PROVIDER_BY_ID,
  type EmailProviderId,
  DEFAULT_ZOHO_REGION,
  type ZohoRegionId,
} from '@/lib/email/providerPresets';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store/useAppStore';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  user_actions?: EmailActionPermissions;
  agent_actions?: EmailActionPermissions;
}

type EmailActionKey = 'list' | 'read' | 'search' | 'send' | 'reply';

interface EmailActionPermissions {
  list: boolean;
  read: boolean;
  search: boolean;
  send: boolean;
  reply: boolean;
}

const DEFAULT_USER_ACTIONS: EmailActionPermissions = {
  list: true,
  read: true,
  search: true,
  send: true,
  reply: true,
};

const DEFAULT_AGENT_ACTIONS: EmailActionPermissions = {
  list: true,
  read: true,
  search: true,
  send: false,
  reply: false,
};

const ACTION_KEYS: EmailActionKey[] = ['list', 'read', 'search', 'send', 'reply'];

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
  user_actions: { ...DEFAULT_USER_ACTIONS },
  agent_actions: { ...DEFAULT_AGENT_ACTIONS },
};

export default function EmailSettings() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [providerId, setProviderId] = useState<EmailProviderId>('custom');
  const [zohoRegion, setZohoRegion] = useState<ZohoRegionId>(DEFAULT_ZOHO_REGION);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EmailErrorInfo | null>(null);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  const load = useCallback(async () => {
    const res = await window.electron.email.listAccounts({ projectId });
    if (res.success) setAccounts((res.accounts as EmailAccount[]) || []);
  }, [projectId]);

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
        zohoRegion,
      ),
    }));
  };

  const handleZohoRegionChange = (nextRegion: ZohoRegionId) => {
    setZohoRegion(nextRegion);
    if (providerId !== 'zoho') return;
    setForm((f) => ({
      ...f,
      ...applyProviderPreset(
        {
          email: f.email,
          username: f.username,
          ...EMAIL_PROVIDER_BY_ID.zoho.servers,
        },
        'zoho',
        nextRegion,
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
    setZohoRegion(DEFAULT_ZOHO_REGION);
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
        user_actions: form.user_actions,
        agent_actions: form.agent_actions,
        projectId,
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
    const res = await window.electron.email.addAccount({
      ...form,
      username: form.username || form.email,
      user_actions: form.user_actions,
      agent_actions: form.agent_actions,
    });
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

  const saveAccountPermissions = async (
    accountId: string,
    user_actions: EmailActionPermissions,
    agent_actions: EmailActionPermissions,
  ) => {
    const res = await window.electron.email.updateAccountPermissions({
      accountId,
      user_actions,
      agent_actions,
    });
    if (res.success) await load();
  };

  return (
    <SettingsPanel>
      <div className="flex items-center gap-2 mb-1">
        <HugeiconsIcon icon={Mail} className="size-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">
          {t('email.settings.title')}
        </h1>
      </div>
      <p className="text-sm mb-6 text-muted-foreground">
        {t('email.settings.description')}
      </p>

      <div className="flex flex-col gap-2 mb-6">
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('email.settings.no_accounts')}
          </p>
        )}
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {acc.display_name || acc.email}
                </div>
                <div className="text-xs text-muted-foreground">
                  {acc.email} · {acc.imap_host}
                  {acc.is_default ? ` · ${t('email.settings.default')}` : ''}
                </div>
              </div>
              <Button variant="ghost"
                type="button"
                onClick={() => handleRemove(acc.id)}
                className="p-2 rounded-md hover:bg-accent"
                title={t('email.settings.remove')}
              >
                <HugeiconsIcon icon={Trash2} className="size-4 text-destructive" />
              </Button>
            </div>
            <EmailPermissionsEditor
              userActions={acc.user_actions ?? DEFAULT_USER_ACTIONS}
              agentActions={acc.agent_actions ?? DEFAULT_AGENT_ACTIONS}
              onChange={(user_actions, agent_actions) => saveAccountPermissions(acc.id, user_actions, agent_actions)}
            />
          </div>
        ))}
      </div>

      {!showForm ? (
        <Button
          type="button"
          onClick={openForm}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <HugeiconsIcon icon={Plus} className="size-4" />
          {t('email.settings.add_account')}
        </Button>
      ) : (
        <div
          className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4"
        >
          <EmailProviderPicker value={providerId} onChange={handleProviderChange} />
          <EmailProviderGuides providerId={providerId} zohoRegion={zohoRegion} />

          <Field label={t('email.settings.email')} value={form.email} onChange={(v) => update('email', v)} placeholder="you@example.com" />
          <Field label={t('email.settings.display_name')} value={form.display_name} onChange={(v) => update('display_name', v)} />
          {providerId === 'zoho' ? (
            <div
              className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-3"
            >
              <ZohoRegionPicker value={zohoRegion} onChange={handleZohoRegionChange} />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={t('email.settings.imap_host')} value={form.imap_host} onChange={(v) => handleServerFieldChange('imap_host', v)} placeholder="imap.example.com" />
                <Field label={t('email.settings.imap_port')} value={String(form.imap_port)} onChange={(v) => handleServerFieldChange('imap_port', Number(v) || 993)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={t('email.settings.smtp_host')} value={form.smtp_host} onChange={(v) => handleServerFieldChange('smtp_host', v)} placeholder="smtp.example.com" />
                <Field label={t('email.settings.smtp_port')} value={String(form.smtp_port)} onChange={(v) => handleServerFieldChange('smtp_port', Number(v) || 465)} />
              </div>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={t('email.settings.imap_host')} value={form.imap_host} onChange={(v) => handleServerFieldChange('imap_host', v)} placeholder="imap.example.com" />
                <Field label={t('email.settings.imap_port')} value={String(form.imap_port)} onChange={(v) => handleServerFieldChange('imap_port', Number(v) || 993)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={t('email.settings.smtp_host')} value={form.smtp_host} onChange={(v) => handleServerFieldChange('smtp_host', v)} placeholder="smtp.example.com" />
                <Field label={t('email.settings.smtp_port')} value={String(form.smtp_port)} onChange={(v) => handleServerFieldChange('smtp_port', Number(v) || 465)} />
              </div>
            </>
          )}
          <Field label={t('email.settings.username')} value={form.username} onChange={(v) => update('username', v)} placeholder={form.email} />
          <Field label={t('email.settings.password')} value={form.password} onChange={(v) => update('password', v)} type="password" />
          <p className="text-xs text-muted-foreground">
            {t('email.settings.app_password_hint')}
          </p>

          <EmailPermissionsEditor
            userActions={form.user_actions}
            agentActions={form.agent_actions}
            onChange={(user_actions, agent_actions) =>
              setForm((f) => ({ ...f, user_actions, agent_actions }))
            }
          />

          <EmailErrorNotice info={error} compact />
          {error?.errorCode === 'app_password_required' && (
            <p className="text-xs text-muted-foreground">
              {t('email.settings.app_password_hint')}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              disabled={busy}
              onClick={handleTest}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
            >
              {testState === 'testing' ? <HugeiconsIcon icon={Loader2} className="size-4 animate-spin" /> : <HugeiconsIcon icon={CheckCircle2} className="size-4" />}
              {t('email.settings.test_and_save')}
            </Button>
            <Button variant="outline"
              type="button"
              disabled={busy}
              onClick={handleAdd}
              className="rounded-md px-3 py-2 text-sm"
            >
              {t('email.settings.save_without_test')}
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}

function EmailPermissionsEditor({
  userActions,
  agentActions,
  onChange,
}: {
  userActions: EmailActionPermissions;
  agentActions: EmailActionPermissions;
  onChange: (user: EmailActionPermissions, agent: EmailActionPermissions) => void;
}) {
  const { t } = useTranslation();

  const toggle = (scope: 'user' | 'agent', key: EmailActionKey, value: boolean) => {
    if (scope === 'user') {
      onChange({ ...userActions, [key]: value }, agentActions);
    } else {
      onChange(userActions, { ...agentActions, [key]: value });
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border bg-background p-3"
    >
      <p className="text-xs font-medium text-foreground">
        {t('email.settings.permissions_title')}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('email.settings.permissions_hint')}
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('email.settings.permissions_action')}</TableHead>
              <TableHead>{t('email.settings.permissions_user')}</TableHead>
              <TableHead>{t('email.settings.permissions_agent')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ACTION_KEYS.map((key) => (
              <TableRow key={key}>
                <TableCell className="text-foreground">
                  {t(`email.settings.permissions_${key}`)}
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={userActions[key]}
                    onCheckedChange={(checked) => toggle('user', key, checked)}
                    aria-label={t('email.settings.permissions_user_aria', { action: t(`email.settings.permissions_${key}`) })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={agentActions[key]}
                    onCheckedChange={(checked) => toggle('agent', key, checked)}
                    aria-label={t('email.settings.permissions_agent_aria', { action: t(`email.settings.permissions_${key}`) })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const ZOHO_REGION_OPTIONS: { id: ZohoRegionId; labelKey: string }[] = [
  { id: 'eu', labelKey: 'email.settings.zoho_region_eu' },
  { id: 'global', labelKey: 'email.settings.zoho_region_global' },
];

function ZohoRegionPicker({
  value,
  onChange,
}: {
  value: ZohoRegionId;
  onChange: (region: ZohoRegionId) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-w-0">
      <span className="text-xs font-medium text-muted-foreground">
        {t('email.settings.zoho_region_label')}
      </span>
      <div
        className="inline-flex gap-1 rounded-lg border bg-card p-0.5"
        role="radiogroup"
        aria-label={t('email.settings.zoho_region_aria')}
      >
        {ZOHO_REGION_OPTIONS.map((opt) => {
          const selected = value === opt.id;
          return (
            <Button variant="ghost"
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.id)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--card)]',
                selected
                  ? 'bg-[color-mix(in srgb, var(--primary) 12%, transparent)] text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(opt.labelKey)}
            </Button>
          );
        })}
      </div>
    </div>
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
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-w-0"
      />
    </label>
  );
}
