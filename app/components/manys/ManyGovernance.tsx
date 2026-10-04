import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request, type AuditEntry, type Policy } from '@/lib/manys/api';
import { buildMatch, foldAudit, mergeAudit } from './governanceRules';

const CAPABILITIES = ['vault.read', 'vault.write', 'computer.read', 'computer.write', 'external.send', 'external.publish', 'external.purchase', 'external.delete'];
const REFRESH_MS = 10000;
const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';
const DECISION_BADGE = { allowed: 'ok', denied: 'err', observed_denied: 'warn' } as const;

/** Rules that narrow what a Many may do, and the record of every call it made. */
export default function ManyGovernance({ manyId }: { manyId: string }) {
  const { t } = useTranslation();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [effect, setEffect] = useState<'deny' | 'allow'>('deny');
  const [hosts, setHosts] = useState('');
  const [operations, setOperations] = useState('');
  const [tools, setTools] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [observe, setObserve] = useState(false);
  const [everyMany, setEveryMany] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rules, audit] = await Promise.all([
        request<{ policies: Policy[] }>(`/${manyId}/policies`),
        request<{ entries: AuditEntry[] }>(`/${manyId}/audit`),
      ]);
      setPolicies(rules.policies);
      setEntries((current) => mergeAudit(current, audit.entries));
      setHasOlder((current) => current || audit.entries.length >= 100);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
    }
  }, [manyId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const mutate = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const loadOlder = () => mutate(async () => {
    const oldest = entries[entries.length - 1]?.sequence;
    if (!oldest) return;
    const page = await request<{ entries: AuditEntry[] }>(`/${manyId}/audit?before=${oldest}`);
    setEntries((current) => mergeAudit(current, page.entries));
    setHasOlder(page.entries.length >= 100);
  });

  const create = async () => {
    const created = await mutate(() => request(`/${manyId}/policies`, 'POST', {
      scope: everyMany ? 'all' : 'many',
      name: name.trim(),
      effect,
      mode: observe ? 'observe' : 'enforce',
      match: buildMatch({ tools, capabilities, operations, hosts }),
    }));
    if (created) {
      setName('');
      setHosts('');
      setOperations('');
      setTools('');
      setCapabilities([]);
      setObserve(false);
    }
  };

  const summary = (policy: Policy): string => {
    const parts = (['capabilities', 'hosts', 'tools', 'operations'] as const)
      .filter((field) => policy.match[field]?.length)
      .map((field) => t(`manys.governance.covers.${field}`, { list: (policy.match[field] ?? []).join(', ') }));
    return parts.length ? parts.join(' · ') : t('manys.governance.coversEverything');
  };
  const rows = useMemo(() => foldAudit(entries), [entries]);
  const hasAllow = policies.some((policy) => policy.enabled && policy.effect === 'allow' && policy.mode === 'enforce');

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="dome-card dome-card-err flex items-center gap-2 px-3 py-2 text-sm">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 grow">{t(`manys.errors.${error}`, { defaultValue: t('manys.errors.request_failed') })}</span>
        </div>
      )}
      <p className="text-muted-foreground">{t('manys.governance.intro')}</p>

      <section className="flex flex-col gap-2" aria-label={t('manys.governance.rules')}>
        <div className={`${labelClass} mb-0`}>{t('manys.governance.rules')}</div>
        {hasAllow && <p className="text-muted-foreground">{t('manys.governance.allowActive')}</p>}
        {policies.length === 0 && <p className="text-muted-foreground">{t('manys.governance.noRules')}</p>}
        {policies.map((policy) => (
          <div key={policy.id} className="dome-card flex items-start gap-2.5 px-3 py-2.5">
            <div className="flex min-w-0 grow flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={policy.effect === 'deny' ? 'err' : 'ok'}>{t(`manys.governance.${policy.effect}`)}</Badge>
                {policy.mode === 'observe' && <Badge variant="warn">{t('manys.governance.observing')}</Badge>}
                {policy.many_id === null && <Badge variant="outline">{t('manys.governance.everyMany')}</Badge>}
                <span className="min-w-0 truncate font-medium">{policy.name}</span>
              </div>
              <span className="text-muted-foreground">{summary(policy)}</span>
            </div>
            <Switch
              size="sm"
              checked={policy.enabled}
              disabled={busy}
              aria-label={t('manys.governance.enabled', { name: policy.name })}
              onCheckedChange={(checked) => { void mutate(() => request(`/${manyId}/policies/${policy.id}`, 'PATCH', { enabled: checked })); }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label={t('manys.governance.delete', { name: policy.name })}
              onClick={() => { void mutate(() => request(`/${manyId}/policies/${policy.id}`, 'DELETE')); }}
            >
              <HugeiconsIcon icon={Delete02Icon} />
            </Button>
          </div>
        ))}
      </section>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className={`${labelClass} mb-0`}>{t('manys.governance.newRule')}</div>
        <div>
          <label htmlFor="many-rule-name" className={labelClass}>{t('manys.name')}</label>
          <Input id="many-rule-name" value={name} maxLength={120} required placeholder={t('manys.governance.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <span className={labelClass}>{t('manys.governance.effect')}</span>
          <Tabs value={effect} onValueChange={(value) => setEffect(value as 'deny' | 'allow')}>
            <TabsList className="w-full">
              <TabsTrigger value="deny" className="flex-1 text-xs">{t('manys.governance.deny')}</TabsTrigger>
              <TabsTrigger value="allow" className="flex-1 text-xs">{t('manys.governance.allow')}</TabsTrigger>
            </TabsList>
          </Tabs>
          {effect === 'allow' && <p className="mt-1.5 text-muted-foreground">{t('manys.governance.allowHint')}</p>}
        </div>
        <fieldset>
          <legend className={labelClass}>{t('manys.governance.capabilities')}</legend>
          <div className="flex flex-col gap-2">
            {CAPABILITIES.map((id) => (
              <label key={id} htmlFor={`many-rule-cap-${id}`} className="flex items-center gap-2">
                <Checkbox
                  id={`many-rule-cap-${id}`}
                  checked={capabilities.includes(id)}
                  onCheckedChange={(checked) => setCapabilities((current) => (checked ? [...current, id] : current.filter((value) => value !== id)))}
                />
                {t(`manys.capabilities.${id.replace('.', '_')}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="many-rule-hosts" className={labelClass}>{t('manys.governance.hosts')}</label>
          <Input id="many-rule-hosts" value={hosts} placeholder="*.bank.com, mail.example.com" onChange={(e) => setHosts(e.target.value)} />
        </div>
        <div>
          <label htmlFor="many-rule-operations" className={labelClass}>{t('manys.governance.operations')}</label>
          <Input id="many-rule-operations" value={operations} placeholder="navigate, click, exec" onChange={(e) => setOperations(e.target.value)} />
        </div>
        <div>
          <label htmlFor="many-rule-tools" className={labelClass}>{t('manys.governance.tools')}</label>
          <Input id="many-rule-tools" value={tools} placeholder="vault_*, computer_*" onChange={(e) => setTools(e.target.value)} />
          <p className="mt-1.5 text-muted-foreground">{t('manys.governance.listHint')}</p>
        </div>
        <label htmlFor="many-rule-observe" className="flex items-center gap-2.5">
          <Switch id="many-rule-observe" size="sm" checked={observe} onCheckedChange={setObserve} />
          <span className="flex flex-col"><span>{t('manys.governance.observeOnly')}</span><span className="text-muted-foreground">{t('manys.governance.observeHint')}</span></span>
        </label>
        <label htmlFor="many-rule-every" className="flex items-center gap-2.5">
          <Switch id="many-rule-every" size="sm" checked={everyMany} onCheckedChange={setEveryMany} />
          {t('manys.governance.allManys')}
        </label>
        <Button type="submit" disabled={busy || !name.trim()} className="self-start">{t('manys.governance.create')}</Button>
      </form>

      <div className="h-px bg-[var(--hairline)]" />
      <section className="flex flex-col gap-2" aria-label={t('manys.governance.audit')}>
        <div className={`${labelClass} mb-0`}>{t('manys.governance.audit')}</div>
        <p className="text-muted-foreground">{t('manys.governance.auditHint')}</p>
        {rows.length === 0 && <p className="text-muted-foreground">{t('manys.governance.noAudit')}</p>}
        {rows.map((row) => (
          <div key={row.id} className="dome-card flex flex-col gap-1 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={DECISION_BADGE[row.decision]}>{t(`manys.governance.decisions.${row.decision}`)}</Badge>
              {row.outcome === 'error' && <Badge variant="err">{t('manys.governance.failed')}</Badge>}
              <span className="min-w-0 truncate font-medium">{row.tool === 'policy_admin' ? t('manys.governance.ruleChanged') : [row.tool, row.operation].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="truncate text-muted-foreground">
              {[row.host, row.ruleName, row.errorCode ? t(`manys.errors.${row.errorCode}`, { defaultValue: row.errorCode }) : null, new Date(row.createdAt).toLocaleString()].filter(Boolean).join(' · ')}
            </span>
          </div>
        ))}
        {hasOlder && <Button type="button" variant="outline" size="sm" disabled={busy} className="self-start" onClick={() => { void loadOlder(); }}>{t('manys.governance.loadOlder')}</Button>}
      </section>
    </div>
  );
}
