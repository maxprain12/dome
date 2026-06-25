import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import type { ExecutionPolicy } from '@/lib/pipelines/types';

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 rounded-lg shrink-0 w-72 self-start min-h-[120px] transition-colors"
        style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--secondary-text)', cursor: 'pointer' }}
        title={t('pipelines.add_stage')}
        aria-label={t('pipelines.add_stage')}
      >
        <Plus size={18} />
        <span className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
          {t('pipelines.add_stage')}
        </span>
      </button>
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
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)', boxShadow: '0 0 0 1px var(--accent) inset' }}
      aria-label={t('pipelines.add_stage')}
    >
      <div className="px-3 py-2 border-b flex items-center justify-between gap-1" style={{ borderColor: 'var(--border)' }}>
        <span className="font-semibold text-sm" style={{ color: 'var(--primary-text)' }}>
          {t('pipelines.add_stage')}
        </span>
        <button
          type="button"
          onClick={reset}
          aria-label={t('pipelines.cancel')}
          style={{ background: 'transparent', border: 'none', color: 'var(--tertiary-text)', cursor: 'pointer', padding: 2 }}
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-2.5">
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the field the user just opened.
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('pipelines.stage_title_placeholder')}
          aria-label={t('pipelines.stage_title_placeholder')}
          className="text-sm rounded-md px-2 py-1 outline-none"
          style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
        />
        <DomeSelectMenu<ExecutionPolicy>
          label={t('pipelines.execution_policy')}
          value={policy}
          onChange={setPolicy}
          options={[
            { value: 'manual_resolve', label: t('pipelines.policy_manual_resolve') },
            { value: 'manual_agent', label: t('pipelines.policy_manual_agent') },
            { value: 'auto_agent', label: t('pipelines.policy_auto_agent') },
          ]}
        />

        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            className="text-xs px-2.5 py-1 rounded-md"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--secondary-text)', cursor: 'pointer' }}
          >
            {t('pipelines.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1"
            style={{
              background: 'var(--accent)',
              color: 'var(--dome-on-accent)',
              border: 'none',
              cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
              opacity: submitting || !title.trim() ? 0.6 : 1,
            }}
          >
            <Plus size={12} />
            {submitting ? t('pipelines.creating') : t('pipelines.create')}
          </button>
        </div>
      </div>
    </form>
  );
}
