import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  CalendarClockIcon as CalendarClockIcon,
  BotIcon as BotIcon,
  CableIcon as CableIcon,
  Download04Icon as DownloadIcon,
  FilterIcon as FilterIcon,
  HandIcon as HandIcon,
  Loading03Icon as Loader2Icon,
  PencilIcon as PencilIcon,
  PlayIcon as PlayIcon,
  PlusSignIcon as PlusIcon,
  SparklesIcon as SparklesIcon,
  Delete02Icon as Trash2Icon,
  Upload04Icon as UploadIcon,
  WorkflowSquare01Icon as WorkflowIcon,
  Cancel01Icon as XIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Input } from '@/components/ui/input';
import {
  deleteAutomation,
  listAutomations,
  onRunUpdated,
  runAutomationNow,
  runAutomationNowRaw,
  saveAutomation,
  type AutomationDefinition,
  type PersistentRun,
} from '@/lib/automations/api';
import { getManyAgents } from '@/lib/agents/api';
import { getWorkflows } from '@/lib/agent-canvas/api';
import { listAllFeeders, type FeederRecord } from '@/lib/feeders/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { showToast } from '@/lib/store/useToastStore';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { HUB_AUTOMATIONS_CHANGED } from '@/lib/hub/hubEvents';
import { PENDING_AUTOMATIONS_FILTER_KEY, PENDING_RUN_ID_KEY } from '@/lib/hub/hubStorageKeys';
import {
  exportAutomationBundle,
  downloadHubBundle,
  slugExportFilenamePart,
  parseHubExportBundle,
  importAutomationBundleOnly,
} from '@/lib/hub-export/bundle';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import AutomationEditor from './AutomationEditor';
import { EMPTY_DRAFT, formatHubDate, type DraftState } from '@/components/hub/automations/automationsShared';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { askStudioMany } from '@/components/studio-hub';
import { DomainStatChips, type DomainStat } from '@/components/shared/DomainStatChips';
import { HubHeader, HubPageHeader } from '@/components/hub';

import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import RunStatusBadge from '@/components/automations/RunStatusBadge';

const Bot = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BotIcon} {...props} />
);
const Cable = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={CableIcon} {...props} />
);
const Workflow = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={WorkflowIcon} {...props} />
);
interface StoredFilter {
  targetType: 'all' | 'agent' | 'workflow' | 'feeder';
  targetId?: string;
  targetLabel?: string;
}

