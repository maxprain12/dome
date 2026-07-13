import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import type { ExecutionPolicy } from '@/lib/pipelines/types';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import type { ReactNode } from 'react';
interface Props {
  onCreate: (data: { title: string; executionPolicy: ExecutionPolicy }) => Promise<void> | void;
}

/**
 * Always-last column. Collapsed to a "+ Add stage" button; opens to a compact
 * inline form (title + execution policy). Agent assignment is configured later
 * from the stage's settings drawer. Not a drop target.
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

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 rounded-lg shrink-0 w-72 self-start min-h-[120px] transition-colors"
        style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--muted-foreground)', cursor: 'pointer' }}
        title={t('pipelines.add_stage')}
        aria-label={t('pipelines.add_stage')}
      >
        <HugeiconsIcon icon={PlusSignIcon} size={18} />
        <span className="text-sm font-medium text-foreground">
          {t('pipelines.add_stage')}
        </span>
      </Button>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onKeyDown only handles Escape (cancel shortcut).
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
      className="flex flex-col rounded-lg shrink-0 w-72 self-start"
      style={{ background: 'var(--card)', border: '1px solid var(--primary)', boxShadow: '0 0 0 1px var(--primary) inset' }}
      aria-label={t('pipelines.add_stage')}
    >
      <div className="px-3 py-2 border-b flex items-center justify-between gap-1 border-border">
        <span className="font-semibold text-sm text-foreground">
          {t('pipelines.add_stage')}
        </span>
        <Button
          type="button"
          onClick={reset}
          aria-label={t('pipelines.cancel')}
          style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: 2 }}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} />
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
          className="text-sm rounded-md px-2 py-1 outline-none"
          style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
        />
        <Field className="gap-1.5"><FieldLabel className="text-xs">{t('pipelines.execution_policy')}</FieldLabel><Select value={policy ?? null} onValueChange={(next) => { if (next != null) (setPolicy)(next); }} items={[
            { value: 'manual_resolve', label: t('pipelines.policy_manual_resolve') },
            { value: 'manual_agent', label: t('pipelines.policy_manual_agent') },
            { value: 'auto_agent', label: t('pipelines.policy_auto_agent') },
          ]}><SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{([
            { value: 'manual_resolve', label: t('pipelines.policy_manual_resolve') },
            { value: 'manual_agent', label: t('pipelines.policy_manual_agent') },
            { value: 'auto_agent', label: t('pipelines.policy_auto_agent') },
          ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select></Field>

        <div className="flex items-center justify-end gap-1.5 pt-1">
          <Button
            type="button"
            onClick={reset}
            disabled={submitting}
            className="text-xs px-2.5 py-1 rounded-md"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted-foreground)', cursor: 'pointer' }}
          >
            {t('pipelines.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={submitting || !title.trim()}
            className="text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1"
            style={{
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              border: 'none',
              cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
              opacity: submitting || !title.trim() ? 0.6 : 1,
            }}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={12} />
            {submitting ? t('pipelines.creating') : t('pipelines.create')}
          </Button>
        </div>
      </div>
    </form>
  );
}
