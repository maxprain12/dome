import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore } from '@/lib/store/useAppStore';
import type { CloudMany, Grants } from '@/lib/manys/api';

/** Which projects and resources of the library a Many may read (sharing one resource does not share its project). */
export default function ManyLibraryScope({ many, busy, onSave }: { many: CloudMany; busy: boolean; onSave: (grants: Grants) => void }) {
  const { t } = useTranslation();
  const [shared, setShared] = useState({ projects: many.grants.projects, resources: many.grants.resources });
  const projects = useAppStore((s) => s.projects);
  const selected = useAppStore((s) => s.selectedSourceIds);
  const resources = useAppStore((s) => s.resources);
  const toggle = (field: 'projects' | 'resources', id: string, checked: boolean) => setShared((current) => ({
    ...current,
    [field]: checked ? [...new Set([...current[field], id])] : current[field].filter((value) => value !== id),
  }));
  const listed = [...new Set([...shared.resources, ...selected])];
  const changed = JSON.stringify(shared) !== JSON.stringify({ projects: many.grants.projects, resources: many.grants.resources });

  // With nothing in the library to choose from there is nothing to explain.
  if (projects.length === 0 && listed.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl bg-muted px-3 py-2.5">
      <legend className="sr-only">{t('manys.canRead')}</legend>
      <span className="text-xs font-semibold">{t('manys.canRead')}</span>
      {projects.map((project) => (
        <label key={project.id} htmlFor={`many-project-${project.id}`} className="flex items-center gap-2">
          <Checkbox id={`many-project-${project.id}`} checked={shared.projects.includes(project.id)} onCheckedChange={(checked) => toggle('projects', project.id, checked)} />
          {project.name}
        </label>
      ))}
      {listed.map((id) => (
        <label key={id} htmlFor={`many-resource-${id}`} className="flex items-center gap-2">
          <Checkbox id={`many-resource-${id}`} checked={shared.resources.includes(id)} onCheckedChange={(checked) => toggle('resources', id, checked)} />
          {resources.find((resource) => resource.id === id)?.title ?? t('manys.openResource')}
        </label>
      ))}
      <p className="text-xs text-muted-foreground">{t('manys.shareHint')}</p>
      {changed && <Button type="button" size="sm" className="self-start" disabled={busy} onClick={() => onSave({ ...many.grants, ...shared })}>{t('manys.saveChanges')}</Button>}
    </fieldset>
  );
}
