import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { request, type ManyDetail } from '@/lib/manys/api';
import ManyActionCard from './ManyActionCard';

export default function ManyReview({ detail, busy, perform }: { detail: ManyDetail; busy: boolean; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const many = detail.many.id;
  return (
    <div className="flex flex-col gap-3">
      {detail.actions.map((action) => <ManyActionCard key={action.id} action={action} many={many} busy={busy} perform={perform} />)}
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
