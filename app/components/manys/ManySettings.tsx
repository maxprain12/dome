import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { useAppStore } from '@/lib/store/useAppStore';
import type { CloudMany } from '@/lib/manys/api';
const capabilities=['vault.read','vault.write','computer.read','computer.write','external.send','external.publish','external.purchase','external.delete'];
export default function ManySettings({many,onSave}:{many:CloudMany;onSave:(value:Record<string,unknown>)=>Promise<void>}) {
  const {t}=useTranslation();const [name,setName]=useState(many.name);const [instructions,setInstructions]=useState(many.instructions);
  const [grants,setGrants]=useState(many.grants);const projects=useAppStore(s=>s.projects);const selected=useAppStore(s=>s.selectedSourceIds);
  const resources=useAppStore(s=>s.resources);
  const [saving,setSaving]=useState(false);
  const toggle=(field:'projects'|'resources'|'capabilities',id:string,checked:boolean)=>setGrants(current=>({...current,[field]:checked?[...new Set([...current[field],id])]:current[field].filter(value=>value!==id)}));
  return <form className="flex flex-col gap-4 overflow-auto" onSubmit={e=>{e.preventDefault();setSaving(true);void onSave({name,instructions,grants}).finally(()=>setSaving(false));}}>
    <FieldGroup><Field><FieldLabel htmlFor="many-settings-name">{t('manys.name')}</FieldLabel><Input id="many-settings-name" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></Field>
    <Field><FieldLabel htmlFor="many-instructions">{t('manys.instructions')}</FieldLabel><Textarea id="many-instructions" value={instructions} maxLength={20000} onChange={e=>setInstructions(e.target.value)}/></Field>
    <FieldSet><FieldLegend>{t('manys.projects')}</FieldLegend>{projects.map(project=><Field key={project.id} orientation="horizontal"><Checkbox id={`many-project-${project.id}`} checked={grants.projects.includes(project.id)} onCheckedChange={checked=>toggle('projects',project.id,checked)}/><FieldLabel htmlFor={`many-project-${project.id}`}>{project.name}</FieldLabel></Field>)}</FieldSet>
    <FieldSet><FieldLegend>{t('manys.resources')}</FieldLegend>{[...new Set([...grants.resources,...selected])].map(id=><Field key={id} orientation="horizontal"><Checkbox id={`many-resource-${id}`} checked={grants.resources.includes(id)} onCheckedChange={checked=>toggle('resources',id,checked)}/><FieldLabel htmlFor={`many-resource-${id}`}>{resources.find(resource=>resource.id===id)?.title??t('manys.openResource')}</FieldLabel></Field>)}</FieldSet>
    <FieldSet><FieldLegend>{t('manys.permissions')}</FieldLegend>{capabilities.map(id=><Field key={id} orientation="horizontal"><Checkbox id={`many-cap-${id}`} checked={grants.capabilities.includes(id)} onCheckedChange={checked=>toggle('capabilities',id,checked)}/><FieldLabel htmlFor={`many-cap-${id}`}>{t(`manys.capabilities.${id.replace('.','_')}`)}</FieldLabel></Field>)}</FieldSet></FieldGroup>
    <p className="text-sm text-muted-foreground">{t('manys.permissionHint')}</p><Button type="submit" disabled={saving||!name.trim()}>{t('manys.save')}</Button>
  </form>;
}
