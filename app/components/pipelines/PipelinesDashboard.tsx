import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  LayoutGridIcon,
  Loading03Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import type { ExecutionPolicy } from '@/lib/pipelines/types';
import { DashboardDataTable } from '@/components/shared/dashboard/DashboardDataTable';
import { DashboardSectionCards } from '@/components/shared/dashboard/DashboardSectionCards';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';

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
    <div className="flex h-full min-w-0 flex-col overflow-y-auto p-6">
      <div className="flex flex-col gap-6">
        <DashboardSectionCards
          items={[
            {
              id: 'pipelines',
              label: t('pipelines.kpi_pipelines'),
              value: pipelines.length,
            },
          ]}
        />
        <DashboardDataTable
          columns={[
            { id: 'name', header: t('pipelines.kpi_pipelines'), cell: (row) => row.name },
          ]}
          rows={pipelines.map((p) => ({ id: p.id, name: p.name }))}
          emptyTitle={t('pipelines.dashboard_subtitle')}
          onRowClick={(row) => onOpenPipeline?.(row.id)}
        />

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{t('pipelines.quick_start')}</h3>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            <button
              type="button"
              onClick={() => {
                createBlank().catch(() => {});
              }}
              disabled={busy !== null}
              className={cn(
                selectionSurfaceClass(false, dashboardCardClass),
                'flex flex-col items-stretch gap-1 border-dashed p-3',
                busy !== null && 'cursor-wait',
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
                onClick={() => {
                  runTemplate(tpl).catch(() => {});
                }}
                disabled={busy !== null}
                className={cn(
                  selectionSurfaceClass(false, dashboardCardClass),
                  'flex flex-col items-stretch gap-1 p-3',
                  busy !== null && 'cursor-wait',
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
                      key={`${tpl.key}-${i}`}
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
    </div>
  );
}
