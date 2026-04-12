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
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { useTranslation } from 'react-i18next';
import HubPageLayout from '@/components/ui/HubPageLayout';
import HubSecondaryNav from '@/components/ui/HubSecondaryNav';
import AutomationsWorkspaceView, {
  type AutomationFilter,
} from '@/components/hub/AutomationsWorkspaceView';
import RunsWorkspaceView from '@/components/hub/RunsWorkspaceView';

export type HubTab = 'agents' | 'workflows' | 'automations' | 'runs';

const HUB_TAB_STORAGE_KEY = 'dome:hub:activeTab';
const HUB_AGENT_STORAGE_KEY = 'dome:hub:selectedAgentId';
const PENDING_AUTOMATIONS_FILTER_KEY = 'dome:hub:pendingAutomationsFilter';

function readStoredHubTab(): HubTab {
  try {
    const v = sessionStorage.getItem(HUB_TAB_STORAGE_KEY);
    if (v === 'agents' || v === 'workflows' || v === 'automations' || v === 'runs') return v;
  } catch {
    /* ignore */
  }
  return 'agents';
}

function readStoredSelectedAgentId(): string | null {
  try {
    const v = sessionStorage.getItem(HUB_AGENT_STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => readStoredSelectedAgentId());
  const [automationsListEpoch, setAutomationsListEpoch] = useState(0);

  const activeShellTabId = useTabStore((s) => s.activeTabId);
  const shellTabs = useTabStore((s) => s.tabs);
  const automationsShellTabId = shellTabs.find((tab) => tab.type === 'automations')?.id;
  const automationsShellVisible = automationsShellTabId != null && activeShellTabId === automationsShellTabId;
  const prevAutomationsShellVisible = useRef<boolean | null>(null);

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
      setAutomationsListEpoch((n) => n + 1);
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
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const isWorkflowCanvasActive = typeof homeSidebarSection === 'string' && homeSidebarSection.startsWith('workflow:');

  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);

  useEffect(() => {
    const refreshMeta = () => {
      getManyAgents(hubProjectId).then(setAgents).catch(() => {});
      getWorkflows(hubProjectId).then(setWorkflows).catch(() => {});
    };
    refreshMeta();
    window.addEventListener('dome:agents-changed', refreshMeta);
    window.addEventListener('dome:workflows-changed', refreshMeta);
    return () => {
      window.removeEventListener('dome:agents-changed', refreshMeta);
      window.removeEventListener('dome:workflows-changed', refreshMeta);
    };
  }, [hubProjectId]);

  useEffect(() => {
    if (activeTab !== 'automations') return;
    getManyAgents(hubProjectId).then(setAgents).catch(() => {});
    getWorkflows(hubProjectId).then(setWorkflows).catch(() => {});
  }, [activeTab, hubProjectId]);

  useEffect(() => {
    const prev = prevAutomationsShellVisible.current;
    const becameVisible = prev === false && automationsShellVisible;
    prevAutomationsShellVisible.current = automationsShellVisible;
    if (becameVisible && activeTab === 'automations') {
      setAutomationsListEpoch((n) => n + 1);
    }
  }, [automationsShellVisible, activeTab]);

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

  return (
    <HubPageLayout
      secondaryNav={
        !shellHubTab ? (
          <HubSecondaryNav tabs={hubTabs} activeId={activeTab} onChange={handleTabChange} />
        ) : undefined
      }
    >
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
            <AgentCanvasView />
          ) : (
            <WorkflowLibraryView
              onShowAutomations={(id, label) => handleShowAutomations('workflow', id, label)}
            />
          )}
        </div>
      )}
      {activeTab === 'automations' && (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
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
          <div className="flex-1 min-h-0 overflow-hidden">
            <AutomationsWorkspaceView
              key={`${hubProjectId}:${automationsFilter?.targetId ?? 'all'}:${automationsListEpoch}`}
              projectId={hubProjectId}
              initialFilter={automationsFilter}
              agents={agents}
              workflows={workflows}
            />
          </div>
        </div>
      )}
      {activeTab === 'runs' && <RunsWorkspaceView />}
    </HubPageLayout>
  );
}
