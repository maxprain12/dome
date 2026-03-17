'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Store,
  Bot,
  Workflow,
  Sparkles,
  Plug,
  FolderCog,
  RefreshCw,
  Download,
  Star,
  CheckCircle2,
} from 'lucide-react';
import type { MarketplaceAgent } from '@/types';
import type { WorkflowTemplate } from '@/types/canvas';
import { useMarketplaceStore } from '@/lib/store/useMarketplaceStore';
import {
  getMarketplaceAgents,
  getInstalledMarketplaceAgentIds,
  getInstalledMarketplaceAgentRecords,
  installMarketplaceAgent,
  getInstalledWorkflowTemplateIds,
  getInstalledWorkflowRecords,
  installWorkflowTemplate,
  getWorkflowIdForTemplate,
} from '@/lib/marketplace/api';
import {
  loadMarketplaceWorkflows,
  loadMarketplaceMcp,
  loadMarketplaceSkills,
  type MCPManifest,
  type SkillManifest,
} from '@/lib/marketplace/loaders';
import { loadAvailablePlugins, type AvailablePlugin } from '@/lib/marketplace/loader';
import { loadMcpServersSetting, saveMcpServersSetting } from '@/lib/mcp/settings';
import { db } from '@/lib/db/client';
import type { MCPServerConfig } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getWorkflow } from '@/lib/agent-canvas/api';
import MarketplaceAgentDetail from './MarketplaceAgentDetail';
import WorkflowDetail from './WorkflowDetail';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'agents' | 'workflows' | 'mcp' | 'skills' | 'plugins';

