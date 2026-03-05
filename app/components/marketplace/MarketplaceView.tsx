'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Store, Bot, Workflow, Sparkles } from 'lucide-react';
import type { MarketplaceAgent } from '@/types';
import type { WorkflowTemplate } from '@/types/canvas';
import {
  getMarketplaceAgents,
  getInstalledMarketplaceAgentIds,
  installMarketplaceAgent,
  getInstalledWorkflowTemplateIds,
  installWorkflowTemplate,
  getWorkflowIdForTemplate,
} from '@/lib/marketplace/api';
import { loadMarketplaceWorkflows } from '@/lib/marketplace/loaders';
import { MARKETPLACE_TAGS, type MarketplaceTag } from '@/lib/marketplace/catalog';
import { WORKFLOW_TAGS, type WorkflowTag } from '@/lib/marketplace/workflow-catalog';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getWorkflow } from '@/lib/agent-canvas/api';
import MarketplaceAgentCard from './MarketplaceAgentCard';
import MarketplaceAgentDetail from './MarketplaceAgentDetail';
import WorkflowCard from './WorkflowCard';
import WorkflowDetail from './WorkflowDetail';

const TAG_LABELS: Record<string, string> = {
  all: 'Todos',
  research: 'Investigación',
  writing: 'Escritura',
  coding: 'Código',
  data: 'Datos',
  education: 'Educación',
  productivity: 'Productividad',
  content: 'Contenido',
  language: 'Idiomas',
  marketing: 'Marketing',
};

type MarketplaceTab = 'agents' | 'workflows';

