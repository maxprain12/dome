import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Clock01Icon, Mail01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { request, type Action, type ManyDetail } from '@/lib/manys/api';

function shown(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/**
 * What the person is approving: the operation and its arguments. Provider wraps them in
 * `parameters` (and, for the computer, once more in `parameters.parameters`). Routing ids such as
 * connectionId or targetVersion say nothing about the effect, so they stay in the full view.
 */
function proposalRows(proposal: unknown): Array<[string, string]> {
  if (!proposal || typeof proposal !== 'object') return [];
  const outer = (proposal as { parameters?: unknown }).parameters;
  if (!outer || typeof outer !== 'object') return [];
  const { parameters: inner, ...rest } = outer as Record<string, unknown>;
  const flat = { ...rest, ...(inner && typeof inner === 'object' ? inner as Record<string, unknown> : {}) };
  return Object.entries(flat)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => [key, shown(value)]);
}

function minutesLeft(expiresAt: string): number | null {
  const time = Date.parse(expiresAt);
  return Number.isNaN(time) ? null : Math.max(0, Math.ceil((time - Date.now()) / 60_000));
}

function ActionCard({ action, many, busy, perform }: { action: Action; many: string; busy: boolean; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const [full, setFull] = useState(false);
  const rows = proposalRows(action.proposal);
  const minutes = minutesLeft(action.expires_at);
  const expired = minutes === 0;
  const capability = (action.proposal as { capability?: string } | null)?.capability;
  const expiry = minutes === null ? t(`manys.actions.${action.state}`) : expired ? t('manys.expired') : minutes >= 60 ? t('manys.expiresIn', { hours: Math.round(minutes / 60) }) : t('manys.expiresInMinutes', { minutes });
  return (
    <article className="dome-card dome-card-warn flex flex-col p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <HugeiconsIcon icon={Mail01Icon} className="size-4" aria-hidden />
        <span className="grow text-sm font-semibold">
          {t('manys.pendingAction')}
          {capability ? `: ${t(`manys.capabilities.${capability.replace('.', '_')}`, { defaultValue: capability })}` : ''}
        </span>
        <Badge variant="outline">
          {minutes !== null && <HugeiconsIcon icon={Clock01Icon} className="size-3" aria-hidden />}
          {expiry}
        </Badge>
      </div>
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-[10px] bg-muted px-3 py-2.5">
          {rows.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2">
              <span className="w-[72px] shrink-0 text-muted-foreground capitalize">{key}</span>
              <span className="min-w-0 grow break-words">{value}</span>
            </div>
          ))}
        </div>
      )}
      {action.state === 'pending' && (
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
      {(full || rows.length === 0) && action.proposal != null && (
        <pre className="dome-term mt-3 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(action.proposal, null, 2)}</pre>
      )}
      {action.receipt != null && <pre className="dome-term mt-3 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(action.receipt, null, 2)}</pre>}
    </article>
  );
}

export default function ManyReview({ detail, busy, perform }: { detail: ManyDetail; busy: boolean; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const many = detail.many.id;
  return (
    <div className="flex flex-col gap-3">
      {detail.actions.map((action) => <ActionCard key={action.id} action={action} many={many} busy={busy} perform={perform} />)}
      {(detail.conflicts ?? []).map((conflict) => (
        <article key={conflict.id} className="dome-card dome-card-warn flex flex-col p-3.5">
          <h3 className="mb-2.5 text-sm font-semibold">{t('manys.conflict')}: {conflict.title ?? t('manys.openResource')}</h3>
          <pre className="dome-term max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(conflict.proposal, null, 2)}</pre>
          <div className="mt-3 flex gap-2">
            {[true, false].map((apply) => (
              <Button
                key={String(apply)}
                variant={apply ? 'default' : 'outline'}
                disabled={busy}
                onClick={() => { void perform(() => request(`/${many}/conflicts/${conflict.id}`, 'PATCH', { apply, expectedRevision: Number(conflict.current_revision) })); }}
              >
                {t(apply ? 'manys.applyProposal' : 'manys.keepCurrent')}
              </Button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
