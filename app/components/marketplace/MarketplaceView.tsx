'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { MARKETPLACE_TYPE_TINTS } from '@/lib/ui/palettes';
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
  Zap,
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
import { openSkillsFolder, installBundledSkill, listSkills } from '@/lib/skills/client';
import type { MCPServerConfig } from '@/types';
import DomeButton from '@/components/ui/DomeButton';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeListState from '@/components/ui/DomeListState';
import HubSearchField from '@/components/ui/HubSearchField';
import { EditorialShell } from '@/components/home/editorial/EditorialShell';
import { EditorialPageHero } from '@/components/home/editorial/EditorialPageHero';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getWorkflow } from '@/lib/agent-canvas/api';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
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

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  all:       { Icon: Store,     iconBg: 'var(--bg-tertiary)',   iconColor: 'var(--tertiary-text)', label: '' },
  agents:    { Icon: Bot,       iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)',  label: 'Agent' },
  workflows: { Icon: Workflow,  iconBg: MARKETPLACE_TYPE_TINTS.workflows.iconBg,              iconColor: MARKETPLACE_TYPE_TINTS.workflows.iconColor,              label: 'Workflow' },
  mcp:       { Icon: FolderCog, iconBg: MARKETPLACE_TYPE_TINTS.mcp.iconBg,              iconColor: MARKETPLACE_TYPE_TINTS.mcp.iconColor,              label: 'MCP' },
  skills:    { Icon: Sparkles,  iconBg: MARKETPLACE_TYPE_TINTS.skills.iconBg,              iconColor: MARKETPLACE_TYPE_TINTS.skills.iconColor,              label: 'Skill' },
  plugins:   { Icon: Plug,      iconBg: MARKETPLACE_TYPE_TINTS.plugins.iconBg,              iconColor: MARKETPLACE_TYPE_TINTS.plugins.iconColor,              label: 'Plugin' },
} satisfies Record<FilterType, { Icon: React.ElementType; iconBg: string; iconColor: string; label: string }>;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeIconBox({ type }: { type: Exclude<FilterType, 'all'> }) {
  const { Icon, iconBg, iconColor } = TYPE_CONFIG[type];
  return (
    <div className="hub-marketplace-type-icon" style={{ backgroundColor: iconBg }}>
      <Icon size={18} color={iconColor} strokeWidth={2} />
    </div>
  );
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="hub-marketplace-tag-chip">
      {tag}
    </span>
  );
}

interface ItemCardProps {
  item: UnifiedItem;
  action: React.ReactNode;
  onClick?: () => void;
  featured?: boolean;
}

