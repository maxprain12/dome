'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { BotIcon, CheckmarkCircle02Icon, Download04Icon, GitBranchIcon, Plug02Icon, PuzzleIcon, RefreshIcon, Search01Icon, SparklesIcon, Store01Icon, ZapIcon } from '@hugeicons/core-free-icons';
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
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getWorkflow } from '@/lib/agent-canvas/api';
import { useTranslation } from 'react-i18next';
import MarketplaceAgentDetail from './MarketplaceAgentDetail';
import WorkflowDetail from './WorkflowDetail';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageHeader } from '@/components/shared/PageHeader';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
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

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  all: { icon: Store01Icon, label: 'All' }, agents: { icon: BotIcon, label: 'Agent' }, workflows: { icon: GitBranchIcon, label: 'Workflow' }, mcp: { icon: PuzzleIcon, label: 'MCP' }, skills: { icon: SparklesIcon, label: 'Skill' }, plugins: { icon: Plug02Icon, label: 'Plugin' },
} satisfies Record<FilterType, { icon: IconSvgElement; label: string }>;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeIconBox({ type }: { type: Exclude<FilterType, 'all'> }) {
  return <div className="flex size-9 items-center justify-center rounded-xl bg-muted"><HugeiconsIcon icon={TYPE_CONFIG[type].icon} /></div>;
}

function TagChip({ tag }: { tag: string }) {
  return (
    <Badge variant="secondary">{tag}</Badge>
  );
}

interface ItemCardProps {
  item: UnifiedItem;
  action: React.ReactNode;
  onClick?: () => void;
  featured?: boolean;
}

