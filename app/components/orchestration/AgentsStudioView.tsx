import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  BotIcon as BotIcon,
  CopyIcon as CopyIcon,
  Download04Icon as DownloadIcon,
  Loading03Icon as Loader2Icon,
  Comment01Icon as MessageSquareIcon,
  MoreHorizontalIcon as MoreHorizontalIcon,
  PencilIcon as PencilIcon,
  PlusSignIcon as PlusIcon,
  StarIcon as StarIcon,
  Store01Icon as StoreIcon,
  Delete02Icon as Trash2Icon,
  Upload04Icon as UploadIcon,
  Wrench01Icon as WrenchIcon,
  ZapIcon as ZapIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Search01Icon } from '@hugeicons/core-free-icons';
import OrchestrationShell, { type OrchestrationStat } from './OrchestrationShell';

import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
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
      stats={stats}
      actions={
        <>
          <Input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label={t('automationHub.import_btn')}
            onChange={(e) => void handleImportFile(e)}
          />
          <Button variant="outline" disabled={importing} onClick={() => importInputRef.current?.click()} size="sm">{importing ? <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" /> : <HugeiconsIcon icon={UploadIcon} className="size-3.5" />}
            {t('automationHub.import_btn')}
          </Button>
          <Button variant="outline" disabled={agents.length === 0} onClick={handleExport} size="sm">{<HugeiconsIcon icon={DownloadIcon} className="size-3.5" />}
            {t('automationHub.export_btn')}
          </Button>
          <Button onClick={() => setMode({ kind: 'new' })} className="!bg-primary" size="sm">{<HugeiconsIcon icon={PlusIcon} className="size-3.5" />}
            {t('orchestration.agents.new_agent')}
          </Button>
        </>
      }
      toolbar={
        <div className="flex items-center gap-3 flex-wrap">
          <InputGroup className="h-8 max-w-xl">
            <InputGroupAddon><HugeiconsIcon icon={Search01Icon} aria-hidden /></InputGroupAddon>
            <InputGroupInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('agents.search_placeholder')} aria-label={t('agents.search_placeholder')} />
          </InputGroup>
          <ToggleGroup value={[folderFilter]} onValueChange={(values) => values[0] && setFolderFilter(values[0])}>
            {folderChips.map((chip) => <ToggleGroupItem key={chip.value} value={chip.value} size="sm">{chip.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      }
    >
      {loading ? (
        <div className="p-6">
          <output className="flex w-full max-w-full flex-col gap-3" aria-live="polite">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </output>
        </div>
      ) : agents.length === 0 ? (
        <div className="p-6">
          <div
            className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl px-8 py-10 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
            >
              <HugeiconsIcon icon={BotIcon} className="size-7" strokeWidth={1.5} />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {t('agents.no_agents_yet')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('agents.no_agents_desc')}
            </p>
            <div className="mt-2 flex items-center gap-2 flex-wrap justify-center">
              <Button className="!bg-primary" onClick={() => setMode({ kind: 'new' })} size="sm">{<HugeiconsIcon icon={PlusIcon} className="size-3.5" />}
                {t('agents.create_first_agent')}
              </Button>
              <Button variant="outline" onClick={openMarketplaceTab} size="sm">{<HugeiconsIcon icon={StoreIcon} className="size-3.5" />}
                {t('orchestration.explore_marketplace')}
              </Button>
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
            const menuItems: Array<{
              label: string;
              icon?: ReactNode;
              onClick: () => void;
              variant?: 'default' | 'danger';
            }> = [
              {
                label: t('orchestration.agents.duplicate'),
                icon: <HugeiconsIcon icon={CopyIcon} className="size-3.5" />,
                onClick: () => void duplicateAgent(agent),
              },
              {
                label: t('agents.automations'),
                icon: <HugeiconsIcon icon={ZapIcon} className="size-3.5" />,
                onClick: () => openAgentAutomations(agent),
              },
              {
                label: t('ui.delete'),
                icon: <HugeiconsIcon icon={Trash2Icon} className="size-3.5" />,
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
                className="group flex cursor-pointer flex-col gap-3 rounded-2xl p-4 text-left transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10"
                  >
                    <img src={`/agents/sprite_${agent.iconIndex}.png`} alt="" className="size-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {agent.name}
                      </span>
                      {agent.marketplaceId ? (
                        <HugeiconsIcon icon={StoreIcon} className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {agent.description || t('agent.empty_chat')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorite(agent);
                    }}
                    title={agent.favorite ? t('agents.unpin_agent') : t('agents.pin_agent')}
                    aria-label={agent.favorite ? t('agents.unpin_agent') : t('agents.pin_agent')}
                  >
                    <HugeiconsIcon icon={StarIcon}
                      className="size-4"
                      style={{
                        color: agent.favorite ? 'var(--primary)' : 'var(--muted-foreground)',
                        fill: agent.favorite ? 'var(--primary)' : 'none',
                      }}
                    />
                  </Button>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--accent)', border: '1px solid var(--border)' }}
                  >
                    <HugeiconsIcon icon={WrenchIcon} className="size-2.5" aria-hidden />
                    {toolsLabel}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--accent)', border: '1px solid var(--border)' }}
                  >
                    {t('agents.row_mcp_capabilities', { mcp: agent.mcpServerIds?.length ?? 0 })}
                  </span>
                  {agent.skillIds && agent.skillIds.length > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background: 'var(--accent)', border: '1px solid var(--border)' }}
                    >
                      {t('orchestration.agents.skills_count', { count: agent.skillIds.length })}
                    </span>
                  ) : null}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {formatAgentDate(agent.updatedAt)}
                  </span>
                  <div
                    className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <Button variant="outline" onClick={() => setMode({ kind: 'chat', agentId: agent.id })} size="xs">{<HugeiconsIcon icon={MessageSquareIcon} className="size-3" />}
                      {t('orchestration.agents.chat_action')}
                    </Button>
                    <Button variant="ghost" title={t('ui.edit')} aria-label={t('ui.edit')} onClick={() => setMode({ kind: 'edit', agent })} size="icon-xs">
                      <HugeiconsIcon icon={PencilIcon} className="size-3.5 text-muted-foreground" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            aria-label={t('agents.folder_actions')}
                            size="icon-xs"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-40">
                        {menuItems.map((menuItem) => (
                          <DropdownMenuItem
                            key={menuItem.label}
                            variant={menuItem.variant === 'danger' ? 'destructive' : 'default'}
                            onClick={menuItem.onClick}
                          >
                            {menuItem.icon}
                            {menuItem.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
          {q && visibleAgents.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
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