interface UnifiedItem {
  id: string;
  name: string;
  description: string;
  author?: string;
  tags: string[];
  version?: string;
  featured?: boolean;
  type: Exclude<FilterType, 'all'>;
  raw: MarketplaceAgent | WorkflowTemplate | MCPManifest | SkillManifest | AvailablePlugin;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  FilterType,
  { label: string; Icon: React.ElementType; badge: string; bgColor: string; textColor: string }
> = {
  all:       { label: 'Todo',      Icon: Store,     badge: 'Todo',     bgColor: 'var(--dome-surface)',  textColor: 'var(--dome-text-muted)' },
  agents:    { label: 'Agentes',   Icon: Bot,       badge: 'Agente',   bgColor: '#ede9fe',              textColor: '#7c3aed' },
  workflows: { label: 'Workflows', Icon: Workflow,  badge: 'Workflow', bgColor: '#d1fae5',              textColor: '#059669' },
  mcp:       { label: 'MCP',       Icon: FolderCog, badge: 'MCP',      bgColor: '#fef3c7',              textColor: '#d97706' },
  skills:    { label: 'Skills',    Icon: Sparkles,  badge: 'Skill',    bgColor: '#fce7f3',              textColor: '#db2777' },
  plugins:   { label: 'Plugins',   Icon: Plug,      badge: 'Plugin',   bgColor: '#e0f2fe',              textColor: '#0284c7' },
};

const CATEGORY_LABELS: Record<string, string> = {
  research:     'Investigación',
  writing:      'Escritura',
  coding:       'Código',
  data:         'Datos',
  education:    'Educación',
  productivity: 'Productividad',
  content:      'Contenido',
  language:     'Idiomas',
  marketing:    'Marketing',
  knowledge:    'Conocimiento',
  academic:     'Académico',
  analytics:    'Análisis',
  learning:     'Aprendizaje',
  organization: 'Organización',
  thinking:     'Pensamiento',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketplaceView() {
  // ── Agents ────────────────────────────────────────────
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [installedAgentRecords, setInstalledAgentRecords] = useState<Record<string, { version: string }>>({});
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<MarketplaceAgent | null>(null);

  // ── Workflows ─────────────────────────────────────────
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [installingWorkflowId, setInstallingWorkflowId] = useState<string | null>(null);
  const [installedWorkflowIds, setInstalledWorkflowIds] = useState<string[]>([]);
  const [installedWorkflowRecords, setInstalledWorkflowRecords] = useState<Record<string, { version: string }>>({});
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null);

  // ── Plugins (installed via store) ─────────────────────
  const { plugins, loading, refresh } = useMarketplaceStore();

  // ── Catalog (from public/ JSON) ───────────────────────
  const [mcpServers, setMcpServers] = useState<MCPManifest[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<SkillManifest[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<AvailablePlugin[]>([]);
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null);
  const [installedMcpNames, setInstalledMcpNames] = useState<Set<string>>(new Set());
  const [installingMcpId, setInstallingMcpId] = useState<string | null>(null);
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(new Set());
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // ── Filters ───────────────────────────────────────────
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const loadWorkflow = useCanvasStore((s) => s.loadWorkflow);
  const installedPluginIds = useMemo(() => new Set(plugins.map((p) => p.id)), [plugins]);

  // ── Effects ───────────────────────────────────────────
  const syncInstalledState = async () => {
    const [servers, skillsResult, agentIds, agentRecords, workflowIds, workflowRecords] = await Promise.all([
      loadMcpServersSetting(),
      db.getSetting('ai_skills'),
      getInstalledMarketplaceAgentIds(),
      getInstalledMarketplaceAgentRecords(),
      getInstalledWorkflowTemplateIds(),
      getInstalledWorkflowRecords(),
    ]);
    setInstalledMcpNames(new Set(servers.map((s) => s.name.toLowerCase())));
    if (skillsResult.success && skillsResult.data) {
      try {
        const list = JSON.parse(skillsResult.data) as Array<{ id?: string }>;
        if (Array.isArray(list)) {
          setInstalledSkillIds(new Set(list.map((s) => s.id).filter(Boolean) as string[]));
        }
      } catch { /* ignore */ }
    }
    setInstalledIds(agentIds);
    setInstalledAgentRecords(agentRecords);
    setInstalledWorkflowIds(workflowIds);
    setInstalledWorkflowRecords(workflowRecords);
  };

  useEffect(() => {
    void syncInstalledState();
    // Re-sync when the window regains focus (catches deletions made in Settings)
    const handleFocus = () => { void syncInstalledState(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  useEffect(() => {
    Promise.all([
      getMarketplaceAgents(),
      getInstalledMarketplaceAgentIds(),
      getInstalledMarketplaceAgentRecords(),
      loadMarketplaceWorkflows(),
      getInstalledWorkflowTemplateIds(),
      getInstalledWorkflowRecords(),
      loadMarketplaceMcp(),
      loadMarketplaceSkills(),
      loadAvailablePlugins(),
    ]).then(([agentsList, installedList, agentRecords, workflowsList, workflowIds, workflowRecords, mcps, skills, pluginCatalog]) => {
      setAgents(agentsList);
      setInstalledIds(installedList);
      setInstalledAgentRecords(agentRecords);
      setWorkflows(workflowsList);
      setInstalledWorkflowIds(workflowIds);
      setInstalledWorkflowRecords(workflowRecords);
      setMcpServers(mcps);
      setCatalogSkills(skills);
      setAvailablePlugins(pluginCatalog);
      setInitialLoading(false);
    });
  }, []);

  useEffect(() => {
    const handler = () => {
      void getInstalledMarketplaceAgentIds().then(setInstalledIds);
      void getInstalledMarketplaceAgentRecords().then(setInstalledAgentRecords);
    };
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      void getInstalledWorkflowTemplateIds().then(setInstalledWorkflowIds);
      void getInstalledWorkflowRecords().then(setInstalledWorkflowRecords);
    };
    window.addEventListener('dome:workflows-changed', handler);
    return () => window.removeEventListener('dome:workflows-changed', handler);
  }, []);

  // ── Handlers ──────────────────────────────────────────
  const handleRefresh = async () => {
    showToast('info', 'Actualizando marketplace...');
    await refresh();
    showToast('success', 'Marketplace actualizado');
  };

  const handleInstallAgent = async (agent: MarketplaceAgent) => {
    if (installingId) return;
    setInstallingId(agent.id);
    try {
      const result = await installMarketplaceAgent(agent.id);
      if (result.success) {
        const previousVersion = installedAgentRecords[agent.id]?.version;
        setInstalledIds((prev) => (prev.includes(agent.id) ? prev : [...prev, agent.id]));
        setInstalledAgentRecords((prev) => ({ ...prev, [agent.id]: { version: agent.version } }));
        showToast(
          'success',
          previousVersion && previousVersion !== agent.version
            ? `"${agent.name}" actualizado`
            : `"${agent.name}" instalado correctamente`
        );
        setSelectedAgent(null);
      } else {
        showToast('error', result.error ?? 'Error al instalar el agente');
      }
    } finally {
      setInstallingId(null);
    }
  };

  const handleInstallWorkflow = async (workflow: WorkflowTemplate) => {
    if (installingWorkflowId) return;
    const isInstalled = installedWorkflowIds.includes(workflow.id);
    const installedVersion = installedWorkflowRecords[workflow.id]?.version;
    const hasUpdate = !!installedVersion && installedVersion !== workflow.version;

    if (isInstalled && !hasUpdate) {
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
        setInstalledWorkflowIds((prev) => prev.includes(workflow.id) ? prev : [...prev, workflow.id]);
        setInstalledWorkflowRecords((prev) => ({ ...prev, [workflow.id]: { version: workflow.version } }));
        const canvasWorkflow = {
          id: result.data.id,
          name: result.data.name,
          description: workflow.description,
          nodes: workflow.nodes,
          edges: workflow.edges,
          marketplace: {
            templateId: workflow.id,
            version: workflow.version,
            source: workflow.source ?? 'official',
            author: workflow.author,
            capabilities: workflow.capabilities ?? [],
            resourceAffinity: workflow.resourceAffinity ?? [],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        loadWorkflow(canvasWorkflow);
        setSelectedWorkflow(null);
        showToast('success', hasUpdate ? `Workflow "${workflow.name}" actualizado` : `Workflow "${workflow.name}" instalado correctamente`);
        setSection(`workflow:${result.data.id}`);
      } else {
        showToast('error', result.error ?? 'Error al instalar el workflow');
      }
    } finally {
      setInstallingWorkflowId(null);
    }
  };

  const handleInstallMcp = async (manifest: MCPManifest) => {
    if (installingMcpId) return;
    setInstallingMcpId(manifest.id);
    try {
      const current = await loadMcpServersSetting();
      const alreadyExists = current.some((s) => s.name.toLowerCase() === manifest.name.toLowerCase());
      if (alreadyExists) {
        showToast('info', `"${manifest.name}" ya está configurado`);
        return;
      }
      const newServer: MCPServerConfig = {
        name: manifest.name,
        type: 'stdio',
        command: manifest.command,
        args: manifest.args,
        env: manifest.env,
        enabled: true,
      };
      const updated = [...current, newServer];
      const result = await saveMcpServersSetting(updated);
      if (result.success) {
        setInstalledMcpNames((prev) => new Set([...prev, manifest.name.toLowerCase()]));
        showToast('success', `"${manifest.name}" añadido a tu configuración MCP`);
      } else {
        showToast('error', result.error ?? 'Error al instalar el servidor MCP');
      }
    } finally {
      setInstallingMcpId(null);
    }
  };

  const handleInstallSkill = async (skill: SkillManifest) => {
    if (installingSkillId) return;
    setInstallingSkillId(skill.id);
    try {
      if (installedSkillIds.has(skill.id)) {
        showToast('info', `"${skill.name}" ya está activo`);
        return;
      }
      // Load current ai_skills list (SkillConfig format)
      const currentResult = await db.getSetting('ai_skills');
      const currentList: Array<{ id: string; name: string; description: string; prompt: string; enabled: boolean }> =
        currentResult.success && currentResult.data
          ? (() => { try { return JSON.parse(currentResult.data); } catch { return []; } })()
          : [];

      // Add the new skill using the marketplace manifest fields
      const newSkill = {
        id: skill.id,
        name: skill.name,
        description: skill.description ?? '',
        prompt: skill.instructions ?? '',
        enabled: true,
      };
      const updated = [...currentList, newSkill];
      const result = await db.setSetting('ai_skills', JSON.stringify(updated));
      if (result.success) {
        setInstalledSkillIds((prev) => new Set([...prev, skill.id]));
        showToast('success', `"${skill.name}" añadido a tus skills`);
      } else {
        showToast('error', 'Error al activar el skill');
      }
    } finally {
      setInstallingSkillId(null);
    }
  };

  const handleInstallPlugin = async () => {
    if (installingPlugin) return;
    setInstallingPlugin('installing');
    try {
      const result = await window.electron.marketplace.installPlugin();
      if (result.success) await refresh();
    } finally {
      setInstallingPlugin(null);
    }
  };

  // ── Unified items ─────────────────────────────────────
  const allItems = useMemo((): UnifiedItem[] => [
    ...agents.map((a) => ({
      id: a.id, name: a.name, description: a.description, author: a.author,
      tags: a.tags, version: a.version, featured: a.featured,
      type: 'agents' as const, raw: a,
    })),
    ...workflows.map((w) => ({
      id: w.id, name: w.name, description: w.description, author: w.author,
      tags: w.tags, version: w.version, featured: w.featured,
      type: 'workflows' as const, raw: w,
    })),
    ...mcpServers.map((m) => ({
      id: m.id, name: m.name, description: m.description, author: m.author,
      tags: m.tags ?? [], type: 'mcp' as const, raw: m,
    })),
    ...catalogSkills.map((s) => ({
      id: s.id, name: s.name, description: s.description, author: s.author,
      tags: s.tags ?? [], type: 'skills' as const, raw: s,
    })),
    ...availablePlugins.map((p) => ({
      id: p.id, name: p.name, description: p.description, author: p.author,
      tags: [], type: 'plugins' as const, raw: p,
    })),
  ], [agents, workflows, mcpServers, catalogSkills, availablePlugins]);

  const filteredItems = useMemo(() => {
    let result = allItems;
    if (filterType !== 'all') result = result.filter((i) => i.type === filterType);
    if (filterCategory !== 'all') result = result.filter((i) => i.tags.includes(filterCategory));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.author?.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
    });
  }, [allItems, filterType, filterCategory, searchQuery]);

  const availableCategories = useMemo(() => {
    const source = filterType === 'all' ? allItems : allItems.filter((i) => i.type === filterType);
    const cats = new Set<string>();
    source.forEach((i) => i.tags.forEach((t) => cats.add(t)));
    return Array.from(cats).sort();
  }, [allItems, filterType]);

  const totalByType = useMemo(() => {
    const counts: Record<string, number> = {};
    allItems.forEach((i) => { counts[i.type] = (counts[i.type] ?? 0) + 1; });
    return counts;
  }, [allItems]);

  // ── Card action ───────────────────────────────────────
  function renderAction(item: UnifiedItem) {
    if (item.type === 'agents') {
      const agent = item.raw as MarketplaceAgent;
      const isInstalled = installedIds.includes(agent.id);
      const hasUpdate = !!installedAgentRecords[agent.id]?.version && installedAgentRecords[agent.id].version !== agent.version;
      const isInstalling = installingId === agent.id;
      if (isInstalled && !hasUpdate) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Instalado
          </span>
        );
      }
      return (
        <button
          onClick={(e) => { e.stopPropagation(); void handleInstallAgent(agent); }}
          disabled={!!installingId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          <Download className="w-3 h-3" />
          {isInstalling ? 'Instalando…' : hasUpdate ? 'Actualizar' : 'Instalar'}
        </button>
      );
    }

    if (item.type === 'workflows') {
      const workflow = item.raw as WorkflowTemplate;
      const isInstalled = installedWorkflowIds.includes(workflow.id);
      const hasUpdate = !!installedWorkflowRecords[workflow.id]?.version && installedWorkflowRecords[workflow.id].version !== workflow.version;
      const isInstalling = installingWorkflowId === workflow.id;
      return (
        <button
          onClick={(e) => { e.stopPropagation(); void handleInstallWorkflow(workflow); }}
          disabled={!!installingWorkflowId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          <Download className="w-3 h-3" />
          {isInstalling ? 'Instalando…' : hasUpdate ? 'Actualizar' : isInstalled ? 'Abrir' : 'Instalar'}
        </button>
      );
    }

    if (item.type === 'plugins') {
      const plugin = item.raw as AvailablePlugin;
      const isInstalled = installedPluginIds.has(plugin.id);
      if (isInstalled) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Instalado
          </span>
        );
      }
      return (
        <button
          onClick={(e) => { e.stopPropagation(); void handleInstallPlugin(); }}
          disabled={!!installingPlugin}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          <Download className="w-3 h-3" />
          {installingPlugin ? 'Instalando…' : 'Instalar'}
        </button>
      );
    }

    if (item.type === 'mcp') {
      const server = item.raw as MCPManifest;
      const isInstalled = installedMcpNames.has(server.name.toLowerCase());
      const isInstalling = installingMcpId === server.id;
      if (isInstalled) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Añadido
          </span>
        );
      }
      return (
        <button
          onClick={(e) => { e.stopPropagation(); void handleInstallMcp(server); }}
          disabled={!!installingMcpId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          <Download className="w-3 h-3" />
          {isInstalling ? 'Añadiendo…' : 'Añadir'}
        </button>
      );
    }

    if (item.type === 'skills') {
      const skill = item.raw as SkillManifest;
      const isInstalled = installedSkillIds.has(skill.id);
      const isInstalling = installingSkillId === skill.id;
      if (isInstalled) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Activo
          </span>
        );
      }
      return (
        <button
          onClick={(e) => { e.stopPropagation(); void handleInstallSkill(skill); }}
          disabled={!!installingSkillId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          <Download className="w-3 h-3" />
          {isInstalling ? 'Activando…' : 'Activar'}
        </button>
      );
    }

    return null;
  }

