import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { request, type Grants, type ManyDetail } from '@/lib/manys/api';
import ManyCredentials from './ManyCredentials';
import ManyLibraryScope from './ManyLibraryScope';
import ManyPermissions from './ManyPermissions';
import ManyRoutines from './ManyRoutines';
import ManySettings from './ManySettings';
import { hasCapability } from './computerPermissions';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5" aria-label={title}>
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Everything about a Many in one simple column: what it may do, the routines it keeps, the accesses it
 * holds and what it is for. Nothing here has to be filled in for it to work.
 */
export default function ManyDetails({ detail, busy, perform }: { detail: ManyDetail; busy: boolean; perform: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const many = detail.many;
  const save = (grants: Grants) => { void perform(() => request(`/${many.id}`, 'PATCH', { name: many.name, instructions: many.instructions, grants })); };
  return (
    <div className="flex flex-col gap-6">
      <Section title={t('manys.permissions')}>
        <ManyPermissions grants={many.grants} busy={busy} onChange={save} />
        {hasCapability(many.grants, 'vault.read') && <ManyLibraryScope key={many.grant_revision} many={many} busy={busy} onSave={save} />}
      </Section>
      <Section title={t('manys.recurrences')}>
        <ManyRoutines detail={detail} busy={busy} perform={perform} />
      </Section>
      <Section title={t('manys.access.tab')}>
        <ManyCredentials key={many.id} manyId={many.id} />
      </Section>
      <Collapsible>
        <CollapsibleTrigger className="text-xs font-semibold text-muted-foreground">{t('manys.edit')}</CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <ManySettings key={many.id} many={many} onSave={(value) => perform(() => request(`/${many.id}`, 'PATCH', value))} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
