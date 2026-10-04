import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, Delete02Icon, PencilEdit01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { request, type Skill } from '@/lib/manys/api';

const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

/** "Weekly Report!" becomes "weekly-report". The provider only accepts lowercase letters, digits and hyphens. */
export function skillSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

/** Instructions the Many loads when a task needs them. A skill never grants a permission. */
export default function ManySkills({ manyId }: { manyId: string }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [everyMany, setEveryMany] = useState(false);

  const load = useCallback(async () => {
    try {
      setSkills((await request<{ skills: Skill[] }>(`/${manyId}/skills`)).skills);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
    }
  }, [manyId]);
  useEffect(() => { void load(); }, [load]);

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
  const reset = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setContent('');
    setEveryMany(false);
  };
  const edit = (skill: Skill) => {
    setEditing(skill);
    setName(skill.name);
    setDescription(skill.description);
    setContent(skill.content);
    setEveryMany(skill.many_id === null);
  };
  const save = async () => {
    const body = { name: skillSlug(name), description: description.trim(), content };
    const saved = await mutate(() => (editing
      ? request(`/${manyId}/skills/${editing.id}`, 'PATCH', body)
      : request(`/${manyId}/skills`, 'POST', { ...body, scope: everyMany ? 'all' : 'many' })));
    if (saved) reset();
  };

  return (
    <section className="flex flex-col gap-3" aria-label={t('manys.access.skills.title')}>
      <div className={`${labelClass} mb-0`}>{t('manys.access.skills.title')}</div>
      <p className="text-muted-foreground">{t('manys.access.skills.intro')}</p>
      {error && (
        <div className="dome-card dome-card-err flex items-center gap-2 px-3 py-2 text-sm">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 grow">{t(`manys.errors.${error}`, { defaultValue: t('manys.errors.request_failed') })}</span>
        </div>
      )}
      {skills.length === 0 && <p className="text-muted-foreground">{t('manys.access.skills.none')}</p>}
      {skills.map((skill) => (
        <div key={skill.id} className="dome-card flex items-start gap-2.5 px-3 py-2.5">
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-0 truncate font-medium">{skill.name}</span>
              {skill.many_id === null && <Badge variant="outline">{t('manys.governance.everyMany')}</Badge>}
            </div>
            {skill.description && <span className="text-muted-foreground">{skill.description}</span>}
          </div>
          <Switch
            size="sm"
            checked={skill.enabled}
            disabled={busy}
            aria-label={t('manys.access.skills.enable', { name: skill.name })}
            onCheckedChange={(checked) => { void mutate(() => request(`/${manyId}/skills/${skill.id}`, 'PATCH', { enabled: checked })); }}
          />
          <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={t('manys.access.skills.edit', { name: skill.name })} onClick={() => edit(skill)}>
            <HugeiconsIcon icon={PencilEdit01Icon} />
          </Button>
          <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={t('manys.access.skills.delete', { name: skill.name })} onClick={() => { void mutate(() => request(`/${manyId}/skills/${skill.id}`, 'DELETE')); }}>
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </div>
      ))}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={`${labelClass} mb-0`}>{editing ? t('manys.access.skills.editing', { name: editing.name }) : t('manys.access.skills.new')}</div>
        <div>
          <label htmlFor="many-skill-name" className={labelClass}>{t('manys.access.skills.name')}</label>
          <Input id="many-skill-name" value={name} maxLength={64} required placeholder="weekly-report" onChange={(e) => setName(e.target.value)} />
          {name.trim() && skillSlug(name) !== name && <p className="mt-1.5 text-muted-foreground">{t('manys.access.skills.saveAs', { name: skillSlug(name) })}</p>}
        </div>
        <div>
          <label htmlFor="many-skill-description" className={labelClass}>{t('manys.access.skills.description')}</label>
          <Input id="many-skill-description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="many-skill-content" className={labelClass}>{t('manys.access.skills.content')}</label>
          <Textarea id="many-skill-content" value={content} rows={6} maxLength={20000} required onChange={(e) => setContent(e.target.value)} />
        </div>
        {!editing && (
          <label htmlFor="many-skill-every" className="flex items-center gap-2.5">
            <Switch id="many-skill-every" size="sm" checked={everyMany} onCheckedChange={setEveryMany} />
            {t('manys.governance.allManys')}
          </label>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !skillSlug(name) || !content.trim()}>{editing ? t('manys.saveChanges') : t('manys.access.skills.save')}</Button>
          {editing && <Button type="button" variant="outline" onClick={reset}>{t('manys.access.skills.cancel')}</Button>}
        </div>
      </form>
    </section>
  );
}
