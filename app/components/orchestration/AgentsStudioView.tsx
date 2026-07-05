import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Copy,
  Download,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Store,
  Trash2,
  Upload,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  createManyAgent,
  deleteManyAgent,
  exportAgentsConfig,
  getManyAgents,
  importAgentsConfig,
  listAgentFolders,
  updateManyAgent,
} from '@/lib/agents/api';
import { listAutomations } from '@/lib/automations/api';
import { listRuns } from '@/lib/automations/api';
import { uninstallMarketplaceAgent } from '@/lib/marketplace/api';
import type { DomeAgentFolder, ManyAgent } from '@/types';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { showToast } from '@/lib/store/useToastStore';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { HUB_AGENTS_CHANGED, notifyHubAgentsChanged } from '@/lib/hub/hubEvents';
import { PENDING_AUTOMATIONS_FILTER_KEY } from '@/lib/hub/hubStorageKeys';
import AgentEditor from './AgentEditor';
import AgentChatView from '@/components/agents/AgentChatView';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import DomeButton from '@/components/ui/DomeButton';
import DomeContextMenu, { type DomeContextMenuItem } from '@/components/ui/DomeContextMenu';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import HubSearchField from '@/components/ui/HubSearchField';
import OrchestrationShell, { type OrchestrationStat } from './OrchestrationShell';

type ViewMode =
  | { kind: 'library' }
  | { kind: 'chat'; agentId: string }
  | { kind: 'edit'; agent: ManyAgent }
  | { kind: 'new' };

function formatAgentDate(ts: number): string {
  return new Date(ts).toLocaleDateString(getDateTimeLocaleTag(), {
    day: '2-digit',
    month: 'short',
  });
}