function ActiveFilterBanner({ label, onClear }: { label: ReactNode; onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2 text-xs text-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <HugeiconsIcon icon={FilterIcon} className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <Button type="button" variant="ghost" size="xs" onClick={onClear}>
        <HugeiconsIcon icon={XIcon} data-icon="inline-start" />
        {t('automation.clear_filter')}
      </Button>
    </div>
  );
}
type HubEntityKind = 'agent' | 'workflow' | 'feeder';
function EntityIcon({ kind, size = 'sm' }: { kind: HubEntityKind; size?: 'sm' | 'md' }) {
  const Icon = kind === 'agent' ? Bot : kind === 'feeder' ? Cable : Workflow;
  return (
    <div className={cn('flex shrink-0 items-center justify-center bg-primary/10', size === 'sm' ? 'size-7 rounded-md' : 'size-8 rounded-lg')}>
      <Icon className={cn(size === 'sm' ? 'size-3.5' : 'size-4', kind === 'agent' ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
    </div>
  );
}

function weekdayName(weekday: number): string {
  // 1970-01-04 was a Sunday; weekday follows JS getDay() (0 = Sunday).
  const d = new Date(Date.UTC(1970, 0, 4 + weekday));
  return d.toLocaleDateString(getDateTimeLocaleTag(), { weekday: 'long', timeZone: 'UTC' });
}

/** Automations section — redesigned rules dashboard with inline enable toggle. */
export default function AutomationsStudioView() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const { openRunsTab } = useTabStore();

  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [feeders, setFeeders] = useState<FeederRecord[]>([]);
  const [hubArtifacts, setHubArtifacts] = useState<Array<{ resourceId: string; title: string }>>([]);
  const [filter, setFilter] = useState<StoredFilter>(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_AUTOMATIONS_FILTER_KEY);
      if (raw) {
        sessionStorage.removeItem(PENDING_AUTOMATIONS_FILTER_KEY);
        return JSON.parse(raw) as StoredFilter;
      }
    } catch {
      /* ignore */
    }
    return { targetType: 'all' };
  });
  const [search, setSearch] = useState('');
  const [formMode, setFormMode] = useState<'hidden' | 'new' | 'edit'>('hidden');
  const [draft, setDraft] = useState<DraftState>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationDefinition | null>(null);
  const [importingBundle, setImportingBundle] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const fetchListData = useCallback(async () => {
    const [all, agentList, workflowList, feederRes] = await Promise.all([
      listAutomations({ projectId }),
      getManyAgents(projectId).catch(() => []),
      getWorkflows(projectId).catch(() => []),
      listAllFeeders().catch(() => ({ success: false as const, data: [] as FeederRecord[] })),
    ]);
    setAutomations(all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
    setAgents(agentList);
    setWorkflows(workflowList);
    setFeeders(feederRes?.success && Array.isArray(feederRes.data) ? feederRes.data : []);
  }, [projectId]);

  const { initialLoading: loading, reload } = useHubListLoader(fetchListData, [projectId], {
    eventName: HUB_AUTOMATIONS_CHANGED,
  });

  // Load hub artifacts only when the form opens (for artifact sink bindings).
  useEffect(() => {
    if (formMode === 'hidden') return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.electron?.artifacts?.list(projectId);
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) {
          setHubArtifacts(
            res.data.map((a) => ({
              resourceId: a.resourceId,
              title: a.title && String(a.title).trim() ? String(a.title) : a.resourceId,
            })),
          );
        } else {
          setHubArtifacts([]);
        }
      } catch {
        if (!cancelled) setHubArtifacts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formMode, projectId]);

  // Keep last-run info live as runs finish.
  const handleRunUpdate = ({ run }: { run: PersistentRun }) => {
    if (run.ownerType === 'many' || !run.automationId) return;
    setAutomations((prev) =>
      prev.map((a) =>
        a.id === run.automationId
          ? {
              ...a,
              lastRunAt: run.finishedAt ?? run.startedAt ?? run.updatedAt ?? a.lastRunAt,
              lastRunStatus: run.status,
            }
          : a,
      ),
    );
  };

  useEffect(() => {
    const unsub = onRunUpdated(handleRunUpdate);
    return unsub;
  }, []);

  const targetName = useCallback(
    (a: AutomationDefinition): string => {
      if (a.targetType === 'agent') return agents.find((x) => x.id === a.targetId)?.name ?? a.targetId;
      if (a.targetType === 'workflow') return workflows.find((x) => x.id === a.targetId)?.name ?? a.targetId;
      if (a.targetType === 'feeder') return feeders.find((x) => x.id === a.targetId)?.name ?? a.targetId;
      return a.targetId;
    },
    [agents, workflows, feeders],
  );

  const triggerSummary = useCallback(
    (a: AutomationDefinition): string => {
      if (a.triggerType === 'manual') return t('automation.manual');
      if (a.triggerType === 'contextual') {
        const tags = a.schedule?.contextTags?.join(', ');
        return tags ? `${t('automation.contextual')} · ${tags}` : t('automation.contextual');
      }
      const s = a.schedule ?? {};
      const hour = String(s.hour ?? 8).padStart(2, '0');
      if (s.cadence === 'weekly') {
        return t('orchestration.automations.schedule_weekly', {
          weekday: weekdayName(s.weekday ?? 1),
          hour,
        });
      }
      if (s.cadence === 'cron-lite') {
        return t('orchestration.automations.schedule_interval', { minutes: s.intervalMinutes ?? 60 });
      }
      return t('orchestration.automations.schedule_daily', { hour });
    },
    [t],
  );

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let result = automations;
    if (filter.targetType !== 'all') result = result.filter((a) => a.targetType === filter.targetType);
    if (filter.targetId) result = result.filter((a) => a.targetId === filter.targetId);
    if (q) {
      result = result.filter(
        (a) => a.title.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [automations, filter, q]);

  const stats: DomainStat[] = [
    { id: 'stat_total', label: t('orchestration.automations.stat_total'), value: automations.length, tone: 'warning' },
    { id: 'stat_active', label: t('orchestration.automations.stat_active'),
      value: automations.filter((a) => a.enabled).length,
      tone: 'success',
    },
    { id: 'stat_scheduled', label: t('orchestration.automations.stat_scheduled'),
      value: automations.filter((a) => a.triggerType === 'schedule' && a.enabled).length,
      sub: t('orchestration.automations.stat_scheduled_sub'),
    },
    { id: 'stat_failing', label: t('orchestration.automations.stat_failing'),
      value: automations.filter((a) => a.lastRunStatus === 'failed').length,
      tone: 'error',
      sub: t('orchestration.automations.stat_failing_sub'),
    },
  ];

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleNew = () => {
    const defaultTarget =
      filter.targetType !== 'all'
        ? { targetType: filter.targetType as DraftState['targetType'], targetId: filter.targetId ?? '' }
        : { targetType: 'agent' as const, targetId: '' };
    setDraft({ ...EMPTY_DRAFT, ...defaultTarget });
    setFormMode('new');
  };

  const handleEdit = (a: AutomationDefinition) => {
    setDraft({
      id: a.id,
      title: a.title,
      description: a.description ?? '',
      targetType: a.targetType as DraftState['targetType'],
      targetId: a.targetId,
      triggerType: a.triggerType,
      enabled: a.enabled,
      cadence: a.schedule?.cadence ?? 'daily',
      hour: a.schedule?.hour ?? 8,
      weekday: a.schedule?.weekday ?? 1,
      intervalMinutes: a.schedule?.intervalMinutes ?? 60,
      outputMode: a.outputMode ?? 'chat_only',
      prompt: a.inputTemplate?.prompt ?? '',
      contextTags: (a.schedule?.contextTags ?? ['resource_opened']).join(', '),
      artifactBindings: (a.artifactBindings ?? []).map((b) => ({
        id: b.id,
        artifactResourceId: b.artifactResourceId,
        slot: b.slot || 'default',
        updatePolicy: b.updatePolicy,
        extractMode: b.extractMode,
        enabled: b.enabled !== false,
      })),
      boundArtifactResourceId: a.inputTemplate?.boundArtifactResourceId ?? '',
      artifactOutputSlot: a.inputTemplate?.artifactOutputSlot ?? 'default',
    });
    setFormMode('edit');
  };

  const handleSave = async () => {
    if (!draft.title.trim() || !draft.targetId) return;
    setSaving(true);
    try {
      const isFeederTarget = draft.targetType === 'feeder';
      await saveAutomation({
        id: draft.id,
        projectId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        targetType: draft.targetType,
        targetId: draft.targetId,
        triggerType: draft.triggerType,
        enabled: draft.enabled,
        schedule:
          draft.triggerType === 'schedule'
            ? {
                cadence: draft.cadence,
                hour: draft.cadence === 'cron-lite' ? 0 : draft.hour,
                weekday: draft.cadence === 'weekly' ? draft.weekday : null,
                intervalMinutes: draft.cadence === 'cron-lite' ? draft.intervalMinutes : undefined,
              }
            : draft.triggerType === 'contextual'
              ? {
                  contextTags: draft.contextTags
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : null,
        inputTemplate: isFeederTarget
          ? {}
          : {
              prompt: draft.prompt.trim(),
              ...(draft.boundArtifactResourceId.trim()
                ? {
                    boundArtifactResourceId: draft.boundArtifactResourceId.trim(),
                    artifactOutputSlot: (draft.artifactOutputSlot || 'default').trim(),
                  }
                : {}),
            },
        artifactBindings: isFeederTarget
          ? []
          : draft.artifactBindings
              .filter((b) => b.artifactResourceId.trim())
              .map((b) => ({
                id: b.id,
                artifactResourceId: b.artifactResourceId.trim(),
                slot: (b.slot || 'default').trim(),
                updatePolicy: b.updatePolicy,
                extractMode: b.extractMode,
                enabled: b.enabled,
              })),
        outputMode: isFeederTarget ? 'chat_only' : draft.outputMode,
      });
      showToast('success', draft.id ? t('toast.automation_updated') : t('toast.automation_created'));
      setFormMode('hidden');
      await reload({ silent: true });
    } catch {
      showToast('error', t('toast.automation_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (a: AutomationDefinition) => {
    setTogglingId(a.id);
    try {
      await saveAutomation({ id: a.id, enabled: !a.enabled });
      setAutomations((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)),
      );
    } catch {
      showToast('error', t('toast.automation_save_error'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleRun = async (a: AutomationDefinition) => {
    setRunningId(a.id);
    try {
      if (a.targetType === 'feeder') {
        await runAutomationNowRaw(a.id);
        setAutomations((prev) =>
          prev.map((x) =>
            x.id === a.id ? { ...x, lastRunAt: Date.now(), lastRunStatus: 'completed' } : x,
          ),
        );
        showToast('success', t('toast.automation_started'));
      } else {
        const run = await runAutomationNow(a.id);
        setAutomations((prev) =>
          prev.map((x) =>
            x.id === a.id
              ? { ...x, lastRunAt: run.startedAt ?? run.updatedAt ?? Date.now(), lastRunStatus: run.status }
              : x,
          ),
        );
        showToast('success', t('toast.automation_started_view_run'));
        try {
          sessionStorage.setItem(PENDING_RUN_ID_KEY, run.id);
        } catch {
          /* ignore */
        }
        openRunsTab();
      }
    } catch {
      showToast('error', t('toast.automation_run_error'));
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteAutomation(deleteTarget.id);
    setAutomations((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    setDeleteTarget(null);
    showToast('success', t('toast.automation_deleted'));
  };

  const handleExport = async (a: AutomationDefinition) => {
    const built = await exportAutomationBundle(a.id);
    if (!built.success) {
      showToast('error', built.error ?? t('hubExport.error_export'));
      return;
    }
    const name = `dome-automation-${slugExportFilenamePart(a.title)}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadHubBundle(name, built.bundle);
    showToast('success', t('hubExport.export_done'));
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingBundle(true);
    try {
      const text = await file.text();
      const parsed = parseHubExportBundle(text);
      if (!parsed.success) {
        showToast('error', parsed.error ?? t('hubExport.invalid_bundle'));
        return;
      }
      const result = await importAutomationBundleOnly(parsed.data, projectId);
      if (!result.success) {
        showToast('error', result.error ?? t('hubExport.error_import'));
        return;
      }
      showToast(
        'success',
        t('hubExport.import_done_automation', {
          automations: result.summary.automationsCreated,
          workflows: result.summary.workflowsCreated,
          agents: result.summary.agentsCreated,
        }),
      );
      await reload({ silent: true });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('hubExport.error_import'));
    } finally {
      setImportingBundle(false);
    }
  };

  // ── Full-screen editor ──────────────────────────────────────────────────────
  if (formMode !== 'hidden') {
    return (
      <div key={formMode === 'new' ? 'new' : `edit-${draft.id}`} className="h-full studio-view-enter">
        <AutomationEditor
          draft={draft}
          agents={agents}
          workflows={workflows}
          feeders={feeders}
          hubArtifacts={hubArtifacts}
          isNew={formMode === 'new'}
          saving={saving}
          onDraftChange={(partial) => setDraft((prev) => ({ ...prev, ...partial }))}
          onSave={() => void handleSave()}
          onCancel={() => setFormMode('hidden')}
        />
      </div>
    );
  }

  return (
    <div
      key="library"
      className="@container/automations flex h-full min-h-0 flex-col overflow-hidden bg-background studio-view-enter"
    >
      <HubPageHeader className="space-y-3">
        <HubHeader
          title={t('tabs.automations')}
          description={t('automationHub.automations_subtitle')}
          actions={
            <>
              <Input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                aria-label={t('hubExport.import_automation')}
                onChange={(e) => void handleImportFile(e)}
                disabled={importingBundle}
              />
              <Button
                variant="outline"
                disabled={importingBundle}
                onClick={() => importInputRef.current?.click()}
                size="sm"
              >
                {importingBundle ? (
                  <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" />
                ) : (
                  <HugeiconsIcon icon={UploadIcon} className="size-3.5" />
                )}
                {t('hubExport.import_automation')}
              </Button>
              <Button onClick={handleNew} size="sm">
                <HugeiconsIcon icon={PlusIcon} className="size-3.5" />
                {t('automation.button_new')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => askStudioMany(t('orchestration.agent_prompt_automations'))}
              >
                {t('orchestration.agent_ask_many')}
              </Button>
            </>
          }
        />
        <DomainStatChips stats={stats} />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="h-8 max-w-xl">
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('automation.search_automations')}
                aria-label={t('automation.search_automations')}
              />
            </InputGroup>
            <Tabs
              value={filter.targetType}
              onValueChange={(value) => {
                if (value) setFilter({ targetType: value as StoredFilter['targetType'] });
              }}
            >
              <TabsList variant="default">
                {(['all', 'agent', 'workflow', 'feeder'] as const).map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {t(`automation.filter_target_${value}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {filter.targetId ? (
            <ActiveFilterBanner
              label={t('orchestration.automations.filtered_by', {
                name: filter.targetLabel ?? filter.targetId,
              })}
              onClear={() => setFilter({ targetType: 'all' })}
            />
          ) : null}
        </div>
      </HubPageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6">
            <output className="flex w-full flex-col gap-3" aria-live="polite">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </output>
          </div>
        ) : automations.length === 0 ? (
          <div className="space-y-4 p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {t('orchestration.automations.stat_total')}
                </p>
                <p className="text-xl font-semibold tabular-nums text-warning">0</p>
              </div>
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {t('orchestration.automations.stat_active')}
                </p>
                <p className="text-xl font-semibold tabular-nums text-success">0</p>
              </div>
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {t('orchestration.automations.stat_scheduled')}
                </p>
                <p className="text-xl font-semibold tabular-nums">0</p>
              </div>
            </div>
            <div className="flex max-w-2xl flex-col gap-3 rounded-lg border bg-card px-6 py-6">
              <div className="flex size-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <HugeiconsIcon icon={SparklesIcon} className="size-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                {t('orchestration.automations.empty_title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('orchestration.automations.empty_desc')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleNew} size="sm">
                  <HugeiconsIcon icon={PlusIcon} className="size-3.5" />
                  {t('automation.button_new')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => askStudioMany(t('orchestration.agent_prompt_automations'))}
                >
                  {t('orchestration.agent_ask_many')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-6">
            {filtered.map((a) => {
              const running = runningId === a.id;
              return (
                <div
                  key={a.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border bg-card px-4 py-3',
                    !a.enabled && 'opacity-65',
                  )}
                >
                  <EntityIcon
                    kind={
                      a.targetType === 'agent'
                        ? 'agent'
                        : a.targetType === 'feeder'
                          ? 'feeder'
                          : 'workflow'
                    }
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {a.title}
                      </span>
                      {a.lastRunStatus ? <RunStatusBadge status={a.lastRunStatus} /> : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {a.triggerType === 'schedule' ? (
                          <HugeiconsIcon icon={CalendarClockIcon} className="size-3" aria-hidden />
                        ) : a.triggerType === 'manual' ? (
                          <HugeiconsIcon icon={HandIcon} className="size-3" aria-hidden />
                        ) : (
                          <HugeiconsIcon icon={SparklesIcon} className="size-3" aria-hidden />
                        )}
                        {triggerSummary(a)}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{targetName(a)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {t('orchestration.automations.last_run', {
                          date: formatHubDate(a.lastRunAt, t('runLog.never')),
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Switch
                      checked={a.enabled}
                      onCheckedChange={() => void handleToggleEnabled(a)}
                      size="sm"
                      disabled={togglingId === a.id}
                      aria-label={t('orchestration.automations.toggle_enabled')}
                    />
                    <Button
                      variant="outline"
                      disabled={running}
                      onClick={() => void handleRun(a)}
                      size="xs"
                    >
                      {running ? (
                        <HugeiconsIcon icon={Loader2Icon} className="size-3 animate-spin" />
                      ) : (
                        <HugeiconsIcon icon={PlayIcon} className="size-3" />
                      )}
                      {t('orchestration.automations.run_now')}
                    </Button>
                    <Button
                      variant="ghost"
                      title={t('ui.edit')}
                      aria-label={t('ui.edit')}
                      onClick={() => handleEdit(a)}
                      size="icon-xs"
                    >
                      <HugeiconsIcon icon={PencilIcon} className="size-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      title={t('hubExport.export_automation')}
                      aria-label={t('hubExport.export_automation')}
                      onClick={() => void handleExport(a)}
                      size="icon-xs"
                    >
                      <HugeiconsIcon icon={DownloadIcon} className="size-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      title={t('ui.delete')}
                      aria-label={t('ui.delete')}
                      className="text-destructive"
                      onClick={() => setDeleteTarget(a)}
                      size="icon-xs"
                    >
                      <HugeiconsIcon icon={Trash2Icon} className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('orchestration.automations.no_results')}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('orchestration.automations.delete_title')}
        message={
          deleteTarget
            ? t('orchestration.automations.delete_confirm', { name: deleteTarget.title })
            : ''
        }
        variant="danger"
        confirmLabel={t('ui.delete')}
        cancelLabel={t('ui.cancel')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
