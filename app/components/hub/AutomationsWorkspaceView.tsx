'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Zap, Plus, Play, Trash2, Pencil, Clock, Loader2, Download, Upload } from 'lucide-react';
import {
  listAutomations,
  deleteAutomation,
  runAutomationNow,
  runAutomationNowRaw,
  saveAutomation,
  onRunUpdated,
  AUTOMATIONS_CHANGED_EVENT,
  type AutomationDefinition,
} from '@/lib/automations/api';
import { listAllFeeders, type FeederRecord } from '@/lib/feeders/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  exportAutomationBundle,
  downloadHubBundle,
  slugExportFilenamePart,
  parseHubExportBundle,
  importAutomationBundleOnly,
} from '@/lib/hub-export/bundle';
import HubSearchField from '@/components/ui/HubSearchField';
import HubListState from '@/components/ui/HubListState';
import HubBentoCard from '@/components/ui/HubBentoCard';
import HubEntityIcon from '@/components/ui/HubEntityIcon';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import { useEditorialHub } from '@/lib/context/EditorialHubContext';
import { useHubWorkspace } from '@/lib/context/HubWorkspaceContext';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { PENDING_RUN_ID_KEY } from '@/lib/hub/hubStorageKeys';
import { useTabStore } from '@/lib/store/useTabStore';
import DomeStatusBadge from '@/components/ui/DomeStatusBadge';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import DomeActiveFilterBanner from '@/components/ui/DomeActiveFilterBanner';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import DomeDrawerLayout from '@/components/ui/DomeDrawerLayout';
import DomeButton from '@/components/ui/DomeButton';
import { useAppStore } from '@/lib/store/useAppStore';

export interface AutomationFilter {
  targetType: 'all' | 'agent' | 'workflow' | 'feeder';
  targetId?: string;
  targetLabel?: string;
}
// Piezas extraídas (03/T02) — misma UI, archivos por sección.
import { formatHubDate, EMPTY_DRAFT, type DraftState } from './automations/automationsShared';
import AutomationEditDrawer from './automations/AutomationEditDrawer';

interface AutomationsTabProps {
  projectId: string;
  initialFilter?: AutomationFilter;
  agents: ManyAgent[];
  workflows: CanvasWorkflow[];
  onRegisterSilentRefresh?: (refresh: (() => void) | null) => void;
}

function automationTargetIconKind(a: AutomationDefinition): 'agent' | 'workflow' | 'feeder' {
  if (a.targetType === 'agent') return 'agent';
  if (a.targetType === 'feeder') return 'feeder';
  return 'workflow';
}

