import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Activity01Icon, BotIcon, ChevronRightIcon, LayoutGridIcon, LayoutThreeColumnIcon, Loading03Icon, PlusSignIcon, WorkflowSquare01Icon, ZapIcon } from '@hugeicons/core-free-icons';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { listAutomations, listRuns, type AutomationDefinition } from '@/lib/automations/api';
import type { ExecutionPolicy } from '@/lib/pipelines/types';

interface TemplateDef {
  key: string;
  stages: Array<{ titleKey?: string; title: string; executionPolicy?: ExecutionPolicy; isTerminal?: boolean }>;
}

interface DashboardProps {
  onOpenPipeline?: (id: string) => void;
  onOpenAgents?: () => void;
  onOpenWorkflows?: () => void;
  onOpenAutomations?: () => void;
  onOpenRuns?: () => void;
}

const pipelineDashboardCardStyle = { background: 'var(--card)', border: '1px solid var(--border)' } as const;

/**
 * Pipelines hub. The landing screen for the Pipelines tab: it surfaces metrics
 * across the whole workspace and acts as a router to the Kanban board, Agents,
 * Workflows, Automations and their Runs — plus quick access to existing
 * agents/workflows/automations. Never a blank screen (no-empty-screens rule).
 */
export default function PipelinesDashboard({
  onOpenPipeline,
  onOpenAgents,
  onOpenWorkflows,
  onOpenAutomations,
  onOpenRuns,
}: DashboardProps) {
  const { t } = useTranslation();
  const agents = usePipelinesStore((s) => s.agents);
  const workflows = usePipelinesStore((s) => s.workflows);
  const pipelines = usePipelinesStore((s) => s.pipelines);
  const createPipeline = usePipelinesStore((s) => s.createPipeline);
  const createPipelineWithStages = usePipelinesStore((s) => s.createPipelineWithStages);
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [busy, setBusy] = useState<string | null>(null);
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [runsCount, setRunsCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listAutomations({ projectId }).catch(() => [] as AutomationDefinition[]),
      listRuns({ projectId, limit: 100 }).catch(() => []),
    ]).then(([autos, runs]) => {
      if (cancelled) return;
      setAutomations(autos);
      // The Runs view hides Many runs (ownerType 'many'), so count the same way
      // to keep the hub number consistent with what the user sees there.
      setRunsCount(runs.filter((r) => r.ownerType !== 'many').length);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const openFirstPipeline = () => {
    if (pipelines[0]) onOpenPipeline?.(pipelines[0].id);
  };

  // Top-level navigation cards (the "flow" the user asked for).
  const navCards = [
    {
      key: 'kanban',
      icon: LayoutThreeColumnIcon,
      label: t('pipelines.nav_kanban'),
      desc: t('pipelines.nav_kanban_desc'),
      count: pipelines.length,
      onClick: openFirstPipeline,
      disabled: pipelines.length === 0,
    },
    { key: 'agents', icon: BotIcon, label: t('pipelines.manage_agents'), desc: t('pipelines.nav_agents_desc'), count: agents.length, onClick: onOpenAgents },
    { key: 'workflows', icon: WorkflowSquare01Icon, label: t('pipelines.manage_workflows'), desc: t('pipelines.nav_workflows_desc'), count: workflows.length, onClick: onOpenWorkflows },
    { key: 'automations', icon: ZapIcon, label: t('pipelines.manage_automations'), desc: t('pipelines.nav_automations_desc'), count: automations.length, onClick: onOpenAutomations },
    { key: 'runs', icon: Activity01Icon, label: t('pipelines.segment_runs'), desc: t('pipelines.nav_runs_desc'), count: runsCount, onClick: onOpenRuns },
  ];

  // Quick-access lists — only for entities that actually have items, so the
  // hub never shows empty "None" placeholders.
  const quickAccess = useMemo(
    () =>
      [
        { key: 'agents', label: t('pipelines.manage_agents'), icon: BotIcon, items: agents.slice(0, 6).map((a) => a.name), onOpen: onOpenAgents },
        { key: 'workflows', label: t('pipelines.manage_workflows'), icon: WorkflowSquare01Icon, items: workflows.slice(0, 6).map((w) => w.name), onOpen: onOpenWorkflows },
        { key: 'automations', label: t('pipelines.manage_automations'), icon: ZapIcon, items: automations.slice(0, 6).map((a) => a.title), onOpen: onOpenAutomations },
      ].filter((qa) => qa.items.length > 0),
    [agents, workflows, automations, t, onOpenAgents, onOpenWorkflows, onOpenAutomations],
  );

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
    <div className="flex flex-col h-full overflow-y-auto" style={{ minWidth: 0 }}>
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-xl font-semibold text-foreground">
          {t('pipelines.dashboard_title')}
        </h1>
        <p className="text-sm mt-1 text-muted-foreground">
          {t('pipelines.dashboard_subtitle')}
        </p>
      </div>

      {/* Navigation hub */}
      <div className="px-6 py-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {navCards.map((n) => {
          const navIcon = n.icon;
          return (
            <Button
              key={n.key}
              type="button"
              onClick={n.onClick}
              disabled={n.disabled}
              className="text-left rounded-xl p-4 flex flex-col gap-2 transition-colors group"
              style={{ ...pipelineDashboardCardStyle, cursor: n.disabled ? 'not-allowed' : 'pointer', opacity: n.disabled ? 0.6 : 1 }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center justify-center rounded-lg"
                  style={{ width: 34, height: 34, background: 'var(--muted)', color: 'var(--primary)' }}
                >
                  <HugeiconsIcon icon={navIcon} size={18} />
                </span>
                <span className="text-xl font-semibold tabular-nums text-foreground">
                  {n.count}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                {n.label}
                <HugeiconsIcon icon={ChevronRightIcon} size={14} className="text-muted-foreground" />
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {n.desc}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Quick access to created entities — only rendered when something exists */}
      {quickAccess.length > 0 && (
        <div className="px-6 py-3">
          <h2 className="text-sm font-semibold mb-2 text-foreground">
            {t('pipelines.quick_access', { defaultValue: 'Quick access' })}
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {quickAccess.map((qa) => {
              const qaIcon = qa.icon;
              return (
                <div key={qa.key} className="rounded-lg p-3 flex flex-col gap-2" style={pipelineDashboardCardStyle}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <HugeiconsIcon icon={qaIcon} size={14} className="text-primary" />
                      {qa.label}
                    </span>
                    <Button
                      type="button"
                      onClick={qa.onOpen}
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {t('common.view', { defaultValue: 'View all' })}
                    </Button>
                  </div>
                  <ul className="flex flex-col">
                    {qa.items.map((name, i) => (
                      <li key={i}>
                        <Button
                          type="button"
                          onClick={qa.onOpen}
                          className="w-full text-left text-xs py-1 px-1.5 rounded truncate transition-colors hover:bg-accent"
                          style={{ color: 'var(--muted-foreground)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          {name}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Existing pipelines */}
      {pipelines.length > 0 && (
        <div className="px-6 py-3">
          <h2 className="text-sm font-semibold mb-2 text-foreground">
            {t('pipelines.kpi_pipelines')}
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {pipelines.map((p) => (
              <Button
                key={p.id}
                type="button"
                onClick={() => onOpenPipeline?.(p.id)}
                className="text-left rounded-lg p-3 flex items-center gap-2 transition-colors"
                style={{ ...pipelineDashboardCardStyle, cursor: 'pointer' }}
              >
                <HugeiconsIcon icon={LayoutGridIcon} size={15} className="text-primary" />
                <span className="text-sm font-medium truncate text-foreground">
                  {p.name}
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Quick start */}
      <div className="px-6 py-3 pb-6">
        <h2 className="text-sm font-semibold mb-2 text-foreground">
          {t('pipelines.quick_start')}
        </h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          <Button
            type="button"
            onClick={() => void createBlank()}
            disabled={busy !== null}
            className="text-left rounded-lg p-3 flex flex-col gap-1 transition-colors"
            style={{ background: 'var(--card)', border: '1px dashed var(--border)', cursor: busy ? 'wait' : 'pointer' }}
          >
            <span className="inline-flex items-center gap-1.5 font-medium text-sm text-foreground">
              {busy === 'blank' ? <HugeiconsIcon icon={Loading03Icon} size={15} className="animate-spin" /> : <HugeiconsIcon icon={PlusSignIcon} size={15} className="text-primary" />}
              {t('pipelines.template_blank')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('pipelines.template_blank_desc')}
            </span>
          </Button>

          {templates.map((tpl) => (
            <Button
              key={tpl.key}
              type="button"
              onClick={() => void runTemplate(tpl)}
              disabled={busy !== null}
              className="text-left rounded-lg p-3 flex flex-col gap-1 transition-colors"
              style={{ ...pipelineDashboardCardStyle, cursor: busy ? 'wait' : 'pointer' }}
            >
              <span className="inline-flex items-center gap-1.5 font-medium text-sm text-foreground">
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
              <span className="text-[11px] mt-1 inline-flex flex-wrap gap-1">
                {tpl.stages.map((s, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--accent)', color: 'var(--muted-foreground)' }}
                  >
                    {s.title}
                  </span>
                ))}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
