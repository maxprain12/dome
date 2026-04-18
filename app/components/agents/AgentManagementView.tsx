'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  Download,
  Upload,
  Zap,
  FolderOpen,
  Clock,
  ChevronRight,
  ChevronDown,
  Star,
  FolderPlus,
  MoreHorizontal,
} from 'lucide-react';
import {
  getManyAgents,
  deleteManyAgent,
  exportAgentsConfig,
  importAgentsConfig,
  listAgentFolders,
  createAgentFolderRecord,
  updateAgentFolderRecord,
  deleteAgentFolderRecord,
  updateManyAgent,
} from '@/lib/agents/api';
import { uninstallMarketplaceAgent } from '@/lib/marketplace/api';
import type { DomeAgentFolder, ManyAgent } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import AgentOnboarding from './AgentOnboarding';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { useAppStore } from '@/lib/store/useAppStore';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import HubSearchField from '@/components/ui/HubSearchField';
import HubListState from '@/components/ui/HubListState';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeButton from '@/components/ui/DomeButton';
import DomeContextMenu from '@/components/ui/DomeContextMenu';
import HubBentoCard from '@/components/ui/HubBentoCard';

const DND_AGENT_MIME = 'application/x-dome-agent-id';

function folderByIdMap(folders: DomeAgentFolder[]): Map<string, DomeAgentFolder> {
  const m = new Map<string, DomeAgentFolder>();
  for (const f of folders) m.set(f.id, f);
  return m;
}

function agentMatchesSearch(agent: ManyAgent, q: string): boolean {
  if (!q) return true;
  const n = agent.name.toLowerCase();
  const d = (agent.description || '').toLowerCase();
  return n.includes(q) || d.includes(q);
}

function folderNameMatches(folder: DomeAgentFolder, q: string): boolean {
  if (!q) return true;
  return folder.name.toLowerCase().includes(q);
}

/** Agent visible in search: matches text or lives under a folder whose name matches */
function agentVisibleInSearch(
  agent: ManyAgent,
  q: string,
  map: Map<string, DomeAgentFolder>,
): boolean {
  if (!q) return true;
  if (agentMatchesSearch(agent, q)) return true;
  let cur = agent.folderId ?? null;
  while (cur) {
    const f = map.get(cur);
    if (!f) break;
    if (folderNameMatches(f, q)) return true;
    cur = f.parentId;
  }
  return false;
}

/** Folder visible in search: name matches or has visible agent / visible child folder */
function folderVisibleInSearch(
  folder: DomeAgentFolder,
  q: string,
  allFolders: DomeAgentFolder[],
  agents: ManyAgent[],
  map: Map<string, DomeAgentFolder>,
): boolean {
  if (!q) return true;
  if (folderNameMatches(folder, q)) return true;
  if (agents.some((a) => a.folderId === folder.id && agentVisibleInSearch(a, q, map))) return true;
  return allFolders
    .filter((c) => c.parentId === folder.id)
    .some((c) => folderVisibleInSearch(c, q, allFolders, agents, map));
}

interface AgentManagementViewProps {
  onAgentSelect?: (agentId: string) => void;
  onShowAutomations?: (agentId: string, agentLabel: string) => void;
}