export default function MarketplaceView() {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('agents');

  // Agents state
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<MarketplaceTag>('all');
  const [selectedAgent, setSelectedAgent] = useState<MarketplaceAgent | null>(null);

  // Workflows state
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState('');
  const [activeWorkflowTag, setActiveWorkflowTag] = useState<WorkflowTag>('all');
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null);
  const [installingWorkflowId, setInstallingWorkflowId] = useState<string | null>(null);
  const [installedWorkflowIds, setInstalledWorkflowIds] = useState<string[]>([]);

  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const loadWorkflow = useCanvasStore((s) => s.loadWorkflow);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMarketplaceAgents(),
      getInstalledMarketplaceAgentIds(),
      loadMarketplaceWorkflows(),
      getInstalledWorkflowTemplateIds(),
    ]).then(([agentsList, installedList, workflowsList, workflowIds]) => {
      setAgents(agentsList);
      setInstalledIds(installedList);
      setWorkflows(workflowsList);
      setInstalledWorkflowIds(workflowIds);
      setInitialLoading(false);
    });
  }, []);

  useEffect(() => {
    const handler = () => getInstalledMarketplaceAgentIds().then(setInstalledIds);
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, []);

  useEffect(() => {
    const handler = () => getInstalledWorkflowTemplateIds().then(setInstalledWorkflowIds);
    window.addEventListener('dome:workflows-changed', handler);
    return () => window.removeEventListener('dome:workflows-changed', handler);
  }, []);

  // ---- Agents logic ----
  const filteredAgents = useMemo(() => {
    let result = agents;
    if (activeTag !== 'all') {
      result = result.filter((a) => a.tags.includes(activeTag));
    }
    if (agentSearchQuery.trim()) {
      const q = agentSearchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [agents, activeTag, agentSearchQuery]);

  const featuredAgents = useMemo(() => filteredAgents.filter((a) => a.featured), [filteredAgents]);
  const communityAgents = useMemo(() => filteredAgents.filter((a) => !a.featured), [filteredAgents]);

  const handleInstallAgent = async (agent: MarketplaceAgent) => {
    if (installingId) return;
    setInstallingId(agent.id);
    try {
      const result = await installMarketplaceAgent(agent.id);
      if (result.success) {
        setInstalledIds((prev) => [...prev, agent.id]);
        showToast('success', `"${agent.name}" instalado correctamente`);
        setSelectedAgent(null);
      } else {
        showToast('error', result.error ?? 'Error al instalar el agente');
      }
    } finally {
      setInstallingId(null);
    }
  };

  // ---- Workflows logic ----
  const filteredWorkflows = useMemo(() => {
    let result = workflows;
    if (activeWorkflowTag !== 'all') {
      result = result.filter((w) => w.tags.includes(activeWorkflowTag));
    }
    if (workflowSearchQuery.trim()) {
      const q = workflowSearchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q) ||
          w.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [workflows, activeWorkflowTag, workflowSearchQuery]);

  const handleInstallWorkflow = async (workflow: WorkflowTemplate) => {
    if (installingWorkflowId) return;

    const isInstalled = installedWorkflowIds.includes(workflow.id);
    if (isInstalled) {
      const workflowId = await getWorkflowIdForTemplate(workflow.id);
      if (workflowId) {
        const saved = await getWorkflow(workflowId);
        if (saved) {
          loadWorkflow(saved);
          setSection(`workflow:${workflowId}`);
          setSelectedWorkflow(null);
        }
      }
      return;
    }

    setInstallingWorkflowId(workflow.id);
    try {
      const result = await installWorkflowTemplate(workflow);
      if (result.success && result.data) {
        setInstalledWorkflowIds((prev) =>
          prev.includes(workflow.id) ? prev : [...prev, workflow.id]
        );
        const canvasWorkflow = {
          id: result.data.id,
          name: result.data.name,
          description: workflow.description,
          nodes: workflow.nodes,
          edges: workflow.edges,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        loadWorkflow(canvasWorkflow);
        setSelectedWorkflow(null);
        showToast('success', `Workflow "${workflow.name}" instalado correctamente`);
        setSection(`workflow:${result.data.id}`);
      } else {
        showToast('error', result.error ?? 'Error al instalar el workflow');
      }
    } finally {
      setInstallingWorkflowId(null);
    }
  };

  const WORKFLOW_TAG_LABELS: Record<string, string> = {
    all: 'Todos',
    research: 'Investigación',
    writing: 'Escritura',
    education: 'Educación',
    content: 'Contenido',
    data: 'Datos',
    productivity: 'Productividad',
    marketing: 'Marketing',
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <div
        className="shrink-0 px-6 py-5"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <Store className="w-5 h-5" style={{ color: 'var(--dome-accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--dome-text)' }}>
              Marketplace
            </h1>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              Agentes y workflows listos para usar
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-4"
          style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          <button
            onClick={() => setActiveTab('agents')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: activeTab === 'agents' ? 'var(--dome-accent)' : 'transparent',
              color: activeTab === 'agents' ? 'white' : 'var(--dome-text-secondary)',
            }}
          >
            <Bot className="w-3.5 h-3.5" />
            Agentes
            <span
              className="px-1.5 py-0.5 rounded-full text-xs"
              style={{
                background: activeTab === 'agents' ? 'rgba(255,255,255,0.2)' : 'var(--dome-bg)',
                color: activeTab === 'agents' ? 'white' : 'var(--dome-text-muted)',
              }}
            >
              {agents.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('workflows')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: activeTab === 'workflows' ? 'var(--dome-accent)' : 'transparent',
              color: activeTab === 'workflows' ? 'white' : 'var(--dome-text-secondary)',
            }}
          >
            <Workflow className="w-3.5 h-3.5" />
            Workflows
            <span
              className="px-1.5 py-0.5 rounded-full text-xs"
              style={{
                background: activeTab === 'workflows' ? 'rgba(255,255,255,0.2)' : 'var(--dome-bg)',
                color: activeTab === 'workflows' ? 'white' : 'var(--dome-text-muted)',
              }}
            >
              {workflows.length}
            </span>
          </button>
        </div>

        {/* Search + Tag filters — per tab */}
        {activeTab === 'agents' ? (
          <>
            <div className="relative mb-3">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--dome-text-muted)' }}
              />
              <input
                type="text"
                placeholder="Buscar agentes..."
                value={agentSearchQuery}
                onChange={(e) => setAgentSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'var(--dome-surface)',
                  color: 'var(--dome-text)',
                  border: '1px solid var(--dome-border)',
                }}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {MARKETPLACE_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: activeTag === tag ? 'var(--dome-accent)' : 'var(--dome-surface)',
                    color: activeTag === tag ? 'white' : 'var(--dome-text-muted)',
                    border: `1px solid ${activeTag === tag ? 'transparent' : 'var(--dome-border)'}`,
                  }}
                >
                  {TAG_LABELS[tag] ?? tag}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="relative mb-3">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--dome-text-muted)' }}
              />
              <input
                type="text"
                placeholder="Buscar workflows..."
                value={workflowSearchQuery}
                onChange={(e) => setWorkflowSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'var(--dome-surface)',
                  color: 'var(--dome-text)',
                  border: '1px solid var(--dome-border)',
                }}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {WORKFLOW_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveWorkflowTag(tag)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: activeWorkflowTag === tag ? 'var(--dome-accent)' : 'var(--dome-surface)',
                    color: activeWorkflowTag === tag ? 'white' : 'var(--dome-text-muted)',
                    border: `1px solid ${activeWorkflowTag === tag ? 'transparent' : 'var(--dome-border)'}`,
                  }}
                >
                  {WORKFLOW_TAG_LABELS[tag] ?? tag}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        {initialLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 animate-in fade-in duration-150 motion-reduce:animate-none">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="resource-card-skeleton rounded-xl min-h-[280px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : activeTab === 'agents' ? (
          <>
            {filteredAgents.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-20 gap-3"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                <Bot className="w-10 h-10 opacity-30" />
                <p className="text-sm">No se encontraron agentes</p>
              </div>
            ) : (
              <div className="animate-in fade-in duration-150 motion-reduce:animate-none">
                {featuredAgents.length > 0 && (
                  <section className="mb-8">
                    <h2
                      className="text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-1.5"
                      style={{ color: 'var(--dome-text-muted)' }}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Destacados por Dome Team
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {featuredAgents.map((agent) => (
                        <MarketplaceAgentCard
                          key={agent.id}
                          agent={agent}
                          isInstalled={installedIds.includes(agent.id)}
                          isInstalling={installingId === agent.id}
                          onInstall={handleInstallAgent}
                          onViewDetail={setSelectedAgent}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {communityAgents.length > 0 && (
                  <section>
                    <h2
                      className="text-xs font-semibold uppercase tracking-wider mb-4"
                      style={{ color: 'var(--dome-text-muted)' }}
                    >
                      Comunidad
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {communityAgents.map((agent) => (
                        <MarketplaceAgentCard
                          key={agent.id}
                          agent={agent}
                          isInstalled={installedIds.includes(agent.id)}
                          isInstalling={installingId === agent.id}
                          onInstall={handleInstallAgent}
                          onViewDetail={setSelectedAgent}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {filteredWorkflows.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-20 gap-3"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                <Workflow className="w-10 h-10 opacity-30" />
                <p className="text-sm">No se encontraron workflows</p>
              </div>
            ) : (
              <section className="animate-in fade-in duration-150 motion-reduce:animate-none">
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-1.5"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Workflows de Dome Team
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {filteredWorkflows.map((workflow) => (
                    <WorkflowCard
                      key={workflow.id}
                      workflow={workflow}
                      isInstalled={installedWorkflowIds.includes(workflow.id)}
                      isInstalling={installingWorkflowId === workflow.id}
                      onInstall={handleInstallWorkflow}
                      onViewDetail={setSelectedWorkflow}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Agent detail modal */}
      {selectedAgent && (
        <MarketplaceAgentDetail
          agent={selectedAgent}
          isInstalled={installedIds.includes(selectedAgent.id)}
          isInstalling={installingId === selectedAgent.id}
          onInstall={handleInstallAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* Workflow detail modal */}
      {selectedWorkflow && (
        <WorkflowDetail
          workflow={selectedWorkflow}
          isInstalled={installedWorkflowIds.includes(selectedWorkflow.id)}
          isInstalling={installingWorkflowId === selectedWorkflow.id}
          onInstall={handleInstallWorkflow}
          onClose={() => setSelectedWorkflow(null)}
        />
      )}
    </div>
  );
}
