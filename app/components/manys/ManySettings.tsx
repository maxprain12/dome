import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, FileSearchIcon, Key01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore } from '@/lib/store/useAppStore';
import type { CloudMany, Grants } from '@/lib/manys/api';
import ManyPermissions from './ManyPermissions';

const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

export default function ManySettings({ many, busy, onSave, onGrants, onAdvanced }: { many: CloudMany; busy: boolean; onSave: (value: Record<string, unknown>) => Promise<void>; onGrants: (grants: Grants) => void; onAdvanced?: (tab: 'access' | 'governance') => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(many.name);
  const [instructions, setInstructions] = useState(many.instructions);
  const [shared, setShared] = useState({ projects: many.grants.projects, resources: many.grants.resources });
  const projects = useAppStore((s) => s.projects);
  const selected = useAppStore((s) => s.selectedSourceIds);
  const resources = useAppStore((s) => s.resources);
  const [saving, setSaving] = useState(false);
  const toggle = (field: 'projects' | 'resources', id: string, checked: boolean) => setShared((current) => ({
    ...current,
    [field]: checked ? [...new Set([...current[field], id])] : current[field].filter((value) => value !== id),
  }));

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaving(true);
          void onSave({ name, instructions, grants: { ...many.grants, ...shared } }).finally(() => setSaving(false));
        }}
      >
        <div>
          <label htmlFor="many-settings-name" className={labelClass}>{t('manys.name')}</label>
          <Input id="many-settings-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="many-instructions" className={labelClass}>{t('manys.instructions')}</label>
          <Textarea id="many-instructions" rows={4} value={instructions} maxLength={20000} onChange={(e) => setInstructions(e.target.value)} />
        </div>
        <fieldset>
          <legend className={labelClass}>{t('manys.canRead')}</legend>
          <div className="flex flex-col gap-2">
            {projects.map((project) => (
              <label key={project.id} htmlFor={`many-project-${project.id}`} className="flex items-center gap-2">
                <Checkbox id={`many-project-${project.id}`} checked={shared.projects.includes(project.id)} onCheckedChange={(checked) => toggle('projects', project.id, checked)} />
                {project.name}
              </label>
            ))}
            {[...new Set([...shared.resources, ...selected])].map((id) => (
              <label key={id} htmlFor={`many-resource-${id}`} className="flex items-center gap-2">
                <Checkbox id={`many-resource-${id}`} checked={shared.resources.includes(id)} onCheckedChange={(checked) => toggle('resources', id, checked)} />
                {resources.find((resource) => resource.id === id)?.title ?? t('manys.openResource')}
              </label>
            ))}
            <p className="text-muted-foreground">{t('manys.shareHint')}</p>
          </div>
        </fieldset>
        <Button type="submit" disabled={saving || !name.trim()} className="self-start">{t('manys.saveChanges')}</Button>
      </form>
    <section aria-label={t('manys.permissions')} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t('manys.permissions')}</h2>
      <ManyPermissions grants={many.grants} busy={busy} onChange={onGrants} />
    </section>
    {onAdvanced && (
      <section aria-label={t('manys.inspector.advanced')} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t('manys.inspector.advanced')}</h2>
        <p className="text-muted-foreground">{t('manys.inspector.advancedHint')}</p>
        <div className="dome-card flex flex-col p-1">
          <button type="button" className="dome-rowbtn" onClick={() => onAdvanced('access')}>
            <HugeiconsIcon icon={Key01Icon} className="size-4 shrink-0" aria-hidden />
            <span className="grow">{t('manys.access.tab')}</span>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          <button type="button" className="dome-rowbtn" onClick={() => onAdvanced('governance')}>
            <HugeiconsIcon icon={FileSearchIcon} className="size-4 shrink-0" aria-hidden />
            <span className="grow">{t('manys.governance.tab')}</span>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </div>
      </section>
    )}
    </div>
  );
}