export default function AgentManagementView({ onAgentSelect, onShowAutomations }: AgentManagementViewProps) {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [folders, setFolders] = useState<DomeAgentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<ManyAgent | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManyAgent | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<DomeAgentFolder | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | 'root' | null>(null);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);

  const folderMap = useMemo(() => folderByIdMap(folders), [folders]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    const [list, fds] = await Promise.all([getManyAgents(projectId), listAgentFolders(projectId)]);
    setAgents(list);
    setFolders(fds);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const f of fds) next.add(f.id);
      return next;
    });
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const handler = () => void loadAll();
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, [loadAll]);

  const q = search.trim().toLowerCase();

  const visibleAgents = useMemo(() => {
    if (!q) return agents;
    return agents.filter((a) => agentVisibleInSearch(a, q, folderMap));
  }, [agents, q, folderMap]);

  const visibleFolders = useMemo(() => {
    if (!q) return folders;
    return folders.filter((f) => folderVisibleInSearch(f, q, folders, agents, folderMap));
  }, [folders, q, agents, folderMap]);

  const rootAgents = useMemo(
    () => visibleAgents.filter((a) => !a.folderId).sort((a, b) => b.updatedAt - a.updatedAt),
    [visibleAgents],
  );

  const childFolders = useCallback(
    (parentId: string | null) =>
      visibleFolders
        .filter((f) => (f.parentId ?? null) === parentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [visibleFolders],
  );

  const agentsInFolder = useCallback(
    (folderId: string) =>
      visibleAgents
        .filter((a) => a.folderId === folderId)
        .sort((a, b) => {
          const fa = a.favorite ? 1 : 0;
          const fb = b.favorite ? 1 : 0;
          if (fa !== fb) return fb - fa;
          return b.updatedAt - a.updatedAt;
        }),
    [visibleAgents],
  );

  const notifyAgentsChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dome:agents-changed'));
  }, []);

  const handleEditComplete = useCallback(
    (agent: ManyAgent) => {
      setEditingAgent(null);
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
      showToast('success', t('toast.agent_updated'));
      notifyAgentsChanged();
    },
    [notifyAgentsChanged, t],
  );

  const handleNewComplete = useCallback(
    (agent: ManyAgent) => {
      setShowNewAgent(false);
      setAgents((prev) => [agent, ...prev]);
      showToast('success', t('toast.agent_created'));
      notifyAgentsChanged();
      onAgentSelect?.(agent.id);
    },
    [onAgentSelect, notifyAgentsChanged, t],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const result = deleteTarget.marketplaceId
      ? await uninstallMarketplaceAgent(deleteTarget.marketplaceId)
      : await deleteManyAgent(deleteTarget.id);
    if (result.success) {
      setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('success', t('toast.agent_deleted'));
      notifyAgentsChanged();
    } else {
      showToast('error', result.error || t('toast.agent_delete_error'));
    }
  }, [deleteTarget, notifyAgentsChanged, t]);

  const confirmDeleteFolder = useCallback(async () => {
    if (!deleteFolderTarget) return;
    const result = await deleteAgentFolderRecord(deleteFolderTarget.id);
    if (result.success) {
      setDeleteFolderTarget(null);
      showToast('success', t('agents.folder_deleted'));
      await loadAll();
      notifyAgentsChanged();
    } else {
      showToast('error', result.error || t('agents.error_delete'));
    }
  }, [deleteFolderTarget, loadAll, notifyAgentsChanged, t]);

  const handleExport = useCallback(() => {
    if (agents.length === 0) {
      showToast('error', t('toast.no_agents_to_export'));
      return;
    }
    const json = exportAgentsConfig(agents);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dome-agents-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', t('toast.agents_exported', { count: agents.length }));
  }, [agents, t]);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const result = await importAgentsConfig(text, projectId);
        if (result.success && result.data) {
          setAgents((prev) => [...prev, ...result.data!]);
          showToast(
            'success',
            t('agents.import_count_other', { count: result.data.length }),
          );
          notifyAgentsChanged();
        } else {
          showToast('error', result.error || t('toast.agent_import_error'));
        }
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : t('toast.agent_import_error'));
      } finally {
        setImporting(false);
      }
    },
    [notifyAgentsChanged, projectId, t],
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNewRootFolder = async () => {
    const name = window.prompt(t('agents.new_folder_name'), t('filter.new_folder'));
    if (name === null) return;
    const result = await createAgentFolderRecord(name || t('filter.new_folder'), null, projectId);
    if (result.success && result.data) {
      setFolders((prev) => [...prev, result.data!]);
      setExpanded((p) => new Set(p).add(result.data!.id));
      showToast('success', t('agents.folder_created'));
      notifyAgentsChanged();
    } else {
      showToast('error', result.error || t('agents.error_import'));
    }
  };

  const handleNewChildFolder = async (parentId: string) => {
    const name = window.prompt(t('agents.new_folder_name'), t('filter.new_folder'));
    if (name === null) return;
    const result = await createAgentFolderRecord(name || t('filter.new_folder'), parentId, projectId);
    if (result.success && result.data) {
      setFolders((prev) => [...prev, result.data!]);
      setExpanded((p) => new Set(p).add(result.data!.id));
      showToast('success', t('agents.folder_created'));
      notifyAgentsChanged();
    } else {
      showToast('error', result.error || t('agents.error_import'));
    }
    setMenuFolderId(null);
  };

  const moveAgentToFolder = async (agentId: string, folderId: string | null) => {
    const result = await updateManyAgent(agentId, { folderId: folderId ?? undefined });
    if (result.success && result.data) {
      setAgents((prev) => prev.map((a) => (a.id === agentId ? result.data! : a)));
      showToast('success', t('agents.agent_moved'));
      notifyAgentsChanged();
    } else {
      showToast('error', result.error || t('agents.error_delete'));
    }
  };

  const toggleFavorite = async (agent: ManyAgent) => {
    const next = !agent.favorite;
    const result = await updateManyAgent(agent.id, { favorite: next });
    if (result.success && result.data) {
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? result.data! : a)));
      notifyAgentsChanged();
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(getDateTimeLocaleTag(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const renderAgentRow = (agent: ManyAgent) => {
    const desc = (agent.description || '').trim();
    const subtitleText =
      desc ||
      t(agent.toolIds?.length === 1 ? 'agents.tools_count_one' : 'agents.tools_count_other', {
        count: agent.toolIds?.length ?? 0,
      });

    return (
      <HubBentoCard
        key={agent.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_AGENT_MIME, agent.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onAgentSelect?.(agent.id)}
        icon={
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <img
              src={`/agents/sprite_${agent.iconIndex}.png`}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
        }
        title={
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--dome-text)' }}>
            {agent.name}
          </span>
        }
        subtitle={
          <span className="line-clamp-2" title={desc || undefined}>
            {subtitleText}
          </span>
        }
        meta={
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <span>
              {t('agents.row_capabilities', {
                tools: agent.toolIds?.length ?? 0,
                mcp: agent.mcpServerIds?.length ?? 0,
                skills: agent.skillIds?.length ?? 0,
              })}
            </span>
            {agent.updatedAt ? (
              <span className="inline-flex items-center gap-1 shrink-0">
                <span aria-hidden>·</span>
                <Clock className="w-3 h-3 shrink-0" aria-hidden />
                {formatDate(agent.updatedAt)}
              </span>
            ) : null}
          </div>
        }
        trailing={
          <DomeContextMenu
            align="end"
            trigger={
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-[var(--dome-bg)] transition-colors"
                title={t('ui.options')}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
              </button>
            }
            items={[
              {
                label: agent.favorite ? t('agents.unpin_agent') : t('agents.pin_agent'),
                icon: (
                  <Star
                    className="w-4 h-4"
                    style={{
                      color: agent.favorite ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                      fill: agent.favorite ? 'var(--dome-accent)' : 'none',
                    }}
                  />
                ),
                onClick: () => void toggleFavorite(agent),
              },
              ...(onShowAutomations
                ? [
                    {
                      label: t('agents.automations'),
                      icon: <Zap className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />,
                      onClick: () => onShowAutomations(agent.id, agent.name),
                    },
                  ]
                : []),
              {
                label: t('ui.edit'),
                icon: <Pencil className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />,
                onClick: () => setEditingAgent(agent),
              },
              {
                separator: true,
                label: t('ui.delete'),
                icon: <Trash2 className="w-4 h-4" />,
                variant: 'danger' as const,
                onClick: () => setDeleteTarget(agent),
              },
            ]}
          />
        }
      />
    );
  };

  const renderFolder = (folder: DomeAgentFolder, depth: number): React.ReactNode => {
    const isOpen = expanded.has(folder.id);
    const kids = childFolders(folder.id);
    const folderAgents = agentsInFolder(folder.id);
    const pad = Math.min(depth * 12, 48);

    const onDragOverRow = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_AGENT_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId(folder.id);
    };

    const onDropRow = (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DND_AGENT_MIME);
      setDragOverFolderId(null);
      if (id) void moveAgentToFolder(id, folder.id);
    };

    return (
      <div key={folder.id} className="flex flex-col gap-2">
        <div
          className="flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors"
          style={{
            marginLeft: pad,
            borderColor: dragOverFolderId === folder.id ? 'var(--dome-accent)' : 'var(--dome-border)',
            background:
              dragOverFolderId === folder.id ? 'var(--dome-accent-bg)' : 'var(--dome-surface)',
          }}
          onDragOver={onDragOverRow}
          onDragLeave={() => setDragOverFolderId((cur) => (cur === folder.id ? null : cur))}
          onDrop={onDropRow}
        >
          <button
            type="button"
            onClick={() => toggleExpand(folder.id)}
            className="p-1 rounded-lg hover:bg-[var(--dome-bg)] shrink-0"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            ) : (
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            )}
          </button>
          <FolderOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--dome-accent)' }} />
          <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
            {folder.name}
          </span>
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNewChildFolder(folder.id)}
              className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)]"
              title={t('filter.new_folder')}
            >
              <FolderPlus className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            </button>
            <button
              type="button"
              onClick={() => setMenuFolderId((m) => (m === folder.id ? null : folder.id))}
              className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)]"
              title={t('agents.folder_actions')}
              aria-haspopup="true"
            >
              <MoreHorizontal className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            </button>
            {menuFolderId === folder.id ? (
              <div
                className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-lg border py-1 shadow-lg"
                style={{
                  background: 'var(--dome-surface)',
                  borderColor: 'var(--dome-border)',
                }}
              >
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--dome-bg)]"
                  style={{ color: 'var(--dome-text)' }}
                  onClick={() => {
                    setMenuFolderId(null);
                    const name = window.prompt(t('agents.rename_folder'), folder.name);
                    if (name === null) return;
                    const trimmed = name.trim();
                    if (!trimmed) return;
                    void (async () => {
                      const result = await updateAgentFolderRecord(folder.id, { name: trimmed });
                      if (result.success) {
                        setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: trimmed } : f)));
                        showToast('success', t('agents.folder_renamed'));
                        notifyAgentsChanged();
                      } else {
                        showToast('error', result.error || t('agents.error_delete'));
                      }
                    })();
                  }}
                >
                  {t('agents.rename_folder')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--error-bg)]"
                  style={{ color: 'var(--error)' }}
                  onClick={() => {
                    setDeleteFolderTarget(folder);
                    setMenuFolderId(null);
                  }}
                >
                  {t('agents.delete_folder')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {isOpen ? (
          <div className="flex flex-col gap-2">
            {kids.map((k) => renderFolder(k, depth + 1))}
            {folderAgents.length > 0 ? (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                style={{ marginLeft: pad + 8 }}
              >
                {folderAgents.map((a) => renderAgentRow(a))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  if (editingAgent) {
    return (
      <div className="h-full flex flex-col">
        <AgentOnboarding
          initialAgent={editingAgent}
          projectId={projectId}
          onComplete={handleEditComplete}
          onCancel={() => setEditingAgent(null)}
        />
      </div>
    );
  }

  if (showNewAgent) {
    return (
      <div className="h-full flex flex-col">
        <AgentOnboarding
          projectId={projectId}
          onComplete={handleNewComplete}
          onCancel={() => setShowNewAgent(false)}
        />
      </div>
    );
  }

  const rootDropCommon = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_AGENT_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId('root');
    },
    onDragLeave: () => setDragOverFolderId((cur) => (cur === 'root' ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DND_AGENT_MIME);
      setDragOverFolderId(null);
      if (id) void moveAgentToFolder(id, null);
    },
  };

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
        <HubToolbar
          dense
          leading={
            <HubTitleBlock
              icon={Bot}
              title={t('agents.agent_library')}
              subtitle={
                agents.length === 1
                  ? t('agents.agents_configured_one', { count: agents.length })
                  : t('agents.agents_configured_other', { count: agents.length })
              }
            />
          }
          center={
            <HubSearchField
              value={search}
              onChange={setSearch}
              placeholder={t('agents.search_placeholder')}
              ariaLabel={t('agents.search_placeholder')}
            />
          }
          trailing={
            <>
              <button
                type="button"
                onClick={() => void handleNewRootFolder()}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
              >
                <FolderPlus className="w-3 h-3" />
                {t('filter.new_folder')}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={agents.length === 0}
                className="flex items-center justify-center w-7 h-7 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--dome-surface)]"
                title={t('agents.export_agents')}
              >
                <Download className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
              </button>
              <label className="flex items-center justify-center w-7 h-7 rounded-md transition-all hover:bg-[var(--dome-surface)] cursor-pointer">
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => void handleImportFile(e)}
                  disabled={importing}
                />
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                ) : (
                  <Upload className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                )}
              </label>
              <button
                type="button"
                onClick={() => setShowNewAgent(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all hover:opacity-90"
                style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}
              >
                <Plus className="w-3 h-3" />
                {t('ui.add')}
              </button>
            </>
          }
        />

        <div
          className="flex-1 overflow-y-auto p-4"
          {...rootDropCommon}
          style={{
            outline: dragOverFolderId === 'root' ? '2px dashed var(--dome-accent)' : undefined,
            outlineOffset: -4,
          }}
        >
          {dragOverFolderId === 'root' ? (
            <p className="text-xs mb-3 font-medium" style={{ color: 'var(--dome-accent)' }}>
              {t('agents.move_to_root')}
            </p>
          ) : null}
          {isLoading ? (
            <DomeSkeletonGrid
              count={10}
              className="animate-in fade-in duration-150 motion-reduce:animate-none"
            />
          ) : agents.length === 0 ? (
            <HubListState
              variant="empty"
              icon={<FolderOpen className="w-7 h-7" style={{ color: 'var(--dome-accent)' }} />}
              title={t('agents.no_agents_yet')}
              description={t('agents.no_agents_desc')}
              action={
                <DomeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setShowNewAgent(true)}
                  className="mt-1 !bg-[var(--dome-accent)]"
                  leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden />}
                >
                  {t('agents.create_first_agent')}
                </DomeButton>
              }
            />
          ) : (
            <div className="flex flex-col gap-4 animate-in fade-in duration-150 motion-reduce:animate-none">
              {childFolders(null).map((f) => renderFolder(f, 0))}
              {rootAgents.length > 0 ? (
                <div>
                  {childFolders(null).length > 0 ? (
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                      {t('agents.ungrouped_agents')}
                    </p>
                  ) : null}
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  >
                    {rootAgents.map((a) => renderAgentRow(a))}
                  </div>
                </div>
              ) : null}
              {q && visibleAgents.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('agents.no_search_results')}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('agents.delete_agent')}
        message={deleteTarget ? t('agents.delete_agent_confirm', { name: deleteTarget.name }) : ''}
        variant="danger"
        confirmLabel={t('ui.delete')}
        cancelLabel={t('ui.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        isOpen={!!deleteFolderTarget}
        title={t('agents.delete_folder')}
        message={
          deleteFolderTarget
            ? t('agents.delete_folder_confirm', { name: deleteFolderTarget.name })
            : ''
        }
        variant="danger"
        confirmLabel={t('ui.delete')}
        cancelLabel={t('ui.cancel')}
        onConfirm={() => void confirmDeleteFolder()}
        onCancel={() => setDeleteFolderTarget(null)}
      />

    </>
  );
}
