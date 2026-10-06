import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { listCloudModels, request, setManyModel, type CloudModelCatalog, type Grants, type ManyDetail, type ModelSelection } from '@/lib/manys/api';
import ManyModelPicker from './ManyModelPicker';
import ManyCredentials from './ManyCredentials';
import ManyLibraryScope from './ManyLibraryScope';
import ManyMemory from './ManyMemory';
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
  const [catalog, setCatalog] = useState<CloudModelCatalog>({ dome: [], saved: [] });
  useEffect(() => {
    let active = true;
    listCloudModels().then((value) => { if (active) setCatalog(value); }).catch(() => { /* the model is still shown by name */ });
    return () => { active = false; };
  }, []);
  // What the Many runs on now, in the picker's terms. Anything the picker cannot offer stays shown by name.
  const current: ModelSelection | null = many.model_name
    ? many.model_source === 'external'
      ? { source: 'external', provider: many.model_provider ?? '', model: many.model_name, thinking: many.model_thinking as ModelSelection['thinking'] }
      : { source: 'dome', model: many.model_name, thinking: many.model_thinking as ModelSelection['thinking'] }
    : null;
  const save = (grants: Grants) => { void perform(() => request(`/${many.id}`, 'PATCH', { name: many.name, instructions: many.instructions, grants })); };
  return (
    <div className="flex flex-col gap-6">
      <Section title={t('manys.permissions')}>
        <ManyPermissions grants={many.grants} busy={busy} onChange={save} />
        {hasCapability(many.grants, 'vault.read') && <ManyLibraryScope key={many.grant_revision} many={many} busy={busy} onSave={save} />}
      </Section>
      {many.model_name && (
        <Section title={t('manys.model')}>
          {catalog.dome.length + catalog.saved.length > 0 ? (
            <>
              <ManyModelPicker
                catalog={catalog}
                value={current}
                disabled={busy}
                onChange={(selection) => { void perform(() => setManyModel(many.id, selection)); }}
              />
              <p className="text-xs text-muted-foreground">{t('manys.modelPicker.applies')}</p>
            </>
          ) : (
            <p className="text-sm">
              <span className="font-medium">{many.model_name}</span>
              <span className="text-muted-foreground"> · {many.model_source === 'dome' ? t('manys.runtime.dome_credits') : many.model_provider}</span>
            </p>
          )}
        </Section>
      )}
      <Section title={t('manys.memory.title')}>
        <ManyMemory key={many.id} manyId={many.id} grants={many.grants} busy={busy} onGrants={save} />
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