function ItemCard({ item, action, onClick, featured }: ItemCardProps) {
  return <Card size="sm"><CardHeader><TypeIconBox type={item.type} /><CardTitle>{item.name}</CardTitle><CardDescription>{item.description}</CardDescription><CardAction>{action}</CardAction></CardHeader><CardContent className="flex flex-wrap gap-1"><Badge variant={featured ? 'default' : 'outline'}>{TYPE_CONFIG[item.type].label}</Badge>{item.tags.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}</CardContent><CardFooter className="justify-between"><span className="text-xs text-muted-foreground">{item.author ?? 'Dome Team'}{item.version ? ` · v${item.version}` : ''}</span>{onClick ? <Button type="button" variant="outline" size="sm" onClick={onClick}>Details</Button> : null}</CardFooter></Card>;
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const loadWorkflow = useCanvasStore((s) => s.loadWorkflow);
  const installedPluginIds = useMemo(() => new Set(plugins.map((p) => p.id)), [plugins]);

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
    if (filterType !== 'all') result = result.filter((i) => i.type === filterType);
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
  }, [allItems, filterType, filterCategory, searchQuery]);

  const featuredItems = useMemo(
    () => filteredItems.filter((i) => i.featured && (i.type === 'agents' || i.type === 'workflows')).slice(0, 4),
    [filteredItems],
  );

  const regularItems = useMemo(
    () => filterType === 'all' && !searchQuery.trim() && filterCategory === 'all'
      ? filteredItems.filter((i) => !featuredItems.includes(i))
      : filteredItems,
    [filteredItems, featuredItems, filterType, searchQuery, filterCategory],
  );

  const availableCategories = useMemo(() => {
    const source = filterType === 'all' ? allItems : allItems.filter((i) => i.type === filterType);
    const cats = new Set<string>();
    source.forEach((i) => i.tags.forEach((tag) => cats.add(tag)));
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [allItems, filterType]);

  const totalByType = useMemo(() => {
    const counts: Record<string, number> = {};
    allItems.forEach((i) => { counts[i.type] = (counts[i.type] ?? 0) + 1; });
    return counts;
  }, [allItems]);

  const typeFilterOptions = useMemo(() => {
    const types: FilterType[] = ['all', 'agents', 'workflows', 'skills', 'mcp', 'plugins'];
    const labels: Record<FilterType, string> = {
      all: t('marketplace.type_all'),
      agents: t('marketplace.type_agents'),
      workflows: t('marketplace.type_workflows'),
      mcp: t('marketplace.type_mcp'),
      skills: t('marketplace.type_skills'),
      plugins: t('marketplace.type_plugins'),
    };
    return types.map((type) => ({
      value: type,
      label: `${labels[type]} (${type === 'all' ? allItems.length : totalByType[type] ?? 0})`,
      selectedColor: 'var(--primary)',
    }));
  }, [t, allItems.length, totalByType]);

  const categoryFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('marketplace.category_all'), selectedColor: 'var(--primary)' },
      ...availableCategories.map((cat) => ({
        value: cat,
        label: categoryLabel(cat),
        selectedColor: 'var(--primary)',
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
          <Badge variant="secondary"><HugeiconsIcon icon={CheckmarkCircle02Icon} />{t('marketplace.installed')}</Badge>
        );
      }
      return (
        <Button type="button"
  onClick={(e) => { e.stopPropagation(); void handleInstallAgent(agent); }}
  disabled={!!installingId}
  size="sm">{isInstalling ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />}
          {isInstalling ? t('marketplace.installing') : hasUpdate ? t('marketplace.update') : t('marketplace.install')}
        </Button>
      );
    }

    if (item.type === 'workflows') {
      const workflow = item.raw as WorkflowTemplate;
      const isInstalled = installedWorkflowIds.includes(workflow.id);
      const workflowInstall = installedWorkflowRecords[workflow.id];
      const hasUpdate = workflowInstall?.version != null && workflowInstall.version !== workflow.version;
      const isInstalling = installingWorkflowId === workflow.id;
      return (
        <Button type="button"
  onClick={(e) => { e.stopPropagation(); void handleInstallWorkflow(workflow); }}
  disabled={!!installingWorkflowId}
  size="sm">{isInstalling ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />}
          {isInstalling ? t('marketplace.installing') : hasUpdate ? t('marketplace.update') : isInstalled ? t('marketplace.open') : t('marketplace.install')}
        </Button>
      );
    }

    if (item.type === 'plugins') {
      const plugin = item.raw as AvailablePlugin;
      const isInstalled = installedPluginIds.has(plugin.id);
      if (isInstalled) {
        return (
          <Badge variant="secondary"><HugeiconsIcon icon={CheckmarkCircle02Icon} />{t('marketplace.installed')}</Badge>
        );
      }
      return (
        <Button type="button"
  onClick={(e) => { e.stopPropagation(); void handleInstallPlugin(); }}
  disabled={!!installingPlugin}
  size="sm">{installingPlugin ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />}
          {installingPlugin ? t('marketplace.installing_plugin') : t('marketplace.install_plugin')}
        </Button>
      );
    }

    if (item.type === 'mcp') {
      const server = item.raw as MCPManifest;
      const isInstalled = installedMcpNames.has(server.name.toLowerCase());
      const isInstalling = installingMcpId === server.id;
      if (isInstalled) {
        return (
          <Badge variant="secondary"><HugeiconsIcon icon={CheckmarkCircle02Icon} />{t('marketplace.added')}</Badge>
        );
      }
      return (
        <Button type="button"
  onClick={(e) => { e.stopPropagation(); void handleInstallMcp(server); }}
  disabled={!!installingMcpId}
  size="sm">{isInstalling ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />}
          {isInstalling ? t('marketplace.adding') : t('marketplace.add')}
        </Button>
      );
    }

    if (item.type === 'skills') {
      const skill = item.raw as SkillManifest;
      const isInstalled = installedSkillIds.has(skill.id);
      const isInstalling = installingSkillId === skill.id;
      if (isInstalled) {
        return (
          <Badge variant="secondary"><HugeiconsIcon icon={ZapIcon} />{t('marketplace.active')}</Badge>
        );
      }
      return (
        <Button type="button"
  onClick={(e) => { e.stopPropagation(); void handleInstallSkill(skill); }}
  disabled={!!installingSkillId}
  size="sm">{isInstalling ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={ZapIcon} data-icon="inline-start" />}
          {isInstalling ? t('marketplace.installing') : t('marketplace.activate')}
        </Button>
      );
    }

    return null;
  }

  const showFeatured = filterType === 'all' && !searchQuery.trim() && filterCategory === 'all' && featuredItems.length > 0;

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4 p-5"><PageHeader title={t('marketplace.title')} description={initialLoading ? t('marketplace.loading') : t('marketplace.subtitle_count', { count: allItems.length })} actions={<Button type="button" variant="outline" onClick={() => void handleRefresh()} disabled={loading}>{loading ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />}{t('marketplace.refresh')}</Button>} /><InputGroup className="max-w-xl"><InputGroupAddon><HugeiconsIcon icon={Search01Icon} /></InputGroupAddon><InputGroupInput type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('marketplace.search_placeholder')} aria-label={t('marketplace.search_placeholder')} /></InputGroup><SidebarProvider className="min-h-0 flex-1 overflow-hidden rounded-xl border"><Sidebar collapsible="none" className="w-56 border-r"><SidebarContent><SidebarGroup><SidebarGroupLabel>{t('marketplace.filter_type')}</SidebarGroupLabel><SidebarGroupContent><ToggleGroup orientation="vertical" className="w-full" value={[filterType]} onValueChange={(values) => { const value = values[0] as FilterType | undefined; if (value) { setFilterType(value); setFilterCategory('all'); } }}>{typeFilterOptions.map((option) => <ToggleGroupItem key={option.value} value={option.value} className="w-full justify-start">{option.label}</ToggleGroupItem>)}</ToggleGroup></SidebarGroupContent></SidebarGroup>{availableCategories.length ? <SidebarGroup><SidebarGroupLabel>{t('marketplace.filter_category')}</SidebarGroupLabel><SidebarGroupContent><ToggleGroup orientation="vertical" className="w-full" value={[filterCategory]} onValueChange={(values) => values[0] && setFilterCategory(values[0])}>{categoryFilterOptions.map((option) => <ToggleGroupItem key={option.value} value={option.value} className="w-full justify-start">{option.label}</ToggleGroupItem>)}</ToggleGroup></SidebarGroupContent></SidebarGroup> : null}</SidebarContent></Sidebar><main className="min-w-0 flex-1 overflow-y-auto p-4">{initialLoading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-44" />)}</div> : filteredItems.length === 0 ? <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Search01Icon} /></EmptyMedia><EmptyTitle>{t('marketplace.no_results')}</EmptyTitle><EmptyDescription>{t('marketplace.no_results_hint')}</EmptyDescription></EmptyHeader></Empty> : <div className="flex flex-col gap-6">{showFeatured ? <section className="flex flex-col gap-3"><div className="flex items-center gap-2"><Badge>{t('marketplace.featured', 'Featured')}</Badge><span className="text-xs text-muted-foreground">{featuredItems.length}</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{featuredItems.map((item) => <ItemCard key={`featured-${item.type}-${item.id}`} item={item} action={renderAction(item)} onClick={item.type === 'agents' ? () => setSelectedAgent(item.raw as MarketplaceAgent) : item.type === 'workflows' ? () => setSelectedWorkflow(item.raw as WorkflowTemplate) : undefined} featured />)}</div></section> : null}<section className="flex flex-col gap-3"><div className="flex items-center gap-2"><h2 className="text-sm font-medium">{t('marketplace.all_items', 'All')}</h2><Badge variant="secondary">{regularItems.length}</Badge></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{regularItems.map((item) => <ItemCard key={`${item.type}-${item.id}`} item={item} action={renderAction(item)} onClick={item.type === 'agents' ? () => setSelectedAgent(item.raw as MarketplaceAgent) : item.type === 'workflows' ? () => setSelectedWorkflow(item.raw as WorkflowTemplate) : undefined} />)}</div></section></div>}</main></SidebarProvider></div>

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
