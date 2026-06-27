'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Bot, Workflow, Zap, Activity } from 'lucide-react';
import AgentManagementView from '@/components/agents/AgentManagementView';
import AgentChatView from '@/components/agents/AgentChatView';
import AgentCanvasView from '@/components/agent-canvas/AgentCanvasView';
import WorkflowLibraryView from '@/components/agent-canvas/WorkflowLibraryView';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { getManyAgents } from '@/lib/agents/api';
import { getWorkflows } from '@/lib/agent-canvas/api';
import { HUB_AGENTS_CHANGED, HUB_WORKFLOWS_CHANGED } from '@/lib/hub/hubEvents';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { useTranslation } from 'react-i18next';
import HubPageLayout from '@/components/ui/HubPageLayout';
import HubSecondaryNav from '@/components/ui/HubSecondaryNav';
import { EditorialShell } from '@/components/home/editorial/EditorialShell';
import { HubTabHero } from '@/components/hub/HubTabHero';
import { EditorialHubProvider } from '@/lib/context/EditorialHubContext';
import {
  HubWorkspaceProvider,
  type HubAutomationsFormMode,
} from '@/lib/context/HubWorkspaceContext';
import AutomationsWorkspaceView, {
  type AutomationFilter,
} from '@/components/hub/AutomationsWorkspaceView';
import RunsWorkspaceView from '@/components/hub/RunsWorkspaceView';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import {
  HUB_TAB_STORAGE_KEY,
  HUB_AGENT_STORAGE_KEY,
  HUB_WORKFLOW_STORAGE_KEY,
  PENDING_AUTOMATIONS_FILTER_KEY,
} from '@/lib/hub/hubStorageKeys';

export type HubTab = 'agents' | 'workflows' | 'automations' | 'runs';
export { PENDING_RUN_ID_KEY } from '@/lib/hub/hubStorageKeys';

function readStoredHubTab(): HubTab {
  try {
    const v = sessionStorage.getItem(HUB_TAB_STORAGE_KEY);
    if (v === 'agents' || v === 'workflows' || v === 'automations' || v === 'runs') return v;
  } catch {
    /* ignore */
  }
  return 'agents';
}

interface AutomationsHubViewProps {
  onAgentSelect?: (agentId: string) => void;
  shellHubTab?: HubTab;
}