function isToday(ts: number | null | undefined): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Agents section — redesigned library with live KPIs, card grid and in-tab chat. */
export default function AgentsStudioView() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const { openAutomationsTab, openMarketplaceTab } = useTabStore();

  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [folders, setFolders] = useState<DomeAgentFolder[]>([]);
  const [runsToday, setRunsToday] = useState<number | null>(null);
  const [activeAutomations, setActiveAutomations] = useState<number | null>(null);
  const [mode, setMode] = useState<ViewMode>({ kind: 'library' });
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState<string>('all'); // all | favorites | <folderId> | root
  const [deleteTarget, setDeleteTarget] = useState<ManyAgent | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const fetchListData = useCallback(async () => {
    const [list, fds, runs, automations] = await Promise.all([
      getManyAgents(projectId),
      listAgentFolders(projectId),
      listRuns({ limit: 100, projectId }).catch(() => []),
      listAutomations({ projectId }).catch(() => []),
    ]);
    setAgents(list);
    setFolders(fds);
    setRunsToday(
      runs.filter((r) => r.ownerType === 'agent' && isToday(r.updatedAt ?? r.startedAt)).length,
    );
    setActiveAutomations(
      automations.filter((a) => a.targetType === 'agent' && a.enabled).length,
    );
  }, [projectId]);

  const { initialLoading: loading } = useHubListLoader(fetchListData, [projectId], {
    eventName: HUB_AGENTS_CHANGED,
  });

  const q = search.trim().toLowerCase();
  const visibleAgents = useMemo(() => {
    let list = agents;
    if (folderFilter === 'favorites') list = list.filter((a) => a.favorite);
    else if (folderFilter === 'root') list = list.filter((a) => !a.folderId);
    else if (folderFilter !== 'all') list = list.filter((a) => a.folderId === folderFilter);
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const fav = (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
      if (fav !== 0) return fav;
      return b.updatedAt - a.updatedAt;
    });
  }, [agents, folderFilter, q]);

  const stats: OrchestrationStat[] = [
    { label: t('orchestration.agents.stat_agents'), value: agents.length, tone: 'accent' },
    {
      label: t('orchestration.agents.stat_favorites'),
      value: agents.filter((a) => a.favorite).length,
    },
    {
      label: t('orchestration.agents.stat_runs_today'),
      value: runsToday ?? '—',
      tone: 'success',
      sub: t('orchestration.agents.stat_runs_today_sub'),
    },
    {
      label: t('orchestration.agents.stat_active_automations'),
      value: activeAutomations ?? '—',
      tone: 'warning',
      sub: t('orchestration.agents.stat_active_automations_sub'),
    },
  ];

  const toggleFavorite = async (agent: ManyAgent) => {
    const result = await updateManyAgent(agent.id, { favorite: !agent.favorite });
    if (result.success && result.data) {
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? result.data! : a)));
      notifyHubAgentsChanged();
    }
  };

  const duplicateAgent = async (agent: ManyAgent) => {
    const copy = {
      name: `${agent.name} ${t('orchestration.agents.copy_suffix')}`,
      description: agent.description,
      systemInstructions: agent.systemInstructions,
      toolIds: [...agent.toolIds],
      mcpServerIds: [...agent.mcpServerIds],
      skillIds: agent.skillIds ? [...agent.skillIds] : undefined,
      iconIndex: agent.iconIndex,
      folderId: agent.folderId,
      projectId,
    };
    const result = await createManyAgent(copy);
    if (result.success && result.data) {
      setAgents((prev) => [result.data!, ...prev]);
      showToast('success', t('toast.agent_created'));
      notifyHubAgentsChanged();
    } else {
      showToast('error', result.error || t('toast.agent_delete_error'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = deleteTarget.marketplaceId
      ? await uninstallMarketplaceAgent(deleteTarget.marketplaceId)
      : await deleteManyAgent(deleteTarget.id);
    if (result.success) {
      setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('success', t('toast.agent_deleted'));
      notifyHubAgentsChanged();
    } else {
      showToast('error', result.error || t('toast.agent_delete_error'));
    }
  };

  const openAgentAutomations = (agent: ManyAgent) => {
    try {
      sessionStorage.setItem(
        PENDING_AUTOMATIONS_FILTER_KEY,
        JSON.stringify({ targetType: 'agent', targetId: agent.id, targetLabel: agent.name }),
      );
    } catch {
      /* ignore */
    }
    openAutomationsTab();
  };

  const handleExport = () => {
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
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importAgentsConfig(text, projectId);
      if (result.success && result.data) {
        setAgents((prev) => [...prev, ...result.data!]);
        showToast('success', t('agents.import_count_other', { count: result.data.length }));
        notifyHubAgentsChanged();
      } else {
        showToast('error', result.error || t('toast.agent_import_error'));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('toast.agent_import_error'));
    } finally {
      setImporting(false);
    }
  };

  // ── Sub-screens ─────────────────────────────────────────────────────────────
  if (mode.kind === 'chat') {
    return (
      <AgentChatView agentId={mode.agentId} onBack={() => setMode({ kind: 'library' })} />
    );
  }

  if (mode.kind === 'edit' || mode.kind === 'new') {
    return (
      <div className="h-full flex flex-col">
        <AgentEditor
          initialAgent={mode.kind === 'edit' ? mode.agent : undefined}
          projectId={projectId}
          onComplete={(agent) => {
            setMode({ kind: 'library' });
            setAgents((prev) => {
              const exists = prev.some((a) => a.id === agent.id);
              return exists ? prev.map((a) => (a.id === agent.id ? agent : a)) : [agent, ...prev];
            });
            notifyHubAgentsChanged();
          }}
          onCancel={() => setMode({ kind: 'library' })}
        />
      </div>
    );
  }

  const folderChips = [
    { value: 'all', label: t('orchestration.filter_all') },
    { value: 'favorites', label: t('orchestration.agents.filter_favorites') },
    ...(folders.length > 0 ? [{ value: 'root', label: t('orchestration.filter_ungrouped') }] : []),
    ...folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <OrchestrationShell
      section="agents"
      title={t('tabs.agents')}
      subtitle={t('automationHub.agents_subtitle')}
      icon={Bot}
      stats={stats}
      actions={
        <>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label={t('automationHub.import_btn')}
            onChange={(e) => void handleImportFile(e)}
          />
          <DomeButton
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
            leftIcon={importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          >
            {t('automationHub.import_btn')}
          </DomeButton>
          <DomeButton
            variant="outline"
            size="sm"
            disabled={agents.length === 0}
            onClick={handleExport}
            leftIcon={<Download className="size-3.5" />}
          >
            {t('automationHub.export_btn')}
          </DomeButton>
          <DomeButton
            variant="primary"
            size="sm"
            onClick={() => setMode({ kind: 'new' })}
            className="!bg-[var(--dome-accent)]"
            leftIcon={<Plus className="size-3.5" />}
          >
            {t('orchestration.agents.new_agent')}
          </DomeButton>
        </>
      }
      toolbar={
        <div className="flex items-center gap-3 flex-wrap">
          <HubSearchField
            value={search}
            onChange={setSearch}
            placeholder={t('agents.search_placeholder')}
            ariaLabel={t('agents.search_placeholder')}
          />
          <DomeFilterChipGroup
            dense
            options={folderChips.map((c) => ({ value: c.value, label: c.label }))}
            value={folderFilter}
            onChange={setFolderFilter}
          />
        </div>
      }
    >
      {loading ? (
        <div className="p-6">
          <DomeSkeletonGrid count={9} />
        </div>
      ) : agents.length === 0 ? (
        <div className="p-6">
          <div
            className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl px-8 py-10 text-center"
            style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
          >
            <div
              className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
            >
              <Bot className="size-7" strokeWidth={1.5} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
              {t('agents.no_agents_yet')}
            </h2>
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {t('agents.no_agents_desc')}
            </p>
            <div className="mt-2 flex items-center gap-2 flex-wrap justify-center">
              <DomeButton
                variant="primary"
                size="sm"
                className="!bg-[var(--dome-accent)]"
                onClick={() => setMode({ kind: 'new' })}
                leftIcon={<Plus className="size-3.5" />}
              >
                {t('agents.create_first_agent')}
              </DomeButton>
              <DomeButton
                variant="outline"
                size="sm"
                onClick={openMarketplaceTab}
                leftIcon={<Store className="size-3.5" />}
              >
                {t('orchestration.explore_marketplace')}
              </DomeButton>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleAgents.map((agent) => {
            const toolsLabel =
              agent.toolIds.length > 0
                ? t('orchestration.agents.tools_count', { count: agent.toolIds.length })
                : t('agents.all_tools_available');
            const menuItems: DomeContextMenuItem[] = [
              {
                label: t('orchestration.agents.duplicate'),
                icon: <Copy className="size-3.5" />,
                onClick: () => void duplicateAgent(agent),
              },
              {
                label: t('agents.automations'),
                icon: <Zap className="size-3.5" />,
                onClick: () => openAgentAutomations(agent),
              },
              {
                label: t('ui.delete'),
                icon: <Trash2 className="size-3.5" />,
                variant: 'danger',
                onClick: () => setDeleteTarget(agent),
              },
            ];
            return (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                onClick={() => setMode({ kind: 'chat', agentId: agent.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setMode({ kind: 'chat', agentId: agent.id });
                  }
                }}
                className="group flex cursor-pointer flex-col gap-3 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
                style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                    style={{ background: 'var(--dome-accent-bg)' }}
                  >
                    <img src={`/agents/sprite_${agent.iconIndex}.png`} alt="" className="size-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                        {agent.name}
                      </span>
                      {agent.marketplaceId ? (
                        <Store className="size-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-xs leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                      {agent.description || t('agent.empty_chat')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorite(agent);
                    }}
                    className="shrink-0 rounded-md p-1 hover:bg-[var(--dome-bg-hover)]"
                    title={agent.favorite ? t('agents.unpin_agent') : t('agents.pin_agent')}
                    aria-label={agent.favorite ? t('agents.unpin_agent') : t('agents.pin_agent')}
                  >
                    <Star
                      className="size-4"
                      style={{
                        color: agent.favorite ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                        fill: agent.favorite ? 'var(--dome-accent)' : 'none',
                      }}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
                  >
                    <Wrench className="size-2.5" aria-hidden />
                    {toolsLabel}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
                  >
                    {t('agents.row_mcp_capabilities', { mcp: agent.mcpServerIds?.length ?? 0 })}
                  </span>
                  {agent.skillIds && agent.skillIds.length > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
                    >
                      {t('orchestration.agents.skills_count', { count: agent.skillIds.length })}
                    </span>
                  ) : null}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                    {formatAgentDate(agent.updatedAt)}
                  </span>
                  <div
                    className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <DomeButton
                      variant="outline"
                      size="xs"
                      onClick={() => setMode({ kind: 'chat', agentId: agent.id })}
                      leftIcon={<MessageSquare className="size-3" />}
                    >
                      {t('orchestration.agents.chat_action')}
                    </DomeButton>
                    <DomeButton
                      variant="ghost"
                      size="xs"
                      iconOnly
                      title={t('ui.edit')}
                      aria-label={t('ui.edit')}
                      onClick={() => setMode({ kind: 'edit', agent })}
                    >
                      <Pencil className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                    </DomeButton>
                    <DomeContextMenu
                      align="end"
                      trigger={
                        <DomeButton
                          variant="ghost"
                          size="xs"
                          iconOnly
                          aria-label={t('agents.folder_actions')}
                        >
                          <MoreHorizontal className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                        </DomeButton>
                      }
                      items={menuItems}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {q && visibleAgents.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {t('agents.no_search_results')}
            </p>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('agents.delete_agent')}
        message={deleteTarget ? t('agents.delete_agent_confirm', { name: deleteTarget.name }) : ''}
        variant="danger"
        confirmLabel={t('ui.delete')}
        cancelLabel={t('ui.cancel')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </OrchestrationShell>
  );
}
