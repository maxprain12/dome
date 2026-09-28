import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';

function sameTag(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function parseTagDraft(draft: string): string[] {
  return draft.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

export default function PluginTagField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string[];
  disabled?: boolean;
  onChange: (tags: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const additions = parseTagDraft(raw);
    if (!additions.length) {
      setDraft('');
      return;
    }
    const next = [...value];
    for (const tag of additions) {
      if (next.some((item) => sameTag(item, tag))) continue;
      next.push(tag.slice(0, 80));
    }
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(value.filter((item) => !sameTag(item, tag)));
  };

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex min-h-7 flex-wrap items-center gap-1 rounded-md border border-input bg-input/20 px-1.5 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
        {value.map((tag) => (
          <Badge key={tag} variant="outline" className="max-w-full gap-0.5 pr-0.5">
            <span className="max-w-40 truncate">{tag}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-4"
              disabled={disabled}
              aria-label={t('plugins.tags_remove', { tag })}
              onClick={() => remove(tag)}
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </Badge>
        ))}
        <input
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={value.length === 0 ? t('plugins.tags_placeholder') : undefined}
          className="h-5 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-xs/relaxed"
          onChange={(event) => {
            const next = event.target.value;
            if (/[,;\n]/.test(next)) commit(next);
            else setDraft(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && !draft && value.length > 0) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => commit(draft)}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (!/[,;\n]/.test(text)) return;
            event.preventDefault();
            commit(`${draft}${text}`);
          }}
        />
      </div>
    </Field>
  );
}
