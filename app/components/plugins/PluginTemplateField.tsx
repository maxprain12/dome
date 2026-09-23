import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import DatePicker from '@/components/shared/DatePicker';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pluginSelectOptionLabel } from '@/lib/plugins/fields';
import PluginImageField from '@/components/plugins/PluginImageField';
import type { PluginFieldDefinition } from '@/types/plugin';

export default function PluginTemplateField({
  pluginId,
  field,
  value,
  disabled,
  onChange,
  onMediaChange,
}: {
  pluginId?: string;
  field: PluginFieldDefinition;
  value: string | string[] | undefined;
  disabled?: boolean;
  onChange: (id: string, value: string | string[]) => void;
  onMediaChange?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const instanceId = useId();
  const label = `${field.label}${field.required ? ' *' : ''}`;
  const textValue = Array.isArray(value) ? value.join(', ') : value || '';
  const selectValue = Array.isArray(value) ? value[0] || '' : value || '';
  const selectedLabel = selectValue
    ? pluginSelectOptionLabel(field.id, selectValue, i18n.language)
    : field.label;
  const fieldId = `plugin-field-${instanceId}-${field.id}`;

  if (field.type === 'date') {
    return (
      <DatePicker
        id={fieldId}
        label={label}
        value={textValue}
        onChange={(next) => onChange(field.id, next)}
        disabled={disabled}
        clearable={!field.required}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <Field>
        <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
        <Select
          value={selectValue}
          onValueChange={(nextValue) => onChange(field.id, nextValue || '')}
          disabled={disabled}
        >
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue placeholder={field.label}>{selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(field.options || []).map((option) => (
                <SelectItem key={option} value={option}>
                  {pluginSelectOptionLabel(field.id, option, i18n.language)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  if (field.type === 'sitePath' && pluginId) {
    return (
      <PluginImageField
        pluginId={pluginId}
        fieldId={fieldId}
        label={label}
        value={textValue}
        required={field.required}
        disabled={disabled}
        onChange={(next) => onChange(field.id, next)}
        onMediaChange={onMediaChange}
      />
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input
        id={fieldId}
        type="text"
        value={textValue}
        placeholder={field.type === 'tags' ? t('plugins.tags_placeholder') : undefined}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          onChange(
            field.id,
            field.type === 'tags' ? next.split(',').map((item) => item.trim()).filter(Boolean) : next,
          );
        }}
      />
    </Field>
  );
}