  // ── Render ────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* ── Header ── */}
      <div className="shrink-0 px-5 py-4" style={{ borderBottom: '1px solid var(--dome-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--dome-accent-bg)' }}
            >
              <Store className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight" style={{ color: 'var(--dome-text)' }}>
                Marketplace
              </h1>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
                {initialLoading ? 'Cargando…' : `${allItems.length} recursos disponibles`}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{
              background: 'var(--dome-surface)',
              border: '1px solid var(--dome-border)',
              color: 'var(--dome-text-secondary)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--dome-text-muted)' }}
          />
          <input
            type="text"
            placeholder="Buscar agentes, workflows, skills, MCP…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
            style={{
              background: 'var(--dome-surface)',
              border: '1px solid var(--dome-border)',
              color: 'var(--dome-text)',
            }}
          />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className="w-44 shrink-0 overflow-y-auto py-4 px-2 flex flex-col gap-5"
          style={{ borderRight: '1px solid var(--dome-border)', background: 'var(--dome-surface)' }}
        >
          {/* Type filters */}
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-2"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              Tipo
            </p>
            <div className="space-y-0.5">
              {(['all', 'agents', 'workflows', 'mcp', 'skills', 'plugins'] as FilterType[]).map((type) => {
                const { label, Icon } = TYPE_META[type];
                const count = type === 'all' ? allItems.length : (totalByType[type] ?? 0);
                const isActive = filterType === type;
                return (
                  <button
                    key={type}
                    onClick={() => { setFilterType(type); setFilterCategory('all'); }}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: isActive ? 'var(--dome-accent)' : 'transparent',
                      color: isActive ? 'white' : 'var(--dome-text-secondary)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {label}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--dome-bg)',
                        color: isActive ? 'white' : 'var(--dome-text-muted)',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category filters */}
          {availableCategories.length > 0 && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-2"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                Categoría
              </p>
              <div className="space-y-0.5">
                <button
                  onClick={() => setFilterCategory('all')}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: filterCategory === 'all' ? 'var(--dome-bg)' : 'transparent',
                    color: filterCategory === 'all' ? 'var(--dome-text)' : 'var(--dome-text-secondary)',
                    fontWeight: filterCategory === 'all' ? '600' : '500',
                  }}
                >
                  Todas
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: filterCategory === cat ? 'var(--dome-bg)' : 'transparent',
                      color: filterCategory === cat ? 'var(--dome-text)' : 'var(--dome-text-secondary)',
                      fontWeight: filterCategory === cat ? '600' : '500',
                    }}
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main grid */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          {initialLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="resource-card-skeleton rounded-xl h-36" aria-hidden="true" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full gap-3"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <Search className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">Sin resultados</p>
              <p className="text-xs">Prueba con otros filtros o términos de búsqueda</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-150 motion-reduce:animate-none">
              {filteredItems.map((item) => {
                const meta = TYPE_META[item.type];
                const Icon = meta.Icon;
                const isClickable = item.type === 'agents' || item.type === 'workflows';

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => {
                      if (item.type === 'agents') setSelectedAgent(item.raw as MarketplaceAgent);
                      else if (item.type === 'workflows') setSelectedWorkflow(item.raw as WorkflowTemplate);
                    }}
                    className="flex flex-col p-4 rounded-xl border transition-colors"
                    style={{
                      background: 'var(--dome-surface)',
                      borderColor: 'var(--dome-border)',
                      cursor: isClickable ? 'pointer' : 'default',
                    }}
                  >
                    {/* Top row: type badge + featured star */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: meta.bgColor, color: meta.textColor }}
                      >
                        <Icon className="w-3 h-3" />
                        {meta.badge}
                      </span>
                      {item.featured && (
                        <Star
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: '#d97706', fill: '#d97706' }}
                        />
                      )}
                    </div>

                    {/* Name */}
                    <h3
                      className="font-semibold text-sm mb-1 line-clamp-1"
                      style={{ color: 'var(--dome-text)' }}
                    >
                      {item.name}
                    </h3>

                    {/* Description */}
                    <p
                      className="text-xs leading-relaxed line-clamp-2 flex-1 mb-3"
                      style={{ color: 'var(--dome-text-secondary)' }}
                    >
                      {item.description}
                    </p>

                    {/* Bottom row: author + action */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[11px] truncate"
                        style={{ color: 'var(--dome-text-muted)' }}
                      >
                        {item.author ?? 'Dome Team'}
                      </span>
                      <div className="shrink-0">{renderAction(item)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {selectedAgent && (
        <MarketplaceAgentDetail
          agent={selectedAgent}
          isInstalled={installedIds.includes(selectedAgent.id)}
          hasUpdate={
            installedAgentRecords[selectedAgent.id]?.version != null &&
            installedAgentRecords[selectedAgent.id].version !== selectedAgent.version
          }
          isInstalling={installingId === selectedAgent.id}
          onInstall={handleInstallAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
      {selectedWorkflow && (
        <WorkflowDetail
          workflow={selectedWorkflow}
          isInstalled={installedWorkflowIds.includes(selectedWorkflow.id)}
          hasUpdate={
            installedWorkflowRecords[selectedWorkflow.id]?.version != null &&
            installedWorkflowRecords[selectedWorkflow.id].version !== selectedWorkflow.version
          }
          isInstalling={installingWorkflowId === selectedWorkflow.id}
          onInstall={handleInstallWorkflow}
          onClose={() => setSelectedWorkflow(null)}
        />
      )}
    </div>
  );
}