function ItemCard({ item, action, onClick, featured }: ItemCardProps) {
  const { label, iconBg, iconColor } = TYPE_CONFIG[item.type];
  const interactive = Boolean(onClick);

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick?.(); } }}
      className={cn(
        'hub-marketplace-item-card',
        featured && 'hub-marketplace-item-card--featured',
        interactive && 'hub-marketplace-item-card--interactive',
      )}
    >
      {/* Header row: icon + name + star + action */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <TypeIconBox type={item.type} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{
              fontWeight: 700, fontSize: 13.5, color: 'var(--primary-text)',
              lineHeight: 1.3, wordBreak: 'break-word',
            }}>
              {item.name}
            </span>
            {item.featured && <Star size={13} fill="var(--warning)" color="var(--warning)" />}
            <span
              className="hub-marketplace-item-type-badge"
              style={{ backgroundColor: iconBg, color: iconColor }}
            >
              {label}
            </span>
          </div>
          <p className="hub-marketplace-item-desc">
            {item.description}
          </p>
        </div>
        {/* Action pinned to top-right — handlers only isolate events from the
            clickable card behind (propagation barrier, not an interaction). */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          style={{ flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {action}
        </div>
      </div>

      {/* Footer row: author + tags */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--tertiary-text)' }}>
          {item.author ?? 'Dome Team'}{item.version ? ` · v${item.version}` : ''}
        </span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {item.tags.slice(0, 3).map((t) => <TagChip key={t} tag={t} />)}
        </div>
      </div>
    </div>
  );
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
      selectedColor: 'var(--dome-accent)',
    }));
  }, [t, allItems.length, totalByType]);

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
          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--success)' }}>
            <CheckCircle2 size={13} /> {t('marketplace.installed')}
          </span>
        );
      }
      return (
        <DomeButton type="button" variant="primary" size="sm"
          onClick={(e) => { e.stopPropagation(); void handleInstallAgent(agent); }}
          disabled={!!installingId} loading={isInstalling}
          leftIcon={!isInstalling ? <Download size={12} /> : undefined}
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
        <DomeButton type="button" variant="primary" size="sm"
          onClick={(e) => { e.stopPropagation(); void handleInstallWorkflow(workflow); }}
          disabled={!!installingWorkflowId} loading={isInstalling}
          leftIcon={!isInstalling ? <Download size={12} /> : undefined}
        >
          {isInstalling ? t('marketplace.installing') : hasUpdate ? t('marketplace.update') : isInstalled ? t('marketplace.open') : t('marketplace.install')}
        </DomeButton>
      );
    }

    if (item.type === 'plugins') {
      const plugin = item.raw as AvailablePlugin;
      const isInstalled = installedPluginIds.has(plugin.id);
      if (isInstalled) {
        return (
          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--success)' }}>
            <CheckCircle2 size={13} /> {t('marketplace.installed')}
          </span>
        );
      }
      return (
        <DomeButton type="button" variant="primary" size="sm"
          onClick={(e) => { e.stopPropagation(); void handleInstallPlugin(); }}
          disabled={!!installingPlugin} loading={!!installingPlugin}
          leftIcon={!installingPlugin ? <Download size={12} /> : undefined}
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
          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--success)' }}>
            <CheckCircle2 size={13} /> {t('marketplace.added')}
          </span>
        );
      }
      return (
        <DomeButton type="button" variant="primary" size="sm"
          onClick={(e) => { e.stopPropagation(); void handleInstallMcp(server); }}
          disabled={!!installingMcpId} loading={isInstalling}
          leftIcon={!isInstalling ? <Download size={12} /> : undefined}
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
          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--success)' }}>
            <Zap size={13} /> {t('marketplace.active')}
          </span>
        );
      }
      return (
        <DomeButton type="button" variant="primary" size="sm"
          onClick={(e) => { e.stopPropagation(); void handleInstallSkill(skill); }}
          disabled={!!installingSkillId} loading={isInstalling}
          leftIcon={!isInstalling ? <Zap size={12} /> : undefined}
        >
          {isInstalling ? t('marketplace.installing') : t('marketplace.activate')}
        </DomeButton>
      );
    }

    return null;
  }

  const showFeatured = filterType === 'all' && !searchQuery.trim() && filterCategory === 'all' && featuredItems.length > 0;

  const marketplaceBody = (
    <div className="hub-marketplace-body">
      <div className="hub-marketplace-sidebar">
        <div>
          <DomeSectionLabel style={{ marginBottom: 6, paddingLeft: 8, fontSize: 12, letterSpacing: '0.08em' }}>
            {t('marketplace.filter_type')}
          </DomeSectionLabel>
          <DomeFilterChipGroup
            options={typeFilterOptions}
            value={filterType}
            onChange={(v) => { setFilterType(v); setFilterCategory('all'); }}
            layout="vertical"
            className="gap-0.5"
          />
        </div>

        {availableCategories.length > 0 ? (
          <div>
            <DomeSectionLabel style={{ marginBottom: 6, paddingLeft: 8, fontSize: 12, letterSpacing: '0.08em' }}>
              {t('marketplace.filter_category')}
            </DomeSectionLabel>
            <DomeFilterChipGroup
              options={categoryFilterOptions}
              value={filterCategory}
              onChange={setFilterCategory}
              layout="vertical"
              className="gap-0.5"
            />
          </div>
        ) : null}
      </div>

      <div className="hub-marketplace-main">
        {initialLoading ? (
          <div style={{ padding: 20 }}>
            <DomeSkeletonGrid count={8} cellHeightClass="h-28" />
          </div>
        ) : filteredItems.length === 0 ? (
          <DomeListState
            variant="empty"
            fullHeight
            icon={<Search size={40} style={{ opacity: 0.2 }} />}
            title={t('marketplace.no_results')}
            description={t('marketplace.no_results_hint')}
          />
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {showFeatured ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Star size={13} fill="var(--warning)" color="var(--warning)" />
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tertiary-text)' }}>
                    {t('marketplace.featured', 'Featured')}
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}>
                  {featuredItems.map((item) => (
                    <ItemCard
                      key={`featured-${item.type}-${item.id}`}
                      item={item}
                      action={renderAction(item)}
                      onClick={item.type === 'agents' ? () => setSelectedAgent(item.raw as MarketplaceAgent)
                        : item.type === 'workflows' ? () => setSelectedWorkflow(item.raw as WorkflowTemplate)
                        : undefined}
                      featured
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {regularItems.length > 0 ? (
              <div>
                {showFeatured ? (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tertiary-text)' }}>
                      {t('marketplace.all_items', 'All')}
                      <span style={{
                        marginLeft: 8, fontSize: 12, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                        backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary-text)',
                      }}>
                        {regularItems.length}
                      </span>
                    </span>
                  </div>
                ) : null}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 10,
                }}>
                  {regularItems.map((item) => (
                    <ItemCard
                      key={`${item.type}-${item.id}`}
                      item={item}
                      action={renderAction(item)}
                      onClick={item.type === 'agents' ? () => setSelectedAgent(item.raw as MarketplaceAgent)
                        : item.type === 'workflows' ? () => setSelectedWorkflow(item.raw as WorkflowTemplate)
                        : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
    <EditorialShell shellClassName="hub-tab-shell hub-marketplace-shell" variant="split" body={marketplaceBody}>
      <EditorialPageHero
        title={t('marketplace.title')}
        subtitle={
          initialLoading
            ? t('marketplace.loading')
            : t('marketplace.subtitle_count', { count: allItems.length })
        }
        stat={{
          label: t('marketplace.filter_type'),
          value: allItems.length,
        }}
        actions={
          <>
            <div className="hub-marketplace-toolbar" style={{ width: '100%', marginBottom: 0 }}>
              <div className="hub-marketplace-search">
                <HubSearchField
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={t('marketplace.search_placeholder')}
                  ariaLabel={t('marketplace.search_placeholder')}
                />
              </div>
            </div>
            <button
              type="button"
              className="h-pill-btn"
              onClick={() => void handleRefresh()}
              disabled={loading}
            >
              <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} aria-hidden />
              {t('marketplace.refresh')}
            </button>
          </>
        }
      />
    </EditorialShell>

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
