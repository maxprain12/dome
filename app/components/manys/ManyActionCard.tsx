import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Mail01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { request, type Action } from '@/lib/manys/api';
import { describeAction } from './actionSummary';
import { cn } from '@/lib/utils';

const CREDENTIAL_PLACEHOLDER = /\{\{credential:[0-9a-f-]{36}(?::(?:username|secret))?\}\}/gi;

/** A saved credential is typed by Provider after approval, so the card shows a label, never a value. */
function shown(value: unknown, credentialLabel: string): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const text = raw.replace(CREDENTIAL_PLACEHOLDER, credentialLabel);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/**
 * What the person is approving: the operation and its arguments. Provider wraps them in
 * `parameters` (and, for the computer, once more in `parameters.parameters`). Routing ids such as
 * connectionId or targetVersion say nothing about the effect, so they stay in the full view.
 */
function proposalRows(proposal: unknown, credentialLabel: string): Array<[string, string]> {
  if (!proposal || typeof proposal !== 'object') return [];
  const outer = (proposal as { parameters?: unknown }).parameters;
  if (!outer || typeof outer !== 'object') return [];
  const { parameters: inner, ...rest } = outer as Record<string, unknown>;
  const flat = { ...rest, ...(inner && typeof inner === 'object' ? inner as Record<string, unknown> : {}) };
  return Object.entries(flat)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => [key, shown(value, credentialLabel)]);
}

function minutesLeft(expiresAt: string): number | null {
  const time = Date.parse(expiresAt);
  return Number.isNaN(time) ? null : Math.max(0, Math.ceil((time - Date.now()) / 60_000));
}

const TONE: Record<string, string> = {
  pending: 'dome-card-warn',
  outcome_unknown: 'dome-card-warn',
  failed: 'dome-card-err',
  rejected: 'dome-card-err',
};
const BADGE: Record<string, 'mint' | 'lavender' | 'destructive' | 'outline'> = {
  succeeded: 'mint',
  approved: 'lavender',
  prepared: 'lavender',
  dispatched: 'lavender',
  failed: 'destructive',
  rejected: 'destructive',
};

/**
 * One action the Many wants to take, from the moment it asks to the receipt. Only the person can
 * move it forward (approve, reject, reconcile an uncertain result); every other state is a record.
 */
export default function ManyActionCard({ action, many, busy, perform }: { action: Action; many: string; busy: boolean; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const [full, setFull] = useState(false);
  const rows = proposalRows(action.proposal, t('manys.savedCredential'));
  const minutes = minutesLeft(action.expires_at);
  const open = action.state === 'pending';
  const expired = open && minutes === 0;
  const waiting = open || action.state === 'outcome_unknown';
  const capability = (action.proposal as { capability?: string } | null)?.capability;
  const capabilityLabel = capability ? t(`manys.capabilities.${capability.replace('.', '_')}`, { defaultValue: capability }) : '';
  const expiry = minutes === null ? t(`manys.actions.${action.state}`) : expired ? t('manys.expired') : minutes >= 60 ? t('manys.expiresIn', { hours: Math.round(minutes / 60) }) : t('manys.expiresInMinutes', { minutes });
  const summary = describeAction(action.proposal, t('manys.savedCredential'));
  const title = summary ? t(`manys.actionSummary.${summary.key}`, summary.values) : (capabilityLabel || t('manys.pendingAction'));
  const running = ['approved', 'prepared', 'dispatched'].includes(action.state);
  return (
    <article className={cn('dome-card flex flex-col p-3.5', TONE[action.state] ?? 'dome-card-plain')} aria-label={title}>
      <div className="flex items-start gap-2.5">
        <HugeiconsIcon icon={Mail01Icon} className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 grow">
          <p className="text-sm font-semibold break-words">{title}</p>
          <p className="text-xs text-muted-foreground">{open ? (capabilityLabel ? `${capabilityLabel} · ${expiry}` : expiry) : capabilityLabel}</p>
        </div>
        {!open && (
          <Badge variant={BADGE[action.state] ?? 'outline'}>
            {running && <span aria-hidden="true" className="size-[7px] animate-pulse rounded-full bg-current motion-reduce:animate-none" />}
            {t(`manys.actions.${action.state}`, { defaultValue: action.state })}
          </Badge>
        )}
      </div>
      {full && rows.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 rounded-[10px] bg-muted px-3 py-2.5">
          {rows.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2">
              <span className="w-[72px] shrink-0 text-muted-foreground capitalize">{key}</span>
              <span className="min-w-0 grow break-words">{value}</span>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-3 flex items-center gap-2">
          {[true, false].map((approve) => (
            <Button
              key={String(approve)}
              disabled={busy || expired}
              variant={approve ? 'default' : 'outline'}
              onClick={() => { void perform(() => request(`/${many}/actions/${action.id}`, 'PATCH', { approve, digest: action.digest })); }}
            >
              {t(approve ? 'manys.approve' : 'manys.reject')}
            </Button>
          ))}
          <span className="grow" />
          <Button type="button" variant="link" size="xs" aria-expanded={full} onClick={() => setFull((value) => !value)}>{t('manys.viewFullProposal')}</Button>
        </div>
      )}
      {action.state === 'outcome_unknown' && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void perform(() => request(`/${many}/actions/${action.id}`, 'PATCH', {
              outcome: (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ?? 'succeeded',
              evidence: data.get('evidence'),
            }));
          }}
        >
          <p className="text-muted-foreground">{t('manys.reconcileHint')}</p>
          <label htmlFor={`evidence-${action.id}`} className="text-xs font-semibold">{t('manys.evidence')}</label>
          <Input id={`evidence-${action.id}`} name="evidence" required maxLength={10000} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} value="succeeded">{t('manys.confirmSucceeded')}</Button>
            <Button type="submit" variant="outline" disabled={busy} value="failed">{t('manys.confirmFailed')}</Button>
          </div>
        </form>
      )}
      {!waiting && (action.proposal != null || action.receipt != null) && (
        <Button type="button" variant="link" size="xs" className="mt-2 self-start" aria-expanded={full} onClick={() => setFull((value) => !value)}>{t('manys.viewFullProposal')}</Button>
      )}
      {(full || (waiting && rows.length === 0 && !summary)) && action.proposal != null && (
        <pre className="dome-term mt-3 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(action.proposal, null, 2)}</pre>
      )}
      {(waiting || full) && action.receipt != null && <pre className="dome-term mt-3 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(action.receipt, null, 2)}</pre>}
    </article>
  );
}