function AutomationsTab({
  projectId,
  initialFilter,
  agents,
  workflows,
  onRegisterSilentRefresh,
}: AutomationsTabProps) {
  const { t } = useTranslation();
  const editorialHub = useEditorialHub();
  const hubCardVariant = editorialHub ? 'editorial' : 'card';
  const hubListClass = editorialHub
    ? 'hub-list-stack w-full max-w-full'
    : 'flex w-full max-w-full flex-col gap-3';
  const hubWorkspace = useHubWorkspace();
  const appProject = useAppStore((s) => s.currentProject);
  const [scopeProjectName, setScopeProjectName] = useState<string | null>(null);
  const automationImportInputRef = useRef<HTMLInputElement>(null);
  const [importingAutomationBundle, setImportingAutomationBundle] = useState(false);
  const triggerLabel = useCallback(
    (trigger: string) =>
      trigger === 'schedule'
        ? t('automation.scheduled')
        : trigger === 'manual'
          ? t('automation.manual')
          : t('automation.contextual'),
    [t],
  );
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [filter, setFilter] = useState<AutomationFilter>(initialFilter ?? { targetType: 'all' });
  // 'hidden' = list, 'new' | 'edit' = full-screen form
  const [formMode, setFormMode] = useState<'hidden' | 'new' | 'edit'>('hidden');
  const [draft, setDraft] = useState<DraftState>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [hubArtifacts, setHubArtifacts] = useState<Array<{ resourceId: string; title: string }>>([]);
  const [feeders, setFeeders] = useState<FeederRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (formMode !== 'hidden') {
      void (async () => {
        try {
          const res = await window.electron?.artifacts?.list(projectId);
          if (cancelled) return;
          if (res?.success && Array.isArray(res.data)) {
            setHubArtifacts(
              res.data.map((a) => ({
                resourceId: a.resourceId,
                title: (a.title && String(a.title).trim()) ? String(a.title) : a.resourceId,
              })),
            );
          } else {
            setHubArtifacts([]);
          }
        } catch {
          if (!cancelled) setHubArtifacts([]);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [formMode, projectId]);

  // Load feeders when the drawer opens or when the user enables the feeder filter,
  // so the segmented selector and list resolvers always have fresh data.
  useEffect(() => {
    let cancelled = false;
    const needsFeeders = formMode !== 'hidden' || filter.targetType === 'feeder' || filter.targetType === 'all';
    if (!needsFeeders) return undefined;
    void (async () => {
      try {
        const res = await listAllFeeders();
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) {
          setFeeders(res.data);
        } else {
          setFeeders([]);
        }
      } catch {
        if (!cancelled) setFeeders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formMode, filter.targetType]);

  // Update filter when initialFilter changes (from clicking "Automatizaciones" on an agent/workflow)
  const prevInitialFilterRef = useRef(initialFilter);
  if (initialFilter !== prevInitialFilterRef.current && initialFilter) {
    prevInitialFilterRef.current = initialFilter;
    setFilter(initialFilter);
  }

  const projectScopeKey = `${projectId}:${appProject?.id ?? ''}`;
  const prevProjectScopeKeyRef = useRef(projectScopeKey);
  if (projectScopeKey !== prevProjectScopeKeyRef.current) {
    prevProjectScopeKeyRef.current = projectScopeKey;
    if (appProject?.id === projectId) {
      setScopeProjectName(appProject.name ?? null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (appProject?.id === projectId) {
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const res = await window.electron?.db?.projects?.getById(projectId);
        if (!cancelled && res?.success && res.data?.name) setScopeProjectName(res.data.name);
        else if (!cancelled) setScopeProjectName(null);
      } catch {
        if (!cancelled) setScopeProjectName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, appProject?.id, appProject?.name]);

  useEffect(() => {
    hubWorkspace?.reportAutomationsFormMode(formMode);
  }, [formMode, hubWorkspace]);

  useEffect(() => {
    return () => {
      hubWorkspace?.reportAutomationsFormMode('hidden');
    };
  }, [hubWorkspace]);

  const fetchListData = useCallback(async () => {
    const all = await listAutomations({ projectId });
    setAutomations(all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
  }, [projectId]);

  const { initialLoading: loading, reload: load } = useHubListLoader(
    fetchListData,
    [projectId],
    { eventName: AUTOMATIONS_CHANGED_EVENT },
  );

  useEffect(() => {
    if (!onRegisterSilentRefresh) return;
    onRegisterSilentRefresh(() => {
      void load({ silent: true });
    });
    return () => onRegisterSilentRefresh(null);
  }, [load, onRegisterSilentRefresh]);

  useEffect(() => {
    const unsub = onRunUpdated(({ run }) => {
      if (run.ownerType === 'many') return;
      setAutomations((prev) =>
        prev.map((a) => {
          if (run.automationId !== a.id) return a;
          return {
            ...a,
            lastRunAt: run.finishedAt ?? run.startedAt ?? run.updatedAt ?? a.lastRunAt,
            lastRunStatus: run.status,
          };
        }),
      );
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    let result = automations;
    if (filter.targetType !== 'all') result = result.filter((a) => a.targetType === filter.targetType);
    if (filter.targetId) result = result.filter((a) => a.targetId === filter.targetId);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
    }
    return result;
  }, [automations, filter, searchText]);

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

  const handleNew = () => {
    const defaultTarget = filter.targetType !== 'all'
      ? { targetType: filter.targetType as DraftState['targetType'], targetId: filter.targetId ?? '' }
      : { targetType: 'agent' as const, targetId: '' };
    setDraft({ ...EMPTY_DRAFT, ...defaultTarget });
    setFormMode('new');
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
                // Feeders run on minute-based cron-lite; force hour=0 to avoid the
                // "earliest hour" gate accidentally suppressing minute ticks.
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
        // Feeders don't use prompts, artifact bindings, or LLM output mode — their script
        // owns the data merge directly. Send minimal payload so the backend doesn't carry
        // dead fields and so re-edits stay clean.
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
          : (() => {
              const bindings: NonNullable<DraftState['artifactBindings']> = [];
              for (const b of draft.artifactBindings) {
                if (!b.artifactResourceId.trim()) continue;
                bindings.push({
                  id: b.id,
                  artifactResourceId: b.artifactResourceId.trim(),
                  slot: (b.slot || 'default').trim(),
                  updatePolicy: b.updatePolicy,
                  extractMode: b.extractMode,
                  enabled: b.enabled,
                });
              }
              return bindings;
            })(),
        outputMode: isFeederTarget ? 'chat_only' : draft.outputMode,
      });
      showToast('success', draft.id ? t('toast.automation_updated') : t('toast.automation_created'));
      setFormMode('hidden');
      await load({ silent: true });
    } catch {
      showToast('error', t('toast.automation_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    const automation = automations.find((a) => a.id === id);
    const isFeederTarget = automation?.targetType === 'feeder';
    try {
      // Feeders execute through feeder-runner (not the the agent runtime/workflow PersistentRun
      // pipeline), so the return shape and the "open run detail" UX differ.
      if (isFeederTarget) {
        await runAutomationNowRaw(id);
        setAutomations((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, lastRunAt: Date.now(), lastRunStatus: 'completed' } : a,
          ),
        );
        showToast('success', t('toast.automation_started'));
      } else {
        const run = await runAutomationNow(id);
        setAutomations((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  lastRunAt: run.startedAt ?? run.updatedAt ?? Date.now(),
                  lastRunStatus: run.status,
                }
              : a,
          ),
        );
        showToast('success', t('toast.automation_started_view_run'));
        try {
          sessionStorage.setItem(PENDING_RUN_ID_KEY, run.id);
        } catch {
          /* ignore */
        }
        useTabStore.getState().openRunsTab();
      }
    } catch {
      showToast('error', t('toast.automation_run_error'));
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAutomation(id);
    showToast('success', t('toast.automation_deleted'));
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  };

  const handleExportAutomation = async (a: AutomationDefinition) => {
    const built = await exportAutomationBundle(a.id);
    if (!built.success) {
      showToast('error', built.error ?? t('hubExport.error_export'));
      return;
    }
    const name = `dome-automation-${slugExportFilenamePart(a.title)}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadHubBundle(name, built.bundle);
    showToast('success', t('hubExport.export_done'));
  };

  const handlePickAutomationImport = () => automationImportInputRef.current?.click();

  const handleAutomationImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingAutomationBundle(true);
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
      window.dispatchEvent(new CustomEvent('dome:agents-changed'));
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
      window.dispatchEvent(new CustomEvent(AUTOMATIONS_CHANGED_EVENT));
      await load({ silent: true });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('hubExport.error_import'));
    } finally {
      setImportingAutomationBundle(false);
    }
  };

  // Target name resolvers
  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);
  const workflowName = useCallback((id: string) => workflows.find((w) => w.id === id)?.name ?? id, [workflows]);
  const feederName = useCallback((id: string) => feeders.find((f) => f.id === id)?.name ?? id, [feeders]);
  const targetName = (a: AutomationDefinition) => {
    if (a.targetType === 'agent') return agentName(a.targetId);
    if (a.targetType === 'workflow') return workflowName(a.targetId);
    if (a.targetType === 'feeder') return feederName(a.targetId);
    return a.targetId;
  };

  // Full-screen create / edit — replaces the list entirely
  if (formMode === 'new' || formMode === 'edit') {
    const isNew = formMode === 'new';
    return (
      <DomeDrawerLayout
        className="bg-[var(--dome-bg)] h-full min-h-0"
        header={
          <DomeSubpageHeader
            title={isNew ? t('automation.new_page_title') : t('automation.edit_page_title')}
            subtitle={isNew ? t('automation.new_page_subtitle') : t('automation.edit_page_subtitle')}
            onBack={() => setFormMode('hidden')}
            backLabel={t('common.back')}
            className="border-[var(--dome-border)] bg-[var(--dome-bg)]"
          />
        }
        footer={
          <DomeSubpageFooter
            className="px-6 border-[var(--dome-border)] bg-[var(--dome-bg)]"
            trailing={
              <>
                <DomeButton type="button" variant="secondary" size="sm" onClick={() => setFormMode('hidden')}>
                  {t('automation.cancel')}
                </DomeButton>
                <DomeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={saving}
                  disabled={saving || !draft.title.trim() || !draft.targetId}
                  onClick={() => void handleSave()}
                >
                  {isNew ? t('automation.create_footer') : t('automation.save_changes')}
                </DomeButton>
              </>
            }
          />
        }
      >
        <div className="max-w-2xl mx-auto p-6">
          <AutomationEditDrawer
            draft={draft}
            agents={agents}
            workflows={workflows}
            feeders={feeders}
            hubArtifacts={hubArtifacts}
            isNew={isNew}
            saving={saving}
            onDraftChange={(partial) => setDraft((prev) => ({ ...prev, ...partial }))}
            onSave={() => void handleSave()}
            onCancel={() => setFormMode('hidden')}
            embedded
          />
        </div>
      </DomeDrawerLayout>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* List pane */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <input
          ref={automationImportInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label={t('automationHub.import_automation_json', 'Import automation JSON file')}
          onChange={(ev) => void handleAutomationImportFile(ev)}
        />
        <HubToolbar
          dense
          leading={
            editorialHub ? undefined : (
            <HubTitleBlock
              icon={Zap}
              title={t('automationHub.tab_automations')}
              subtitle={(() => {
                const scopeSuffix = t('automation.project_scope_suffix', { name: scopeProjectName ?? projectId });
                if (loading) return t('automation.loading_list') + scopeSuffix;
                const visibleCount = filtered.length;
                const base =
                  visibleCount === 0
                    ? t('automation.no_automations')
                    : visibleCount === 1
                      ? t('automationHub.automations_list_one', { count: visibleCount })
                      : t('automationHub.automations_list_other', { count: visibleCount });
                return base + scopeSuffix;
              })()}
            />
            )
          }
          center={
            <HubSearchField
              value={searchText}
              onChange={setSearchText}
              placeholder={t('automation.search_automations')}
            />
          }
          trailing={
            <>
              <DomeButton
                type="button"
                variant="outline"
                size="xs"
                disabled={importingAutomationBundle}
                onClick={() => handlePickAutomationImport()}
                className="shrink-0 border-[var(--dome-border)] text-[var(--dome-text)]"
                leftIcon={<Upload className="size-3" aria-hidden />}
              >
                {t('hubExport.import_automation')}
              </DomeButton>
              <DomeFilterChipGroup
                dense
                options={[
                  { value: 'all' as const, label: t('automation.filter_target_all'), selectedColor: 'var(--dome-accent)' },
                  { value: 'agent' as const, label: t('automation.filter_target_agent'), selectedColor: 'var(--dome-accent)' },
                  { value: 'workflow' as const, label: t('automation.filter_target_workflow'), selectedColor: 'var(--dome-accent)' },
                  { value: 'feeder' as const, label: t('automation.filter_target_feeder'), selectedColor: 'var(--dome-accent)' },
                ]}
                value={filter.targetType}
                onChange={(targetKind) => setFilter((f) => ({ ...f, targetType: targetKind, targetId: undefined }))}
              />
              <DomeButton
                type="button"
                variant="primary"
                size="xs"
                data-ui-target="automations-hub-new"
                onClick={handleNew}
                className="shrink-0 !bg-[var(--dome-accent)] hover:!brightness-110"
                leftIcon={<Plus className="size-3" aria-hidden />}
              >
                {t('automation.button_new')}
              </DomeButton>
            </>
          }
        />

        {/* Active filter label */}
        {filter.targetId && (
          <DomeActiveFilterBanner
            label={
              <>
                {t('automation.filter_by')} <b>{filter.targetLabel}</b>
              </>
            }
            clearLabel={t('automation.clear_filter')}
            onClear={() => setFilter({ targetType: 'all' })}
            className="px-5"
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="p-4">
              <DomeSkeletonGrid count={8} />
            </div>
          ) : filtered.length === 0 ? (
            <HubListState
              variant="empty"
              compact
              icon={<Zap className="size-7" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} />}
              title={
                automations.length > 0 && searchText.trim()
                  ? t('automation.search_no_results')
                  : t('automation.no_automations')
              }
              description={
                automations.length > 0 && searchText.trim()
                  ? undefined
                  : t('automation.empty_list_hint')
              }
              action={
                <DomeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  data-ui-target="automations-empty-create"
                  onClick={handleNew}
                  className="mt-1 !bg-[var(--dome-accent)]"
                  leftIcon={<Plus className="size-3.5" aria-hidden />}
                >
                  {t('automation.empty_create_cta')}
                </DomeButton>
              }
            />
          ) : (
            <div className={editorialHub ? 'px-0' : 'p-4'}>
              <ul className={`${hubListClass} list-none m-0 p-0`}>
                {filtered.map((a) => {
                  const desc = (a.description || '').trim();
                  const targetLine = `${targetName(a)} · ${triggerLabel(a.triggerType)}`;
                  return (
                    <li key={a.id} className="list-none">
                    <HubBentoCard
                      variant={hubCardVariant}
                      onClick={() => handleEdit(a)}
                      icon={
                        <HubEntityIcon kind={automationTargetIconKind(a)} size="md" />
                      }
                      title={
                        <div className="flex w-full min-w-0 items-start gap-2 flex-wrap">
                          <span
                            className={cn(
                              'min-w-0 flex-1 break-words',
                              !editorialHub && 'text-sm font-semibold',
                            )}
                            style={editorialHub ? undefined : { color: 'var(--dome-text)' }}
                            title={a.title}
                          >
                            {a.title}
                          </span>
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md max-w-[min(100%,200px)] break-words"
                            title={t('automation.project_scope_tooltip')}
                            style={{
                              background: 'var(--dome-bg-hover)',
                              color: 'var(--dome-text-muted)',
                              border: '1px solid var(--dome-border)',
                            }}
                          >
                            {t('automation.project_row_badge', { name: scopeProjectName ?? a.projectId ?? projectId })}
                          </span>
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                            style={{
                              background: a.enabled ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)' : 'var(--dome-bg-hover)',
                              color: a.enabled ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                              border: '1px solid var(--dome-border)',
                            }}
                          >
                            {a.enabled ? t('automation.state_enabled') : t('automation.state_disabled')}
                          </span>
                        </div>
                      }
                      subtitle={
                        desc ? (
                          <span className="break-words" title={desc}>
                            {desc}
                          </span>
                        ) : (
                          <span className="text-[11px] break-words">{targetLine}</span>
                        )
                      }
                      meta={
                        <div
                          className="mt-1 flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]"
                          style={{ color: 'var(--dome-text-muted)' }}
                        >
                          {desc ? <span className="min-w-0 max-w-full break-words">{targetLine}</span> : null}
                          <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1 gap-y-1">
                            {desc ? <span aria-hidden>·</span> : null}
                            <Clock className="size-3 shrink-0" aria-hidden />
                            <span className="min-w-0 break-words">
                              {t('automation.last_run')} {formatHubDate(a.lastRunAt, t('automation.never'))}
                            </span>
                            {a.lastRunStatus ? (
                              <>
                                <span aria-hidden className="mx-0.5">
                                  ·
                                </span>
                                <DomeStatusBadge status={a.lastRunStatus} />
                              </>
                            ) : null}
                          </span>
                        </div>
                      }
                      trailing={
                        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1">
                          <DomeButton
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            title={t('hubExport.title_export_automation')}
                            aria-label={t('hubExport.title_export_automation')}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleExportAutomation(a);
                            }}
                          >
                            <Download className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                          </DomeButton>
                          <DomeButton
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            title={t('automation.title_edit')}
                            aria-label={t('automation.title_edit')}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(a);
                            }}
                          >
                            <Pencil className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                          </DomeButton>
                          <DomeButton
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            title={t('automation.title_run_now')}
                            aria-label={t('automation.title_run_now')}
                            disabled={runningId === a.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRun(a.id);
                            }}
                          >
                            {runningId === a.id ? (
                              <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                            ) : (
                              <Play className="size-3.5" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                            )}
                          </DomeButton>
                          <DomeButton
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            title={t('automation.title_delete')}
                            aria-label={t('automation.title_delete')}
                            className="!text-[var(--error)] hover:!bg-[var(--error-bg)]"
                            onClick={() => void handleDelete(a.id)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </DomeButton>
                        </div>
                      }
                    />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default AutomationsTab;
