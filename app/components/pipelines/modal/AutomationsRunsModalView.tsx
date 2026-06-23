import { Suspense, lazy, useState } from 'react';
import { Activity, Loader2, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';

const AutomationsWorkspaceView = lazy(() => import('@/components/hub/AutomationsWorkspaceView'));
const RunsWorkspaceView = lazy(() => import('@/components/hub/RunsWorkspaceView'));

type Segment = 'automations' | 'runs';

interface Props {
  projectId: string;
  agents: ManyAgent[];
  workflows: CanvasWorkflow[];
  initialSegment?: Segment;
}

/**
 * Combined "Automations + Runs" management surface for the Pipelines modal.
 * A DomeSegmentedControl swaps between the automations list (which needs full
 * agent/workflow objects to populate its selectors) and the runs/executions
 * list. Both are lazy-loaded and designed to fill a DomeModal size="full".
 */
export default function AutomationsRunsModalView({ projectId, agents, workflows, initialSegment = 'automations' }: Props) {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<Segment>(initialSegment);

  const options = [
    { value: 'automations', label: t('pipelines.segment_automations'), icon: <Zap className="size-3.5" /> },
    { value: 'runs', label: t('pipelines.segment_runs'), icon: <Activity className="size-3.5" /> },
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <DomeSegmentedControl
        options={options}
        value={segment}
        onChange={(v) => setSegment(v as Segment)}
        aria-label={t('pipelines.manage_automations_runs')}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="animate-spin" size={20} style={{ color: 'var(--tertiary-text)' }} />
            </div>
          }
        >
          {segment === 'automations' && (
            <AutomationsWorkspaceView projectId={projectId} agents={agents} workflows={workflows} />
          )}
          {segment === 'runs' && <RunsWorkspaceView />}
        </Suspense>
      </div>
    </div>
  );
}
