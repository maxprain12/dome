import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  Delete02Icon,
  ExternalLinkIcon,
  HelpCircleIcon,
  InformationCircleIcon,
  Mail01Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import EmailErrorNotice, { type EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import {
  applyProviderPreset,
  DEFAULT_ZOHO_REGION,
  EMAIL_PROVIDER_BY_ID,
  EMAIL_PROVIDER_PRESETS,
  getZohoGuides,
  type EmailProviderId,
  type ZohoRegionId,
} from '@/lib/email/providerPresets';
import { useAppStore } from '@/lib/store/useAppStore';

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
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <p className="text-xs font-medium">{t('email.settings.permissions_title')}</p>
      <p className="text-xs text-muted-foreground">{t('email.settings.permissions_hint')}</p>
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
                <TableCell>{t(`email.settings.permissions_${key}`)}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={userActions[key]}
                    onCheckedChange={(checked) => toggle('user', key, checked)}
                    aria-label={t('email.settings.permissions_user_aria', {
                      action: t(`email.settings.permissions_${key}`),
                    })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={agentActions[key]}
                    onCheckedChange={(checked) => toggle('agent', key, checked)}
                    aria-label={t('email.settings.permissions_agent_aria', {
                      action: t(`email.settings.permissions_${key}`),
                    })}
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

function EmailProviderGuides({
  providerId,
  zohoRegion = DEFAULT_ZOHO_REGION,
}: {
  providerId: EmailProviderId;
  zohoRegion?: ZohoRegionId;
}) {
  const { t } = useTranslation();
  const guides =
    providerId === 'zoho' ? getZohoGuides(zohoRegion) : EMAIL_PROVIDER_BY_ID[providerId].guides;

  if (guides.length === 0) return null;

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('email.settings.guides.title')}
      </p>
      <ul className="flex min-w-0 flex-col gap-1.5">
        {guides.map((guide) => {
          const label = t(guide.labelKey);
          return (
            <li key={guide.labelKey} className="flex min-w-0 items-center gap-1.5">
              {guide.helpUrl ? (
                <a
                  href={guide.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-opacity hover:opacity-90 motion-reduce:transition-none"
                >
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-3 shrink-0" aria-hidden />
                  <span className="min-w-0">{label}</span>
                  <HugeiconsIcon icon={ExternalLinkIcon} className="size-2.5 shrink-0 opacity-70" aria-hidden />
                </a>
              ) : (
                <Badge variant="secondary" className="rounded-full font-medium">
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-3 shrink-0" aria-hidden />
                  {label}
                </Badge>
              )}
              {guide.tooltipKey ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="rounded-full text-muted-foreground"
                        aria-label={t('email.settings.guides.tooltip_aria', { topic: label })}
                      />
                    }
                  >
                    <HugeiconsIcon icon={HelpCircleIcon} aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] whitespace-normal">
                    {t(guide.tooltipKey)}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ZOHO_REGION_OPTIONS: { id: ZohoRegionId; labelKey: string }[] = [
  { id: 'eu', labelKey: 'email.settings.zoho_region_eu' },
  { id: 'global', labelKey: 'email.settings.zoho_region_global' },
];

function FormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0"
      />
    </Field>
  );
}

export default function EmailSection() {
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
    if (
      providerId !== 'custom' &&
      (key === 'imap_host' || key === 'smtp_host' || key === 'imap_port' || key === 'smtp_port')
    ) {
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
        setError({
          error: res.error || t('email.settings.add_failed'),
          errorCode: res.errorCode,
          helpUrl: res.helpUrl,
        });
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
      setError({
        error: res.error || t('email.settings.add_failed'),
        errorCode: res.errorCode,
        helpUrl: res.helpUrl,
      });
      setTestState('fail');
      return;
    }
    const test = await window.electron.email.testConnection(res.accountId);
    if (test.success) {
      setTestState('ok');
      resetForm();
      setShowForm(false);
    } else {
      setError({
        error: test.error || t('email.settings.test_failed'),
        errorCode: test.errorCode,
        helpUrl: test.helpUrl,
      });
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

  const serverFields = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          id="email-imap-host"
          label={t('email.settings.imap_host')}
          value={form.imap_host}
          onChange={(v) => handleServerFieldChange('imap_host', v)}
          placeholder="imap.example.com"
        />
        <FormField
          id="email-imap-port"
          label={t('email.settings.imap_port')}
          value={String(form.imap_port)}
          onChange={(v) => handleServerFieldChange('imap_port', Number(v) || 993)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          id="email-smtp-host"
          label={t('email.settings.smtp_host')}
          value={form.smtp_host}
          onChange={(v) => handleServerFieldChange('smtp_host', v)}
          placeholder="smtp.example.com"
        />
        <FormField
          id="email-smtp-port"
          label={t('email.settings.smtp_port')}
          value={String(form.smtp_port)}
          onChange={(v) => handleServerFieldChange('smtp_port', Number(v) || 465)}
        />
      </div>
    </>
  );

  return (
    <SettingsSurface
      icon={Mail01Icon}
      title={t('email.settings.title')}
      description={t('email.settings.description')}
      actions={
        !showForm ? (
          <Button type="button" size="sm" onClick={openForm}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('email.settings.add_account')}
          </Button>
        ) : undefined
      }
    >
      <SettingsGroup title={t('email.settings.title')}>
        {accounts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {t('email.settings.no_accounts')}
          </p>
        ) : (
          accounts.map((acc) => (
            <SettingsRow
              key={acc.id}
              title={acc.display_name || acc.email}
              description={
                <>
                  {acc.email} · {acc.imap_host}
                  {acc.is_default ? ` · ${t('email.settings.default')}` : ''}
                </>
              }
              control={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  onClick={() => handleRemove(acc.id)}
                  title={t('email.settings.remove')}
                  aria-label={t('email.settings.remove')}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              }
            >
              <EmailPermissionsEditor
                userActions={acc.user_actions ?? DEFAULT_USER_ACTIONS}
                agentActions={acc.agent_actions ?? DEFAULT_AGENT_ACTIONS}
                onChange={(user_actions, agent_actions) => saveAccountPermissions(acc.id, user_actions, agent_actions)
                }
              />
            </SettingsRow>
          ))
        )}
      </SettingsGroup>

      {showForm ? (
        <SettingsGroup title={t('email.settings.add_account')}>
          <div className="flex min-w-0 flex-col gap-4 px-4 py-4">
            <section className="flex min-w-0 flex-col gap-2" aria-labelledby="email-provider-label">
              <h3 id="email-provider-label" className="text-sm font-medium">
                {t('email.settings.provider_label')}
              </h3>
              <ToggleGroup
                value={[providerId]}
                onValueChange={(values) => values[0] && handleProviderChange(values[0] as EmailProviderId)}
                aria-label={t('email.settings.provider_aria')}
                className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {EMAIL_PROVIDER_PRESETS.map((preset) => (
                  <ToggleGroupItem
                    key={preset.id}
                    value={preset.id}
                    variant="outline"
                    aria-label={t(preset.labelKey)}
                    className="h-auto min-h-16 w-full flex-col items-start gap-1 rounded-xl p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                  >
                    <span className="font-medium">{t(preset.labelKey)}</span>
                    <span className="whitespace-normal text-xs font-normal text-muted-foreground">
                      {preset.id === 'custom'
                        ? t('email.settings.providers.custom_desc')
                        : preset.servers.imap_host}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </section>

            <EmailProviderGuides providerId={providerId} zohoRegion={zohoRegion} />

            <FormField
              id="email-address"
              label={t('email.settings.email')}
              value={form.email}
              onChange={(v) => update('email', v)}
              placeholder="you@example.com"
            />
            <FormField
              id="email-display-name"
              label={t('email.settings.display_name')}
              value={form.display_name}
              onChange={(v) => update('display_name', v)}
            />

            {providerId === 'zoho' ? (
              <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('email.settings.zoho_region_label')}
                  </span>
                  <ToggleGroup
                    value={[zohoRegion]}
                    onValueChange={(values) =>
                      values[0] && handleZohoRegionChange(values[0] as ZohoRegionId)
                    }
                    aria-label={t('email.settings.zoho_region_aria')}
                  >
                    {ZOHO_REGION_OPTIONS.map((opt) => (
                      <ToggleGroupItem key={opt.id} value={opt.id} variant="outline" size="sm">
                        {t(opt.labelKey)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                {serverFields}
              </div>
            ) : (
              serverFields
            )}

            <FormField
              id="email-username"
              label={t('email.settings.username')}
              value={form.username}
              onChange={(v) => update('username', v)}
              placeholder={form.email}
            />
            <FormField
              id="email-password"
              label={t('email.settings.password')}
              value={form.password}
              onChange={(v) => update('password', v)}
              type="password"
            />
            <p className="text-xs text-muted-foreground">{t('email.settings.app_password_hint')}</p>

            <EmailPermissionsEditor
              userActions={form.user_actions}
              agentActions={form.agent_actions}
              onChange={(user_actions, agent_actions) =>
                setForm((f) => ({ ...f, user_actions, agent_actions }))
              }
            />

            <EmailErrorNotice info={error} compact />
            {error?.errorCode === 'app_password_required' ? (
              <p className="text-xs text-muted-foreground">
                {t('email.settings.app_password_hint')}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="button" disabled={busy} onClick={() => handleTest()}>
                {testState === 'testing' ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} data-icon="inline-start" />
                )}
                {t('email.settings.test_and_save')}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => handleAdd()}>
                {t('email.settings.save_without_test')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </SettingsGroup>
      ) : null}
    </SettingsSurface>
  );
}