export default function AutomationsHubView({ onAgentSelect, shellHubTab }: AutomationsHubViewProps) {
  const { t } = useTranslation();
  const hubTabs = useMemo(
    () =>
      [
        { id: 'agents' as const, label: t('automationHub.tab_agents'), icon: Bot },
        { id: 'workflows' as const, label: t('automationHub.tab_workflows'), icon: Workflow },
        { id: 'automations' as const, label: t('automationHub.tab_automations'), icon: Zap },
        { id: 'runs' as const, label: t('automationHub.tab_runs'), icon: Activity },
      ] as const,
    [t],
  );

  const [activeTab, setActiveTab] = useState<HubTab>(() => shellHubTab ?? readStoredHubTab());
  const [automationsFilter, setAutomationsFilter] = useState<AutomationFilter | undefined>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [automationsFormMode, setAutomationsFormMode] = useState<HubAutomationsFormMode>('hidden');
  const [runsDetailActive, setRunsDetailActive] = useState(false);

  const activeShellTabId = useTabStore((s) => s.activeTabId);
  const shellTabs = useTabStore((s) => s.tabs);
  const automationsShellTabId = shellTabs.find((tab) => tab.type === 'automations')?.id;
  const runsShellTabId = shellTabs.find((tab) => tab.type === 'runs')?.id;
  const automationsShellVisible = automationsShellTabId != null && activeShellTabId === automationsShellTabId;
  const runsShellVisible = runsShellTabId != null && activeShellTabId === runsShellTabId;
  const prevAutomationsShellVisible = useRef<boolean | null>(null);
  const prevRunsShellVisible = useRef<boolean | null>(null);
  const automationsSilentRefreshRef = useRef<(() => void) | null>(null);
  const runsSilentRefreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (shellHubTab) setActiveTab(shellHubTab);
  }, [shellHubTab]);

  useEffect(() => {
    if (shellHubTab !== 'automations') return;
    if (!automationsShellTabId || activeShellTabId !== automationsShellTabId) return;
    try {
      const raw = sessionStorage.getItem(PENDING_AUTOMATIONS_FILTER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AutomationFilter;
      sessionStorage.removeItem(PENDING_AUTOMATIONS_FILTER_KEY);
      setAutomationsFilter(parsed);
    } catch {
      try {
        sessionStorage.removeItem(PENDING_AUTOMATIONS_FILTER_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [shellHubTab, activeShellTabId, automationsShellTabId]);

  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const hubProjectName = useAppStore((s) => s.currentProject?.name);
  const prevHubProjectId = useRef(hubProjectId);

  // Do not restore agent/workflow detail views from sessionStorage — Electron keeps
  // sessionStorage across restarts, which resurfaced stale chats from weeks ago.
  useEffect(() => {
    try {
      sessionStorage.removeItem(HUB_AGENT_STORAGE_KEY);
      sessionStorage.removeItem(HUB_WORKFLOW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);

  useEffect(() => {
    const refreshMeta = () => {
      const pid = hubProjectId;
      getManyAgents(pid).then(setAgents).catch(() => {});
      getWorkflows(pid).then(setWorkflows).catch(() => {});
    };
    refreshMeta();
    window.addEventListener(HUB_AGENTS_CHANGED, refreshMeta);
    window.addEventListener(HUB_WORKFLOWS_CHANGED, refreshMeta);
    return () => {
      window.removeEventListener(HUB_AGENTS_CHANGED, refreshMeta);
      window.removeEventListener(HUB_WORKFLOWS_CHANGED, refreshMeta);
    };
  }, [hubProjectId]);

  useEffect(() => {
    if (activeTab !== 'automations') return;
    getManyAgents(hubProjectId).then(setAgents).catch(() => {});
    getWorkflows(hubProjectId).then(setWorkflows).catch(() => {});
  }, [activeTab, hubProjectId]);

  useEffect(() => {
    if (prevHubProjectId.current === hubProjectId) return;
    prevHubProjectId.current = hubProjectId;
    setSelectedAgentId(null);
    setActiveWorkflowId(null);
    setAutomationsFormMode('hidden');
    setRunsDetailActive(false);
    setAutomationsFilter(undefined);
    try {
      sessionStorage.removeItem(HUB_AGENT_STORAGE_KEY);
      sessionStorage.removeItem(HUB_WORKFLOW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [hubProjectId]);

  useEffect(() => {
    if (!selectedAgentId || agents.length === 0) return;
    if (!agents.some((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(null);
      try {
        sessionStorage.removeItem(HUB_AGENT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    const prev = prevAutomationsShellVisible.current;
    const becameVisible = prev === false && automationsShellVisible;
    prevAutomationsShellVisible.current = automationsShellVisible;
    if (becameVisible && (shellHubTab === 'automations' || activeTab === 'automations')) {
      automationsSilentRefreshRef.current?.();
    }
  }, [automationsShellVisible, activeTab, shellHubTab]);

  useEffect(() => {
    const prev = prevRunsShellVisible.current;
    const becameVisible = prev === false && runsShellVisible;
    prevRunsShellVisible.current = runsShellVisible;
    if (becameVisible && (shellHubTab === 'runs' || activeTab === 'runs')) {
      runsSilentRefreshRef.current?.();
    }
  }, [runsShellVisible, activeTab, shellHubTab]);

  const handleShowAutomations = useCallback(
    (targetType: 'agent' | 'workflow', targetId: string, targetLabel: string) => {
      const filter: AutomationFilter = { targetType, targetId, targetLabel };
      if (shellHubTab != null) {
        try {
          sessionStorage.setItem(PENDING_AUTOMATIONS_FILTER_KEY, JSON.stringify(filter));
        } catch {
          /* ignore */
        }
        useTabStore.getState().openAutomationsTab();
        return;
      }
      setAutomationsFilter(filter);
      setActiveTab('automations');
    },
    [shellHubTab],
  );

  const handleTabChange = useCallback(
    (tab: HubTab) => {
      setActiveTab(tab);
      if (!shellHubTab) {
        try {
          sessionStorage.setItem(HUB_TAB_STORAGE_KEY, tab);
        } catch {
          /* ignore */
        }
      }
      if (tab !== 'agents') {
        setSelectedAgentId(null);
        try {
          sessionStorage.removeItem(HUB_AGENT_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      if (tab !== 'workflows') {
        setActiveWorkflowId(null);
        try {
          sessionStorage.removeItem(HUB_WORKFLOW_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    },
    [shellHubTab],
  );

  const handleAgentSelectFromLibrary = useCallback(
    (id: string) => {
      setSelectedAgentId(id);
      try {
        sessionStorage.setItem(HUB_AGENT_STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      onAgentSelect?.(id);
    },
    [onAgentSelect],
  );

  const handleAgentChatBack = useCallback(() => {
    setSelectedAgentId(null);
    try {
      sessionStorage.removeItem(HUB_AGENT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const openWorkflowCanvas = useCallback((workflowId: string) => {
    setActiveWorkflowId(workflowId);
    try {
      sessionStorage.setItem(HUB_WORKFLOW_STORAGE_KEY, workflowId);
    } catch {
      /* ignore */
    }
  }, []);

  const openNewWorkflowCanvas = useCallback(() => {
    setActiveWorkflowId('new');
    try {
      sessionStorage.setItem(HUB_WORKFLOW_STORAGE_KEY, 'new');
    } catch {
      /* ignore */
    }
  }, []);

  const closeWorkflowCanvas = useCallback(() => {
    setActiveWorkflowId(null);
    try {
      sessionStorage.removeItem(HUB_WORKFLOW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!activeWorkflowId) return;
    if (activeWorkflowId === 'new') {
      useCanvasStore.getState().clearCanvas();
      return;
    }
    const canvas = useCanvasStore.getState();
    if (canvas.activeWorkflowId === activeWorkflowId) return;
    void getWorkflows(hubProjectId).then((wfs) => {
      const wf = wfs.find((w) => w.id === activeWorkflowId);
      if (wf) {
        useCanvasStore.getState().loadWorkflow(wf);
      } else {
        closeWorkflowCanvas();
      }
    });
  }, [activeWorkflowId, hubProjectId, closeWorkflowCanvas]);

  const reportAutomationsFormMode = useCallback((mode: HubAutomationsFormMode) => {
    setAutomationsFormMode(mode);
  }, []);

  const reportRunsDetailActive = useCallback((active: boolean) => {
    setRunsDetailActive(active);
  }, []);

  const hubWorkspaceValue = useMemo(
    () => ({
      openWorkflowCanvas,
      openNewWorkflowCanvas,
      closeWorkflowCanvas,
      reportAutomationsFormMode,
      reportRunsDetailActive,
    }),
    [
      openWorkflowCanvas,
      openNewWorkflowCanvas,
      closeWorkflowCanvas,
      reportAutomationsFormMode,
      reportRunsDetailActive,
    ],
  );

  const effectiveTab = shellHubTab ?? activeTab;
  const isWorkflowCanvasActive = activeWorkflowId != null;

  const hubInDetailMode = useMemo(() => {
    switch (effectiveTab) {
      case 'agents':
        return selectedAgentId != null;
      case 'workflows':
        return isWorkflowCanvasActive;
      case 'automations':
        return automationsFormMode !== 'hidden';
      case 'runs':
        return runsDetailActive;
      default:
        return false;
    }
  }, [effectiveTab, selectedAgentId, isWorkflowCanvasActive, automationsFormMode, runsDetailActive]);

  const workspaceBody = (
    <>
      {activeTab === 'agents' && (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
          {selectedAgentId ? (
            <AgentChatView agentId={selectedAgentId} onBack={handleAgentChatBack} />
          ) : (
            <AgentManagementView
              onAgentSelect={handleAgentSelectFromLibrary}
              onShowAutomations={(id, label) => handleShowAutomations('agent', id, label)}
            />
          )}
        </div>
      )}
      {activeTab === 'workflows' && (
        <div className="h-full min-h-0 flex flex-col overflow-hidden relative">
          {isWorkflowCanvasActive ? (
            <AgentCanvasView onBackToLibrary={closeWorkflowCanvas} />
          ) : (
            <WorkflowLibraryView
              onShowAutomations={(id, label) => handleShowAutomations('workflow', id, label)}
            />
          )}
        </div>
      )}
      {activeTab === 'automations' && (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          {automationsFormMode === 'hidden' ? (
            <div
              className="shrink-0 px-4 py-2.5 text-[11px] leading-snug border-b"
              style={{
                borderColor: 'var(--dome-border)',
                color: 'var(--dome-text-muted)',
                background: 'color-mix(in srgb, var(--dome-accent) 6%, var(--dome-surface))',
              }}
            >
              {t('automationHub.automations_scope_banner', {
                name: hubProjectName ?? hubProjectId,
              })}
            </div>
          ) : null}
          <div className="flex-1 min-h-0 overflow-hidden">
            <AutomationsWorkspaceView
              projectId={hubProjectId}
              initialFilter={automationsFilter}
              agents={agents}
              workflows={workflows}
              onRegisterSilentRefresh={(fn) => {
                automationsSilentRefreshRef.current = fn;
              }}
            />
          </div>
        </div>
      )}
      {activeTab === 'runs' && (
        <RunsWorkspaceView
          onRegisterSilentRefresh={(fn) => {
            runsSilentRefreshRef.current = fn;
          }}
        />
      )}
    </>
  );

  if (shellHubTab) {
    const showHero = !hubInDetailMode;
    return (
      <EditorialHubProvider active>
        <HubWorkspaceProvider value={hubWorkspaceValue}>
          <EditorialShell
            shellClassName="hub-tab-shell"
            variant="split"
            body={workspaceBody}
            bodyClassName={showHero ? '' : 'hub-workspace-body--detail'}
          >
            {showHero ? (
              <HubTabHero
                tab={shellHubTab}
                projectName={hubProjectName ?? hubProjectId}
              />
            ) : null}
          </EditorialShell>
        </HubWorkspaceProvider>
      </EditorialHubProvider>
    );
  }

  return (
    <HubWorkspaceProvider value={hubWorkspaceValue}>
      <HubPageLayout
        secondaryNav={
          !shellHubTab ? (
            <HubSecondaryNav tabs={hubTabs} activeId={activeTab} onChange={handleTabChange} />
          ) : undefined
        }
      >
        {workspaceBody}
      </HubPageLayout>
    </HubWorkspaceProvider>
  );
}
