import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Download,
  Hand,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import {
  deleteAutomation,
  listAutomations,
  onRunUpdated,
  runAutomationNow,
  runAutomationNowRaw,
  saveAutomation,
  type AutomationDefinition,
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import DomeButton from '@/components/ui/DomeButton';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import DomeActiveFilterBanner from '@/components/ui/DomeActiveFilterBanner';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeStatusBadge from '@/components/ui/DomeStatusBadge';
import DomeToggle from '@/components/ui/DomeToggle';
import HubEntityIcon from '@/components/ui/HubEntityIcon';
import HubSearchField from '@/components/ui/HubSearchField';
import OrchestrationShell, { type OrchestrationStat } from './OrchestrationShell';

interface StoredFilter {
  targetType: 'all' | 'agent' | 'workflow' | 'feeder';
  targetId?: string;
  targetLabel?: string;
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
  useEffect(() => {
    const unsub = onRunUpdated(({ run }) => {
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
    });
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

  const stats: OrchestrationStat[] = [
    { label: t('orchestration.automations.stat_total'), value: automations.length, tone: 'warning' },
    {
      label: t('orchestration.automations.stat_active'),
      value: automations.filter((a) => a.enabled).length,
      tone: 'success',
    },
    {
      label: t('orchestration.automations.stat_scheduled'),
      value: automations.filter((a) => a.triggerType === 'schedule' && a.enabled).length,
      sub: t('orchestration.automations.stat_scheduled_sub'),
    },
    {
      label: t('orchestration.automations.stat_failing'),
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
    );
  }

  return (
    <OrchestrationShell
      section="automations"
      title={t('tabs.automations')}
      subtitle={t('automationHub.automations_subtitle')}
      icon={Zap}
      stats={stats}
      actions={
        <>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label={t('hubExport.import_automation')}
            onChange={(e) => void handleImportFile(e)}
            disabled={importingBundle}
          />
          <DomeButton
            variant="outline"
            size="sm"
            disabled={importingBundle}
            onClick={() => importInputRef.current?.click()}
            leftIcon={importingBundle ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          >
            {t('hubExport.import_automation')}
          </DomeButton>
          <DomeButton
            variant="primary"
            size="sm"
            onClick={handleNew}
            className="!bg-[var(--dome-accent)]"
            leftIcon={<Plus className="size-3.5" />}
          >
            {t('automation.button_new')}
          </DomeButton>
        </>
      }
      toolbar={
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <HubSearchField
              value={search}
              onChange={setSearch}
              placeholder={t('automation.search_automations')}
              ariaLabel={t('automation.search_automations')}
            />
            <DomeFilterChipGroup
              dense
              options={[
                { value: 'all', label: t('automation.filter_target_all') },
                { value: 'agent', label: t('automation.filter_target_agent') },
                { value: 'workflow', label: t('automation.filter_target_workflow') },
                { value: 'feeder', label: t('automation.filter_target_feeder') },
              ]}
              value={filter.targetType}
              onChange={(v) => setFilter({ targetType: v as StoredFilter['targetType'] })}
            />
          </div>
          {filter.targetId ? (
            <DomeActiveFilterBanner
              label={t('orchestration.automations.filtered_by', {
                name: filter.targetLabel ?? filter.targetId,
              })}
              onClear={() => setFilter({ targetType: 'all' })}
            />
          ) : null}
        </div>
      }
    >
      {loading ? (
        <div className="p-6">
          <DomeSkeletonGrid count={8} />
        </div>
      ) : automations.length === 0 ? (
        <div className="p-6">
          <div
            className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl px-8 py-10 text-center"
            style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
          >
            <div
              className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
            >
              <Sparkles className="size-7" strokeWidth={1.5} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
              {t('orchestration.automations.empty_title')}
            </h2>
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {t('orchestration.automations.empty_desc')}
            </p>
            <DomeButton
              variant="primary"
              size="sm"
              className="mt-2 !bg-[var(--dome-accent)]"
              onClick={handleNew}
              leftIcon={<Plus className="size-3.5" />}
            >
              {t('automation.button_new')}
            </DomeButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 p-6">
          {filtered.map((a) => {
            const running = runningId === a.id;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{
                  background: 'var(--dome-surface)',
                  border: '1px solid var(--dome-border)',
                  opacity: a.enabled ? 1 : 0.65,
                }}
              >
                <HubEntityIcon
                  kind={a.targetType === 'agent' ? 'agent' : a.targetType === 'feeder' ? 'feeder' : 'workflow'}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                      {a.title}
                    </span>
                    {a.lastRunStatus ? <DomeStatusBadge status={a.lastRunStatus} /> : null}
                  </div>
                  <div
                    className="mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px]"
                    style={{ color: 'var(--dome-text-muted)' }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {a.triggerType === 'schedule' ? (
                        <CalendarClock className="size-3" aria-hidden />
                      ) : a.triggerType === 'manual' ? (
                        <Hand className="size-3" aria-hidden />
                      ) : (
                        <Sparkles className="size-3" aria-hidden />
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
                  <DomeToggle
                    checked={a.enabled}
                    onChange={() => void handleToggleEnabled(a)}
                    size="sm"
                    disabled={togglingId === a.id}
                    aria-label={t('orchestration.automations.toggle_enabled')}
                  />
                  <DomeButton
                    variant="outline"
                    size="xs"
                    disabled={running}
                    onClick={() => void handleRun(a)}
                    leftIcon={running ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                  >
                    {t('orchestration.automations.run_now')}
                  </DomeButton>
                  <DomeButton
                    variant="ghost"
                    size="xs"
                    iconOnly
                    title={t('ui.edit')}
                    aria-label={t('ui.edit')}
                    onClick={() => handleEdit(a)}
                  >
                    <Pencil className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                  </DomeButton>
                  <DomeButton
                    variant="ghost"
                    size="xs"
                    iconOnly
                    title={t('hubExport.export_automation')}
                    aria-label={t('hubExport.export_automation')}
                    onClick={() => void handleExport(a)}
                  >
                    <Download className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                  </DomeButton>
                  <DomeButton
                    variant="ghost"
                    size="xs"
                    iconOnly
                    title={t('ui.delete')}
                    aria-label={t('ui.delete')}
                    className="!text-[var(--error)] hover:!bg-[var(--error-bg)]"
                    onClick={() => setDeleteTarget(a)}
                  >
                    <Trash2 className="size-3.5" />
                  </DomeButton>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {t('orchestration.automations.no_results')}
            </p>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('orchestration.automations.delete_title')}
        message={
          deleteTarget ? t('orchestration.automations.delete_confirm', { name: deleteTarget.title }) : ''
        }
        variant="danger"
        confirmLabel={t('ui.delete')}
        cancelLabel={t('ui.cancel')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </OrchestrationShell>
  );
}
