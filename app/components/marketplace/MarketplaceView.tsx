'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { BotIcon, GitBranchIcon, Plug02Icon, PuzzleIcon, RefreshIcon, SparklesIcon, Store01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
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
import { openSkillsFolder, installBundledSkill, listSkills } from '@/lib/skills/client';
import type { MCPServerConfig } from '@/types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getWorkflow } from '@/lib/agent-canvas/api';
import { useTranslation } from 'react-i18next';
import MarketplaceAgentDetail from './MarketplaceAgentDetail';
import WorkflowDetail from './WorkflowDetail';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { HubHeader, HubPageHeader } from '@/components/hub';
import { HubSearch } from '@/components/hub/HubSearch';
import { HubSectionLabel } from '@/components/hub/HubSectionLabel';
import { InstallCard } from '@/components/hub/InstallCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'agents' | 'workflows' | 'mcp' | 'skills' | 'plugins';
type MainTab = 'complements' | 'skills';
type ScopeFilter = 'public' | 'personal';

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

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  all: { icon: Store01Icon, label: 'All' },
  agents: { icon: BotIcon, label: 'Agent' },
  workflows: { icon: GitBranchIcon, label: 'Workflow' },
  mcp: { icon: PuzzleIcon, label: 'MCP' },
  skills: { icon: SparklesIcon, label: 'Skill' },
  plugins: { icon: Plug02Icon, label: 'Plugin' },
} satisfies Record<FilterType, { icon: IconSvgElement; label: string }>;

const COMPLEMENT_TYPES: Exclude<FilterType, 'all' | 'skills'>[] = ['agents', 'workflows', 'mcp', 'plugins'];

