'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import DomeButton from '@/components/ui/DomeButton';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeListState from '@/components/ui/DomeListState';
import DomeBadge from '@/components/ui/DomeBadge';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import HubSearchField from '@/components/ui/HubSearchField';
import HubBentoCard from '@/components/ui/HubBentoCard';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getWorkflow } from '@/lib/agent-canvas/api';
import { useTranslation } from 'react-i18next';
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketplaceView() {
  const { t } = useTranslation();

  const typeMeta = useMemo(() => {
    const row = (
      type: FilterType,
      Icon: React.ElementType,
      bgColor: string,
      textColor: string,
    ) => ({
      label:
        type === 'all' ? t('marketplace.type_all')
        : type === 'agents' ? t('marketplace.type_agents')
        : type === 'workflows' ? t('marketplace.type_workflows')
        : type === 'mcp' ? t('marketplace.type_mcp')
        : type === 'skills' ? t('marketplace.type_skills')
        : t('marketplace.type_plugins'),
      Icon,
      badge:
        type === 'all' ? t('marketplace.badge_all')
        : type === 'agents' ? t('marketplace.badge_agent')
        : type === 'workflows' ? t('marketplace.badge_workflow')
        : type === 'mcp' ? t('marketplace.badge_mcp')
        : type === 'skills' ? t('marketplace.badge_skill')
        : t('marketplace.badge_plugin'),
      bgColor,
      textColor,
    });
    return {
      all: row('all', Store, 'var(--dome-surface)', 'var(--dome-text-muted)'),
      agents: row('agents', Bot, 'var(--dome-accent-bg)', 'var(--dome-accent)'),
      workflows: row('workflows', Workflow, 'var(--success)', 'var(--dome-surface)'),
      mcp: row('mcp', FolderCog, 'var(--warning)', 'var(--dome-surface)'),
      skills: row('skills', Sparkles, 'var(--dome-accent)', 'var(--dome-surface)'),
      plugins: row('plugins', Plug, 'var(--info)', 'var(--dome-surface)'),
    } satisfies Record<FilterType, { label: string; Icon: React.ElementType; badge: string; bgColor: string; textColor: string }>;
  }, [t]);

  const categoryLabel = useCallback(
    (cat: string) => {
      const key = `marketplace.cat_${cat}` as const;
      const tr = t(key);
      return tr !== key ? tr : cat;
    },
    [t],
  );
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
      db.getAISkills(),
      getInstalledMarketplaceAgentIds(),
      getInstalledMarketplaceAgentRecords(),
      getInstalledWorkflowTemplateIds(),
      getInstalledWorkflowRecords(),
    ]);
    setInstalledMcpNames(new Set(servers.map((s) => s.name.toLowerCase())));
    if (skillsResult.success && Array.isArray(skillsResult.data)) {
      setInstalledSkillIds(new Set(skillsResult.data.map((s) => s.id).filter(Boolean) as string[]));
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
    showToast('info', t('tabs.marketplace'));
    await refresh();
    showToast('success', t('common.success'));
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
            ? `"${agent.name}" ${t('common.success')}`
            : `"${agent.name}" ${t('common.success')}`
        );
        setSelectedAgent(null);
      } else {
        showToast('error', result.error ?? t('common.error'));
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
        showToast('success', hasUpdate ? t('toast.workflow_updated', { name: workflow.name }) : t('toast.workflow_installed', { name: workflow.name }));
        setSection(`workflow:${result.data.id}`);
      } else {
        showToast('error', result.error ?? t('toast.workflow_install_error'));
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
        showToast('info', t('toast.mcp_already_configured', { name: manifest.name }));
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
        showToast('success', t('toast.mcp_added', { name: manifest.name }));
      } else {
        showToast('error', result.error ?? t('toast.mcp_install_error'));
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
        showToast('info', t('toast.skill_already_active', { name: skill.name }));
        return;
      }
      // Load current ai_skills list (SkillConfig format)
      const currentResult = await db.getAISkills();
      const currentList: Array<{ id: string; name: string; description: string; prompt: string; enabled: boolean }> =
        currentResult.success && Array.isArray(currentResult.data)
          ? currentResult.data.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description ?? '',
              prompt: s.prompt ?? '',
              enabled: s.enabled !== false,
            }))
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
      const result = await db.replaceAISkills(updated);
      if (result.success) {
        setInstalledSkillIds((prev) => new Set([...prev, skill.id]));
        showToast('success', t('toast.skill_added', { name: skill.name }));
      } else {
        showToast('error', t('toast.skill_activate_error'));
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

  const typeFilterOptions = useMemo(
    () =>
      (['all', 'agents', 'workflows', 'mcp', 'skills', 'plugins'] as FilterType[]).map((type) => ({
        value: type,
        label: `${typeMeta[type].label} (${type === 'all' ? allItems.length : totalByType[type] ?? 0})`,
        selectedColor: 'var(--dome-accent)',
      })),
    [typeMeta, allItems.length, totalByType],
  );

  const categoryFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('marketplace.category_all'), selectedColor: 'var(--dome-accent)' },
      ...availableCategories.map((cat) => ({
        value: cat,
        label: categoryLabel(cat),
        selectedColor: 'var(--dome-accent)',
      })),
    ],
    [availableCategories, categoryLabel, t],
  );

  // ── Card action ───────────────────────────────────────
  function renderAction(item: UnifiedItem) {
    if (item.type === 'agents') {
      const agent = item.raw as MarketplaceAgent;
      const isInstalled = installedIds.includes(agent.id);
      const agentInstall = installedAgentRecords[agent.id];
      const hasUpdate = agentInstall?.version != null && agentInstall.version !== agent.version;
      const isInstalling = installingId === agent.id;
      if (isInstalled && !hasUpdate) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('marketplace.installed')}
          </span>
        );
      }
      return (
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            void handleInstallAgent(agent);
          }}
          disabled={!!installingId}
          loading={isInstalling}
          className="!bg-[var(--dome-accent)] hover:!brightness-110"
          leftIcon={!isInstalling ? <Download className="w-3 h-3" aria-hidden /> : undefined}
        >
          {isInstalling ? t('marketplace.installing') : hasUpdate ? t('marketplace.update') : t('marketplace.install')}
        </DomeButton>
      );
    }

    if (item.type === 'workflows') {
      const workflow = item.raw as WorkflowTemplate;
      const isInstalled = installedWorkflowIds.includes(workflow.id);
      const workflowInstall = installedWorkflowRecords[workflow.id];
      const hasUpdate = workflowInstall?.version != null && workflowInstall.version !== workflow.version;
      const isInstalling = installingWorkflowId === workflow.id;
      return (
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            void handleInstallWorkflow(workflow);
          }}
          disabled={!!installingWorkflowId}
          loading={isInstalling}
          className="!bg-[var(--dome-accent)] hover:!brightness-110"
          leftIcon={!isInstalling ? <Download className="w-3 h-3" aria-hidden /> : undefined}
        >
          {isInstalling
            ? t('marketplace.installing')
            : hasUpdate
              ? t('marketplace.update')
              : isInstalled
                ? t('marketplace.open')
                : t('marketplace.install')}
        </DomeButton>
      );
    }

    if (item.type === 'plugins') {
      const plugin = item.raw as AvailablePlugin;
      const isInstalled = installedPluginIds.has(plugin.id);
      if (isInstalled) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('marketplace.installed')}
          </span>
        );
      }
      return (
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            void handleInstallPlugin();
          }}
          disabled={!!installingPlugin}
          loading={!!installingPlugin}
          className="!bg-[var(--dome-accent)] hover:!brightness-110"
          leftIcon={!installingPlugin ? <Download className="w-3 h-3" aria-hidden /> : undefined}
        >
          {installingPlugin ? t('marketplace.installing_plugin') : t('marketplace.install_plugin')}
        </DomeButton>
      );
    }

    if (item.type === 'mcp') {
      const server = item.raw as MCPManifest;
      const isInstalled = installedMcpNames.has(server.name.toLowerCase());
      const isInstalling = installingMcpId === server.id;
      if (isInstalled) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('marketplace.added')}
          </span>
        );
      }
      return (
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            void handleInstallMcp(server);
          }}
          disabled={!!installingMcpId}
          loading={isInstalling}
          className="!bg-[var(--dome-accent)] hover:!brightness-110"
          leftIcon={!isInstalling ? <Download className="w-3 h-3" aria-hidden /> : undefined}
        >
          {isInstalling ? t('marketplace.adding') : t('marketplace.add')}
        </DomeButton>
      );
    }

    if (item.type === 'skills') {
      const skill = item.raw as SkillManifest;
      const isInstalled = installedSkillIds.has(skill.id);
      const isInstalling = installingSkillId === skill.id;
      if (isInstalled) {
        return (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('marketplace.active')}
          </span>
        );
      }
      return (
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            void handleInstallSkill(skill);
          }}
          disabled={!!installingSkillId}
          loading={isInstalling}
          className="!bg-[var(--dome-accent)] hover:!brightness-110"
          leftIcon={!isInstalling ? <Download className="w-3 h-3" aria-hidden /> : undefined}
        >
          {isInstalling ? t('marketplace.activating') : t('marketplace.activate')}
        </DomeButton>
      );
    }

    return null;
  }

  const selectedAgentHasUpdate = (() => {
    if (!selectedAgent) return false;
    const rec = installedAgentRecords[selectedAgent.id];
    return rec?.version != null && rec.version !== selectedAgent.version;
  })();

  const selectedWorkflowHasUpdate = (() => {
    if (!selectedWorkflow) return false;
    const rec = installedWorkflowRecords[selectedWorkflow.id];
    return rec?.version != null && rec.version !== selectedWorkflow.version;
  })();

  // ── Render ────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--dome-bg)' }}>
      <HubToolbar
        dense
        leading={
          <HubTitleBlock
            icon={Store}
            title={t('marketplace.title')}
            subtitle={
              initialLoading
                ? t('marketplace.loading')
                : t('marketplace.subtitle_count', { count: allItems.length })
            }
          />
        }
        center={
          <HubSearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('marketplace.search_placeholder')}
            ariaLabel={t('marketplace.search_placeholder')}
            className="max-w-xl"
          />
        }
        trailing={
          <DomeButton
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="border-[var(--dome-border)] bg-[var(--dome-surface)] text-[var(--dome-text-secondary)]"
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />}
          >
            {t('marketplace.refresh')}
          </DomeButton>
        }
      />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className="w-44 shrink-0 overflow-y-auto py-4 px-2 flex flex-col gap-5"
          style={{ borderRight: '1px solid var(--dome-border)', background: 'var(--dome-surface)' }}
        >
          <div>
            <DomeSectionLabel className="mb-2 px-2 !text-[10px] !tracking-wider">{t('marketplace.filter_type')}</DomeSectionLabel>
            <DomeFilterChipGroup
              options={typeFilterOptions}
              value={filterType}
              onChange={(v) => {
                setFilterType(v);
                setFilterCategory('all');
              }}
              layout="vertical"
              className="gap-0.5"
            />
          </div>

          {availableCategories.length > 0 && (
            <div>
              <DomeSectionLabel className="mb-2 px-2 !text-[10px] !tracking-wider">{t('marketplace.filter_category')}</DomeSectionLabel>
              <DomeFilterChipGroup
                options={categoryFilterOptions}
                value={filterCategory}
                onChange={setFilterCategory}
                layout="vertical"
                className="gap-0.5"
              />
            </div>
          )}
        </div>

        {/* Main grid */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          {initialLoading ? (
            <DomeSkeletonGrid count={8} cellHeightClass="h-28" />
          ) : filteredItems.length === 0 ? (
            <DomeListState
              variant="empty"
              fullHeight
              icon={<Search className="w-10 h-10 opacity-20" aria-hidden />}
              title={t('marketplace.no_results')}
              description={t('marketplace.no_results_hint')}
            />
          ) : (
            <div className="flex w-full max-w-full flex-col gap-3 animate-in fade-in duration-150 motion-reduce:animate-none">
              {filteredItems.map((item) => {
                const meta = typeMeta[item.type];
                const Icon = meta.Icon;
                const isClickable = item.type === 'agents' || item.type === 'workflows';

                return (
                  <HubBentoCard
                    key={`${item.type}-${item.id}`}
                    onClick={
                      isClickable
                        ? () => {
                            if (item.type === 'agents') setSelectedAgent(item.raw as MarketplaceAgent);
                            else if (item.type === 'workflows') setSelectedWorkflow(item.raw as WorkflowTemplate);
                          }
                        : undefined
                    }
                    icon={
                      <span className="inline-flex items-center gap-1">
                        <Icon className="w-3 h-3 shrink-0" style={{ color: meta.textColor }} aria-hidden />
                        <DomeBadge label={meta.badge} variant="soft" color={meta.textColor} size="xs" />
                      </span>
                    }
                    title={
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 break-words font-semibold text-sm" style={{ color: 'var(--dome-text)' }}>
                          {item.name}
                        </span>
                        {item.featured ? (
                          <Star className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-amber-500" aria-hidden />
                        ) : null}
                      </span>
                    }
                    subtitle={
                      <span className="break-words" style={{ color: 'var(--dome-text-secondary)' }}>
                        {item.description}
                      </span>
                    }
                    meta={
                      <span className="text-[11px] break-words" style={{ color: 'var(--dome-text-muted)' }}>
                        {item.author ?? t('marketplace.default_author')}
                        {item.version ? ` · v${item.version}` : ''}
                      </span>
                    }
                    trailing={renderAction(item)}
                  />
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
          hasUpdate={selectedAgentHasUpdate}
          isInstalling={installingId === selectedAgent.id}
          onInstall={handleInstallAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
      {selectedWorkflow && (
        <WorkflowDetail
          workflow={selectedWorkflow}
          isInstalled={installedWorkflowIds.includes(selectedWorkflow.id)}
          hasUpdate={selectedWorkflowHasUpdate}
          isInstalling={installingWorkflowId === selectedWorkflow.id}
          onInstall={handleInstallWorkflow}
          onClose={() => setSelectedWorkflow(null)}
        />
      )}
    </div>
  );
}
