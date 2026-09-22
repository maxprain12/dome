import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, PuzzleIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PluginNoteSchema } from '@/types/plugin';

type FieldValues = Record<string, string | string[]>;

export default function PluginNoteFields({ resourceId, readOnly, onSaved }: {
  resourceId: string;
  readOnly: boolean;
  onSaved: (updatedAt: number) => void;
}) {
  const { t } = useTranslation();
  const [schema, setSchema] = useState<PluginNoteSchema | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electron?.plugins?.getNoteSchema) return undefined;
    let active = true;
    void window.electron.plugins.getNoteSchema(resourceId).then((result) => {
      if (!active || !result.success || !result.data) return;
      setSchema(result.data);
      setValues(result.data.values);
    });
    return () => { active = false; };
  }, [resourceId]);

  if (!schema) return null;

  const updateValue = (id: string, value: string, tags: boolean) => {
    setValues((current) => ({
      ...current,
      [id]: tags ? value.split(',').map((item) => item.trim()).filter(Boolean) : value,
    }));
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    const result = await window.electron.plugins.updateNoteFields(resourceId, schema.updatedAt, values);
    setSaving(false);
    if (!result.success || !result.data) {
      setMessage(result.error || t('settings.plugins.fields_save_error'));
      return;
    }
    setSchema((current) => current ? { ...current, updatedAt: result.data!.updatedAt, values: result.data!.fields } : current);
    setValues(result.data.fields);
    setDirty(false);
    setMessage('saved');
    onSaved(result.data.updatedAt);
  };

  return (
    <Card className="mb-5 shadow-none">
      <CardHeader className="flex-row items-start gap-3">
        <div className="rounded-md border p-2"><HugeiconsIcon icon={PuzzleIcon} /></div>
        <div className="min-w-0"><CardTitle>{schema.template.title || t('settings.plugins.structured_fields')}</CardTitle><CardDescription>{t('settings.plugins.structured_fields_description', { name: schema.pluginId })}</CardDescription></div>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid gap-3 md:grid-cols-2">
          {schema.template.fields.map((field) => {
            const value = values[field.id];
            return (
              <Field key={field.id}>
                <FieldLabel htmlFor={`plugin-field-${field.id}`}>{field.label}{field.required ? ' *' : ''}</FieldLabel>
                {field.type === 'select' ? (
                  <Select
                    value={Array.isArray(value) ? value[0] || '' : value || ''}
                    onValueChange={(nextValue) => updateValue(field.id, nextValue || '', false)}
                    disabled={readOnly}
                  >
                    <SelectTrigger id={`plugin-field-${field.id}`} className="w-full"><SelectValue placeholder={field.label} /></SelectTrigger>
                    <SelectContent><SelectGroup>{(field.options || []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`plugin-field-${field.id}`}
                    type={field.type === 'date' ? 'date' : 'text'}
                    value={Array.isArray(value) ? value.join(', ') : value || ''}
                    placeholder={field.type === 'tags' ? 'astro, tutorial' : undefined}
                    disabled={readOnly}
                    onChange={(event) => updateValue(field.id, event.target.value, field.type === 'tags')}
                  />
                )}
              </Field>
            );
          })}
        </FieldGroup>
        {!readOnly ? <div className="mt-4 flex items-center gap-3">
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void save()}>{saving ? t('common.saving', 'Saving…') : t('settings.plugins.save_fields')}</Button>
          {message === 'saved' ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><HugeiconsIcon icon={CheckmarkCircle02Icon} />{t('settings.plugins.fields_saved')}</span> : null}
        </div> : null}
        {message && message !== 'saved' ? <Alert variant="destructive" className="mt-4"><AlertDescription>{message}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
