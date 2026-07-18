import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import type { ExecutionPolicy } from '@/lib/pipelines/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';

interface Props {
  onCreate: (data: { title: string; executionPolicy: ExecutionPolicy }) => Promise<void> | void;
}

/**
 * Always-last column. Collapsed to a "+ Add stage" button; opens to a compact
 * inline form. Not a drop target.
 */
export default function NewStageColumn({ onCreate }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [policy, setPolicy] = useState<ExecutionPolicy>('manual_resolve');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle('');
    setPolicy('manual_resolve');
    setOpen(false);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onCreate({ title: trimmed, executionPolicy: policy });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const policyItems = [
    { value: 'manual_resolve', label: t('pipelines.policy_manual_resolve') },
    { value: 'manual_agent', label: t('pipelines.policy_manual_agent') },
    { value: 'auto_agent', label: t('pipelines.policy_auto_agent') },
  ];

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-11 w-11 shrink-0 self-start border-dashed sm:h-auto sm:min-h-0 sm:w-[17.5rem] sm:flex-col sm:gap-1.5 sm:px-3 sm:py-5"
        title={t('pipelines.add_stage')}
        aria-label={t('pipelines.add_stage')}
      >
        <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
        <span className="hidden text-sm font-medium sm:inline">{t('pipelines.add_stage')}</span>
      </Button>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape cancels the form.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          reset();
        }
      }}
      className="flex w-[17.5rem] shrink-0 flex-col self-start overflow-hidden rounded-xl border border-primary bg-card"
      aria-label={t('pipelines.add_stage')}
    >
      <div className="flex items-center justify-between gap-1 border-b border-border px-2.5 py-2">
        <span className="text-sm font-semibold text-foreground">{t('pipelines.add_stage')}</span>
        <Button type="button" variant="ghost" size="icon-xs" onClick={reset} aria-label={t('pipelines.cancel')}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </div>

      <div className="flex flex-col gap-2 p-2.5">
        <Input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the field the user just opened.
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('pipelines.stage_title_placeholder')}
          aria-label={t('pipelines.stage_title_placeholder')}
        />
        <Field className="gap-1.5">
          <FieldLabel className="text-xs">{t('pipelines.execution_policy')}</FieldLabel>
          <Select
            value={policy}
            onValueChange={(next) => {
              if (next != null) setPolicy(next as ExecutionPolicy);
            }}
            items={policyItems}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {policyItems.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-center justify-end gap-1.5 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={reset} disabled={submitting}>
            {t('pipelines.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={submitting || !title.trim()}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {submitting ? t('pipelines.creating') : t('pipelines.create')}
          </Button>
        </div>
      </div>
    </form>
  );
}
