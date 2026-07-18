import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  LayoutGridIcon,
  LayoutThreeColumnIcon,
  Loading03Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import type { ExecutionPolicy } from '@/lib/pipelines/types';
import { DomainStatChips, type DomainStat } from '@/components/shared/DomainStatChips';

interface TemplateDef {
  key: string;
  stages: Array<{
    titleKey?: string;
    title: string;
    executionPolicy?: ExecutionPolicy;
    isTerminal?: boolean;
  }>;
}

interface DashboardProps {
  onOpenPipeline?: (id: string) => void;
}

const dashboardCardClass =
  'rounded-xl border border-border bg-card text-left transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50';

/**
 * Pipelines overview: KPIs, existing boards, and quick-start templates.
 * Cross-section navigation lives in the global sidebar — not here.
 */
export default function PipelinesDashboard({ onOpenPipeline }: DashboardProps) {
  const { t } = useTranslation();
  const pipelines = usePipelinesStore((s) => s.pipelines);
  const createPipeline = usePipelinesStore((s) => s.createPipeline);
  const createPipelineWithStages = usePipelinesStore((s) => s.createPipelineWithStages);
  const [busy, setBusy] = useState<string | null>(null);

  const openFirstPipeline = () => {
    if (pipelines[0]) onOpenPipeline?.(pipelines[0].id);
  };

  const stats: DomainStat[] = [
    {
      id: 'pipelines',
      label: t('pipelines.kpi_pipelines'),
      value: pipelines.length,
      tone: 'accent',
    },
  ];

  const templates: TemplateDef[] = [
    {
      key: 'marketing',
      stages: [
        { title: t('pipelines.template_marketing_s1') },
        { title: t('pipelines.template_marketing_s2'), executionPolicy: 'manual_agent' },
        { title: t('pipelines.template_marketing_s3'), executionPolicy: 'manual_agent' },
        { title: t('pipelines.template_marketing_s4'), isTerminal: true },
      ],
    },
    {
      key: 'sales',
      stages: [
        { title: t('pipelines.template_sales_s1') },
        { title: t('pipelines.template_sales_s2') },
        { title: t('pipelines.template_sales_s3') },
        { title: t('pipelines.template_sales_s4'), isTerminal: true },
      ],
    },
    {
      key: 'support',
      stages: [
        { title: t('pipelines.template_support_s1') },
        { title: t('pipelines.template_support_s2'), executionPolicy: 'manual_agent' },
        { title: t('pipelines.template_support_s3') },
        { title: t('pipelines.template_support_s4'), isTerminal: true },
      ],
    },
  ];

  const runTemplate = async (tpl: TemplateDef) => {
    setBusy(tpl.key);
    try {
      await createPipelineWithStages(t(`pipelines.template_${tpl.key}`), tpl.stages);
    } finally {
      setBusy(null);
    }
  };

  const createBlank = async () => {
    setBusy('blank');
    try {
      await createPipeline(t('pipelines.template_blank'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto">
      <div className="flex flex-col gap-y-3 px-6 pt-6 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('pipelines.dashboard_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('pipelines.dashboard_subtitle')}</p>
        </div>
        <DomainStatChips stats={stats} />
      </div>

      <div className="px-6 py-3">
        <button
          type="button"
          onClick={openFirstPipeline}
          disabled={pipelines.length === 0}
          className={cn(
            dashboardCardClass,
            'group flex w-full max-w-md flex-col items-stretch gap-2 p-4',
            pipelines.length === 0
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:bg-accent/40',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex size-[34px] items-center justify-center rounded-full bg-brand-mint text-primary">
              <HugeiconsIcon icon={LayoutThreeColumnIcon} size={18} />
            </span>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {pipelines.length}
            </span>
          </div>
          <span className="text-sm font-medium text-foreground">{t('pipelines.nav_kanban')}</span>
          <span className="text-xs leading-snug text-muted-foreground">
            {t('pipelines.nav_kanban_desc')}
          </span>
        </button>
      </div>

      {pipelines.length > 0 && (
        <div className="px-6 py-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {t('pipelines.kpi_pipelines')}
          </h3>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenPipeline?.(p.id)}
                className={cn(
                  dashboardCardClass,
                  'flex cursor-pointer items-center gap-2 p-3 hover:bg-accent/40',
                )}
              >
                <HugeiconsIcon icon={LayoutGridIcon} size={15} className="text-primary" />
                <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 py-3 pb-6">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{t('pipelines.quick_start')}</h3>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          <button
            type="button"
            onClick={() => void createBlank()}
            disabled={busy !== null}
            className={cn(
              dashboardCardClass,
              'flex flex-col items-stretch gap-1 border-dashed p-3',
              busy !== null ? 'cursor-wait' : 'cursor-pointer hover:bg-accent/40',
            )}
          >
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              {busy === 'blank' ? (
                <HugeiconsIcon icon={Loading03Icon} size={15} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={PlusSignIcon} size={15} className="text-primary" />
              )}
              {t('pipelines.template_blank')}
            </span>
            <span className="text-xs text-muted-foreground">{t('pipelines.template_blank_desc')}</span>
          </button>

          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => void runTemplate(tpl)}
              disabled={busy !== null}
              className={cn(
                dashboardCardClass,
                'flex flex-col items-stretch gap-1 p-3',
                busy !== null ? 'cursor-wait' : 'cursor-pointer hover:bg-accent/40',
              )}
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                {busy === tpl.key ? (
                  <HugeiconsIcon icon={Loading03Icon} size={15} className="animate-spin" />
                ) : (
                  <HugeiconsIcon icon={LayoutGridIcon} size={15} className="text-primary" />
                )}
                {t(`pipelines.template_${tpl.key}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`pipelines.template_${tpl.key}_desc`)}
              </span>
              <span className="mt-1 inline-flex flex-wrap gap-1 text-[11px]">
                {tpl.stages.map((s, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-accent px-1.5 py-0.5 text-muted-foreground"
                  >
                    {s.title}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
