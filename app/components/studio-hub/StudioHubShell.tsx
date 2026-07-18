import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Activity01Icon,
  BotIcon,
  GitBranchIcon,
  FolderKanbanIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { HubHeader } from '@/components/hub/HubHeader';
import { HubSearch } from '@/components/hub/HubSearch';
import { useTabStore } from '@/lib/store/useTabStore';
import { cn } from '@/lib/utils';
import { StudioStats, type StudioStat } from './StudioStats';

export type StudioSection = 'pipelines' | 'agents' | 'workflows' | 'automations' | 'runs';

const SECTION_ICONS: Record<StudioSection, IconSvgElement> = {
  pipelines: FolderKanbanIcon,
  agents: BotIcon,
  workflows: GitBranchIcon,
  automations: ZapIcon,
  runs: Activity01Icon,
};

export interface StudioHubShellProps {
  section: StudioSection;
  title: string;
  description?: string;
  actions?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  stats?: StudioStat[];
  toolbar?: ReactNode;
  /** When true, KPI strip collapses to denser chips. */
  compact?: boolean;
  /** `scroll` = single column list; `split` = master–detail (StudioHubBody). */
  layout?: 'scroll' | 'split';
  children: ReactNode;
  className?: string;
}

/** Shared agentic chrome for Pipelines / Agents / Workflows / Automations / Runs. */
export function StudioHubShell({
  section,
  title,
  description,
  actions,
  search,
  stats = [],
  toolbar,
  compact,
  layout = 'scroll',
  children,
  className,
}: StudioHubShellProps) {
  const { t } = useTranslation();
  const {
    openPipelinesTab,
    openAgentsTab,
    openWorkflowsTab,
    openAutomationsTab,
    openRunsTab,
  } = useTabStore();

  const crossNav: Array<{ key: StudioSection; label: string; open: () => void }> = [
    { key: 'pipelines', label: t('tabs.pipelines'), open: openPipelinesTab },
    { key: 'agents', label: t('tabs.agents'), open: openAgentsTab },
    { key: 'workflows', label: t('tabs.workflows'), open: openWorkflowsTab },
    { key: 'automations', label: t('tabs.automations'), open: openAutomationsTab },
    { key: 'runs', label: t('tabs.runs'), open: openRunsTab },
  ];

  return (
    <div
      className={cn(
        '@container/studio flex h-full min-h-0 flex-col overflow-hidden bg-background',
        className,
      )}
    >
      <div className="shrink-0 space-y-3 border-b bg-card px-4 py-3 sm:px-6">
        <HubHeader title={title} description={description} actions={actions} />
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {crossNav.map(({ key, label, open }) => {
            const active = key === section;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (!active) open();
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                  active
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <HugeiconsIcon icon={SECTION_ICONS[key]} className="size-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        {search ? (
          <HubSearch
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder ?? t('orchestration.agent_search')}
          />
        ) : null}
        {stats.length > 0 ? <StudioStats stats={stats} compact={compact} /> : null}
        {toolbar}
      </div>
      <div
        className={cn(
          'relative min-h-0 flex-1',
          layout === 'split' ? 'flex overflow-hidden' : 'overflow-y-auto',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Master–detail body slot used by studio hubs. */
export function StudioHubBody({
  master,
  detail,
  detailOpen,
}: {
  master: ReactNode;
  detail?: ReactNode;
  detailOpen: boolean;
}) {
  return (
    <>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">{master}</div>
      {detailOpen && detail ? (
        <div
          className={cn(
            'flex min-h-0 shrink-0 flex-col border-l bg-background',
            'absolute inset-0 z-10 md:static md:w-[28rem] lg:w-[32rem]',
          )}
        >
          {detail}
        </div>
      ) : null}
    </>
  );
}
