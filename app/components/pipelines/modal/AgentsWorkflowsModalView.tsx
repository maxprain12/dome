import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { Bot, Workflow, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import { HubWorkspaceProvider, type HubWorkspaceContextValue } from '@/lib/context/HubWorkspaceContext';

const AgentManagementView = lazy(() => import('@/components/agents/AgentManagementView'));
const WorkflowLibraryView = lazy(() => import('@/components/agent-canvas/WorkflowLibraryView'));
const AgentCanvasView = lazy(() => import('@/components/agent-canvas/AgentCanvasView'));

type Segment = 'agents' | 'workflows';

interface Props {
  initialSegment?: Segment;
}

/**
 * Combined "Agents + Workflows" management surface for the Pipelines modal.
 *
 * WorkflowLibraryView opens the canvas through the HubWorkspace context (it has
 * no router of its own). Outside the Home hub that context is null, so "New
 * workflow" silently no-ops — which is why it appeared broken in this modal.
 * We provide our own HubWorkspace here that swaps the body to the canvas editor.
 */
export default function AgentsWorkflowsModalView({ initialSegment = 'agents' }: Props = {}) {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);

  const hubWorkspace = useMemo<HubWorkspaceContextValue>(
    () => ({
      openWorkflowCanvas: (workflowId: string) => setActiveWorkflowId(workflowId),
      openNewWorkflowCanvas: () => setActiveWorkflowId('new'),
      closeWorkflowCanvas: () => setActiveWorkflowId(null),
      reportAutomationsFormMode: () => {},
      reportRunsDetailActive: () => {},
    }),
    [],
  );

  const closeCanvas = useCallback(() => setActiveWorkflowId(null), []);

  const options = [
    { value: 'agents', label: t('pipelines.segment_agents'), icon: <Bot className="size-3.5" /> },
    { value: 'workflows', label: t('pipelines.segment_workflows'), icon: <Workflow className="size-3.5" /> },
  ];

  const canvasActive = segment === 'workflows' && activeWorkflowId != null;

  return (
    <HubWorkspaceProvider value={hubWorkspace}>
      <div className="flex h-full flex-col gap-3 overflow-hidden">
        {!canvasActive && (
          <DomeSegmentedControl
            options={options}
            value={segment}
            onChange={(v) => setSegment(v as Segment)}
            aria-label={t('pipelines.manage_agents_workflows')}
          />
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="animate-spin" size={20} style={{ color: 'var(--tertiary-text)' }} />
              </div>
            }
          >
            {segment === 'agents' && <AgentManagementView />}
            {segment === 'workflows' &&
              (canvasActive ? <AgentCanvasView onBackToLibrary={closeCanvas} /> : <WorkflowLibraryView />)}
          </Suspense>
        </div>
      </div>
    </HubWorkspaceProvider>
  );
}
