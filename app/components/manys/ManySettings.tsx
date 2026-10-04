import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store/useAppStore';
import type { CloudMany } from '@/lib/manys/api';

const capabilities = ['vault.read', 'vault.write', 'computer.read', 'computer.write', 'external.send', 'external.publish', 'external.purchase', 'external.delete'];
/** Capabilities that always pass through a proposal the person reviews first. */
const needsApproval = new Set(['external.send', 'external.publish', 'external.purchase', 'external.delete']);

const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

export default function ManySettings({ many, onSave }: { many: CloudMany; onSave: (value: Record<string, unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(many.name);
  const [instructions, setInstructions] = useState(many.instructions);
  const [grants, setGrants] = useState(many.grants);
  const projects = useAppStore((s) => s.projects);
  const selected = useAppStore((s) => s.selectedSourceIds);
  const resources = useAppStore((s) => s.resources);
  const [saving, setSaving] = useState(false);
  const toggle = (field: 'projects' | 'resources' | 'capabilities', id: string, checked: boolean) => setGrants((current) => ({
    ...current,
    [field]: checked ? [...new Set([...current[field], id])] : current[field].filter((value) => value !== id),
  }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        void onSave({ name, instructions, grants }).finally(() => setSaving(false));
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
              <Checkbox id={`many-project-${project.id}`} checked={grants.projects.includes(project.id)} onCheckedChange={(checked) => toggle('projects', project.id, checked)} />
              {project.name}
            </label>
          ))}
          {[...new Set([...grants.resources, ...selected])].map((id) => (
            <label key={id} htmlFor={`many-resource-${id}`} className="flex items-center gap-2">
              <Checkbox id={`many-resource-${id}`} checked={grants.resources.includes(id)} onCheckedChange={(checked) => toggle('resources', id, checked)} />
              {resources.find((resource) => resource.id === id)?.title ?? t('manys.openResource')}
            </label>
          ))}
          <p className="text-muted-foreground">{t('manys.shareHint')}</p>
        </div>
      </fieldset>
      <fieldset>
        <legend className={labelClass}>{t('manys.permissions')}</legend>
        <div className="flex flex-col gap-2">
          {capabilities.map((id) => (
            <label key={id} htmlFor={`many-cap-${id}`} className="flex items-center gap-2">
              <Checkbox id={`many-cap-${id}`} checked={grants.capabilities.includes(id)} onCheckedChange={(checked) => toggle('capabilities', id, checked)} />
              {t(`manys.capabilities.${id.replace('.', '_')}`)}
              {needsApproval.has(id) && <Badge variant="warn">{t('manys.requiresApproval')}</Badge>}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-muted-foreground">{t('manys.permissionHint')}</p>
      <Button type="submit" disabled={saving || !name.trim()} className="self-start">{t('manys.saveChanges')}</Button>
    </form>
  );
}