export default function MarketplaceView() {
  const { t } = useTranslation();

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

  // ── Plugins ───────────────────────────────────────────
  const { plugins, loading, refresh } = useMarketplaceStore();

  // ── Catalog ───────────────────────────────────────────
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
  const [mainTab, setMainTab] = useState<MainTab>('complements');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('public');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const loadWorkflow = useCanvasStore((s) => s.loadWorkflow);
  const installedPluginIds = useMemo(() => new Set(plugins.map((p) => p.id)), [plugins]);

  const isItemInstalled = useCallback(
    (item: UnifiedItem): boolean => {
      switch (item.type) {
        case 'agents':
          return installedIds.includes(item.id);
        case 'workflows':
          return installedWorkflowIds.includes(item.id);
        case 'mcp':
          return installedMcpNames.has(item.name.toLowerCase());
        case 'skills':
          return installedSkillIds.has(item.id);
        case 'plugins':
          return installedPluginIds.has(item.id);
        default: {
          const _exhaustive: never = item.type;
          return _exhaustive;
        }
      }
    },
    [installedIds, installedWorkflowIds, installedMcpNames, installedSkillIds, installedPluginIds],
  );

  // ── Sync installed state ──────────────────────────────
  const syncInstalledState = async () => {
    const [servers, skillsResult, agentIds, agentRecords, workflowIds, workflowRecords] = await Promise.all([
      loadMcpServersSetting(),
      listSkills(),
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
    await refresh();
    void syncInstalledState();
    showToast('success', t('common.success'));
  };

  const handleInstallAgent = async (agent: MarketplaceAgent) => {
    if (installingId) return;
    setInstallingId(agent.id);
    try {
      const result = await installMarketplaceAgent(agent.id);
      if (result.success) {
        setInstalledIds((prev) => (prev.includes(agent.id) ? prev : [...prev, agent.id]));
        setInstalledAgentRecords((prev) => ({ ...prev, [agent.id]: { version: agent.version } }));
        showToast('success', `"${agent.name}" ${t('common.success')}`);
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
      const result = await installBundledSkill(skill.id);
      if (result.success) {
        setInstalledSkillIds((prev) => new Set([...prev, skill.id]));
        showToast('success', t('marketplace.skill_installed', { name: skill.name, defaultValue: `"${skill.name}" installed` }));
      } else {
        await openSkillsFolder();
        showToast('info', t('skills.openFolderToInstall', 'Place the SKILL.md file in the skills folder to install it.'));
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

    if (mainTab === 'skills') {
      result = result.filter((i) => i.type === 'skills');
    } else {
      result = result.filter((i) => COMPLEMENT_TYPES.includes(i.type as (typeof COMPLEMENT_TYPES)[number]));
      if (filterType !== 'all') result = result.filter((i) => i.type === filterType);
    }

    if (scopeFilter === 'personal') {
      result = result.filter((i) => isItemInstalled(i));
    }

    if (filterCategory !== 'all') result = result.filter((i) => i.tags.includes(filterCategory));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.author?.toLowerCase().includes(q) ||
        i.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
    });
  }, [allItems, mainTab, filterType, filterCategory, searchQuery, scopeFilter, isItemInstalled]);

  const featuredItems = useMemo(
    () =>
      mainTab === 'complements' && scopeFilter === 'public' && filterType === 'all' && !searchQuery.trim() && filterCategory === 'all'
        ? filteredItems.filter((i) => i.featured && (i.type === 'agents' || i.type === 'workflows')).slice(0, 4)
        : [],
    [filteredItems, mainTab, scopeFilter, filterType, searchQuery, filterCategory],
  );

  const regularItems = useMemo(
    () =>
      featuredItems.length > 0
        ? filteredItems.filter((i) => !featuredItems.includes(i))
        : filteredItems,
    [filteredItems, featuredItems],
  );

  const installedStrip = useMemo(
    () => allItems.filter((i) => isItemInstalled(i)).slice(0, 12),
    [allItems, isItemInstalled],
  );

  const availableCategories = useMemo(() => {
    const source =
      mainTab === 'skills'
        ? allItems.filter((i) => i.type === 'skills')
        : filterType === 'all'
          ? allItems.filter((i) => COMPLEMENT_TYPES.includes(i.type as (typeof COMPLEMENT_TYPES)[number]))
          : allItems.filter((i) => i.type === filterType);
    const cats = new Set<string>();
    source.forEach((i) => i.tags.forEach((tag) => cats.add(tag)));
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [allItems, filterType, mainTab]);

  const totalByType = useMemo(() => {
    const counts: Record<string, number> = {};
    allItems.forEach((i) => { counts[i.type] = (counts[i.type] ?? 0) + 1; });
    return counts;
  }, [allItems]);

  const complementTypeOptions = useMemo(() => {
    const types: FilterType[] = ['all', 'agents', 'workflows', 'mcp', 'plugins'];
    const labels: Record<FilterType, string> = {
      all: t('marketplace.type_all'),
      agents: t('marketplace.type_agents'),
      workflows: t('marketplace.type_workflows'),
      mcp: t('marketplace.type_mcp'),
      skills: t('marketplace.type_skills'),
      plugins: t('marketplace.type_plugins'),
    };
    const complementCount = COMPLEMENT_TYPES.reduce((n, type) => n + (totalByType[type] ?? 0), 0);
    return types.map((type) => ({
      value: type,
      label: `${labels[type]} (${type === 'all' ? complementCount : totalByType[type] ?? 0})`,
    }));
  }, [t, totalByType]);

  // ── Card action meta for InstallCard ──────────────────
  function getActionMeta(item: UnifiedItem): { label: string; onAction?: () => void; disabled?: boolean } {
    if (item.type === 'agents') {
      const agent = item.raw as MarketplaceAgent;
      const isInstalled = installedIds.includes(agent.id);
      const agentInstall = installedAgentRecords[agent.id];
      const hasUpdate = agentInstall?.version != null && agentInstall.version !== agent.version;
      const isInstalling = installingId === agent.id;
      if (isInstalled && !hasUpdate) {
        return { label: t('marketplace.installed'), disabled: true };
      }
      return {
        label: isInstalling ? t('marketplace.installing') : hasUpdate ? t('marketplace.update') : t('marketplace.install'),
        onAction: () => void handleInstallAgent(agent),
        disabled: !!installingId,
      };
    }

    if (item.type === 'workflows') {
      const workflow = item.raw as WorkflowTemplate;
      const isInstalled = installedWorkflowIds.includes(workflow.id);
      const workflowInstall = installedWorkflowRecords[workflow.id];
      const hasUpdate = workflowInstall?.version != null && workflowInstall.version !== workflow.version;
      const isInstalling = installingWorkflowId === workflow.id;
      return {
        label: isInstalling
          ? t('marketplace.installing')
          : hasUpdate
            ? t('marketplace.update')
            : isInstalled
              ? t('marketplace.open')
              : t('marketplace.install'),
        onAction: () => void handleInstallWorkflow(workflow),
        disabled: !!installingWorkflowId,
      };
    }

    if (item.type === 'plugins') {
      const plugin = item.raw as AvailablePlugin;
      if (installedPluginIds.has(plugin.id)) {
        return { label: t('marketplace.installed'), disabled: true };
      }
      return {
        label: installingPlugin ? t('marketplace.installing_plugin') : t('marketplace.install_plugin'),
        onAction: () => void handleInstallPlugin(),
        disabled: !!installingPlugin,
      };
    }

    if (item.type === 'mcp') {
      const server = item.raw as MCPManifest;
      if (installedMcpNames.has(server.name.toLowerCase())) {
        return { label: t('marketplace.added'), disabled: true };
      }
      const isInstalling = installingMcpId === server.id;
      return {
        label: isInstalling ? t('marketplace.adding') : t('marketplace.add'),
        onAction: () => void handleInstallMcp(server),
        disabled: !!installingMcpId,
      };
    }

    if (item.type === 'skills') {
      const skill = item.raw as SkillManifest;
      if (installedSkillIds.has(skill.id)) {
        return { label: t('marketplace.active'), disabled: true };
      }
      const isInstalling = installingSkillId === skill.id;
      return {
        label: isInstalling ? t('marketplace.installing') : t('marketplace.activate'),
        onAction: () => void handleInstallSkill(skill),
        disabled: !!installingSkillId,
      };
    }

    return { label: t('marketplace.install'), disabled: true };
  }

  const openItemDetail = (item: UnifiedItem) => {
    if (item.type === 'agents') setSelectedAgent(item.raw as MarketplaceAgent);
    else if (item.type === 'workflows') setSelectedWorkflow(item.raw as WorkflowTemplate);
  };

  const showFeatured = featuredItems.length > 0;
  const catalogCount = mainTab === 'skills' ? (totalByType.skills ?? 0) : COMPLEMENT_TYPES.reduce((n, type) => n + (totalByType[type] ?? 0), 0);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <HubPageHeader className="gap-y-3 px-5 py-4 sm:px-5">
          <HubHeader
            title={t('marketplace.title')}
            description={
              initialLoading
                ? t('marketplace.loading')
                : t('marketplace.subtitle_count', { count: catalogCount })
            }
            actions={
              <Button type="button" variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={loading}>
                {loading ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />}
                {t('marketplace.refresh')}
              </Button>
            }
          />
          <Tabs
            value={mainTab}
            onValueChange={(v) => {
              setMainTab(v as MainTab);
              setFilterType('all');
              setFilterCategory('all');
            }}
          >
            <TabsList>
              <TabsTrigger value="complements">{t('marketplace.tab_complements')}</TabsTrigger>
              <TabsTrigger value="skills">{t('marketplace.tab_skills')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-3">
            <HubSearch
              className="min-w-[14rem] max-w-md flex-1"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('marketplace.search_placeholder')}
              aria-label={t('marketplace.search_placeholder')}
              clearLabel={t('common.cancel')}
            />
            <ToggleGroup
              value={[scopeFilter]}
              onValueChange={(values) => {
                const next = values[0] as ScopeFilter | undefined;
                if (next) setScopeFilter(next);
              }}
            >
              <ToggleGroupItem value="public">{t('marketplace.scope_public')}</ToggleGroupItem>
              <ToggleGroupItem value="personal">{t('marketplace.scope_personal')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </HubPageHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {installedStrip.length > 0 ? (
            <section className="mb-6 flex flex-col gap-2">
              <HubSectionLabel>{t('marketplace.installed_row')}</HubSectionLabel>
              <div className="flex flex-wrap gap-2">
                {installedStrip.map((item) => (
                  <button
                    key={`installed-${item.type}-${item.id}`}
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs',
                      (item.type === 'agents' || item.type === 'workflows') && 'hover:bg-accent',
                    )}
                    onClick={() => openItemDetail(item)}
                    disabled={item.type !== 'agents' && item.type !== 'workflows'}
                    title={item.name}
                  >
                    <HugeiconsIcon icon={TYPE_CONFIG[item.type].icon} className="size-3.5 text-muted-foreground" />
                    <span className="max-w-[10rem] truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {mainTab === 'complements' ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {complementTypeOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="xs"
                  variant={filterType === option.value ? 'default' : 'outline'}
                  className="rounded-full text-xs"
                  onClick={() => {
                    setFilterType(option.value);
                    setFilterCategory('all');
                  }}
                >
                  {option.label}
                </Button>
              ))}
              {availableCategories.length > 0 ? (
                <>
                  <span className="mx-1 self-center text-xs text-muted-foreground">·</span>
                  <Button
                    type="button"
                    size="xs"
                    variant={filterCategory === 'all' ? 'secondary' : 'outline'}
                    className="rounded-full text-xs"
                    onClick={() => setFilterCategory('all')}
                  >
                    {t('marketplace.category_all')}
                  </Button>
                  {availableCategories.map((cat) => (
                    <Button
                      key={cat}
                      type="button"
                      size="xs"
                      variant={filterCategory === cat ? 'secondary' : 'outline'}
                      className="rounded-full text-xs"
                      onClick={() => setFilterCategory(cat)}
                    >
                      {categoryLabel(cat)}
                    </Button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}

          {initialLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-44" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <Empty className="h-full min-h-48">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={Store01Icon} />
                </EmptyMedia>
                <EmptyTitle>{t('marketplace.no_results')}</EmptyTitle>
                <EmptyDescription>{t('marketplace.no_results_hint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {showFeatured ? (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <HubSectionLabel>{t('marketplace.featured')}</HubSectionLabel>
                    <Badge variant="secondary">{featuredItems.length}</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {featuredItems.map((item) => {
                      const meta = getActionMeta(item);
                      return (
                        <div
                          key={`featured-${item.type}-${item.id}`}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button')) return;
                            openItemDetail(item);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') openItemDetail(item);
                          }}
                          className="cursor-pointer"
                        >
                          <InstallCard
                            icon={TYPE_CONFIG[item.type].icon}
                            title={item.name}
                            description={item.description}
                            actionLabel={meta.label}
                            onAction={meta.onAction}
                            actionDisabled={meta.disabled}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <HubSectionLabel>
                    {mainTab === 'skills' ? t('marketplace.tab_skills') : t('marketplace.all_items')}
                  </HubSectionLabel>
                  <Badge variant="secondary">{regularItems.length}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {regularItems.map((item) => {
                    const meta = getActionMeta(item);
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        role={item.type === 'agents' || item.type === 'workflows' ? 'button' : undefined}
                        tabIndex={item.type === 'agents' || item.type === 'workflows' ? 0 : undefined}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          openItemDetail(item);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') openItemDetail(item);
                        }}
                        className={cn(
                          (item.type === 'agents' || item.type === 'workflows') && 'cursor-pointer',
                        )}
                      >
                        <InstallCard
                          icon={TYPE_CONFIG[item.type].icon}
                          title={item.name}
                          description={item.description}
                          actionLabel={meta.label}
                          onAction={meta.onAction}
                          actionDisabled={meta.disabled}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {selectedAgent ? (
        <MarketplaceAgentDetail
          agent={selectedAgent}
          isInstalled={installedIds.includes(selectedAgent.id)}
          hasUpdate={(() => { const r = installedAgentRecords[selectedAgent.id]; return r?.version != null && r.version !== selectedAgent.version; })()}
          isInstalling={installingId === selectedAgent.id}
          onInstall={handleInstallAgent}
          onClose={() => setSelectedAgent(null)}
        />
      ) : null}
      {selectedWorkflow ? (
        <WorkflowDetail
          workflow={selectedWorkflow}
          isInstalled={installedWorkflowIds.includes(selectedWorkflow.id)}
          hasUpdate={(() => { const r = installedWorkflowRecords[selectedWorkflow.id]; return r?.version != null && r.version !== selectedWorkflow.version; })()}
          isInstalling={installingWorkflowId === selectedWorkflow.id}
          onInstall={handleInstallWorkflow}
          onClose={() => setSelectedWorkflow(null)}
        />
      ) : null}
    </>
  );
}
