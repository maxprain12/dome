import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  ArrowDown01Icon,
  Add01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PauseIcon,
  PlayCircleIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { request, delegateToMany, type CloudMany, type ManyCloudRuntime, type ManyDetail } from '@/lib/manys/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store/useAppStore';
import type { Resource } from '@/types';
import { useTabStore } from '@/lib/store/useTabStore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import CloudManyChat from './CloudManyChat';
import type { CredentialInput } from './ManyCredentialForm';
import ManyInspector, { type InspectorTab } from './ManyInspector';
import ManyRoster, { pendingCount } from './ManyRoster';
import ManyMark, { manyMarkVariant } from './ManyMark';
import ManysOverview, { type ManyTemplate } from './ManysOverview';
import { stepDetail, stepKey, useManySteps } from '@/lib/manys/steps';
import { useLiveRuns, useManyEvents } from '@/lib/manys/liveRuns';
import { retryTask, setManyPaused, STATUS_DOT, statusLabelKey, summarizeMany } from './manyStatus';

const SUGGESTIONS = ['suggestion1', 'suggestion2', 'suggestion3'] as const;

export default function ManysView() {
  const { t } = useTranslation();
  const [manys, setManys] = useState<CloudMany[]>([]);
  const [selected, setSelected] = useState('');
  const [details, setDetails] = useState<Record<string, ManyDetail>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CloudMany | null>(null);
  const [template, setTemplate] = useState<ManyTemplate | null>(null);
  const [draft, setDraft] = useState('');
  const [inspector, setInspectorState] = useState<InspectorTab | null>(() => (localStorage.getItem('manys:panel') === 'closed' ? null : 'details'));
  const currentSelected = useRef(selected);
  const pendingCreate = useRef<CloudMany | null>(null);
  currentSelected.current = selected;
  const setInspector = (value: InspectorTab | null | ((current: InspectorTab | null) => InspectorTab | null)) => {
    setInspectorState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      localStorage.setItem('manys:panel', next ? 'open' : 'closed');
      return next;
    });
  };

  const refresh = useCallback(async (everyMany = true) => {
    try {
      const result = await request<{ manys: CloudMany[] }>('');
      setManys(result.manys);
      setLoaded(true);
      // The list is one cheap query. Each detail is nine, so only the open Many is read on every
      // tick and the rest of the team every few ticks.
      const wanted = everyMany
        ? result.manys.slice(0, 24)
        : result.manys.filter((many) => many.id === currentSelected.current);
      const fetched: Record<string, ManyDetail> = {};
      await Promise.all(wanted.map(async (many) => {
        try {
          fetched[many.id] = await request<ManyDetail>(`/${many.id}`);
        } catch {
          /* one unreachable Many must not blank the roster or the team view */
        }
      }));
      setDetails((current) => {
        const kept: Record<string, ManyDetail> = {};
        for (const many of result.manys) {
          const detail = fetched[many.id] ?? current[many.id];
          if (detail) kept[many.id] = detail;
        }
        return kept;
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      void refresh(tick % 4 === 0);
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh, selected]);

  // The feed says when something changed, so the view follows it instead of waiting for the next poll.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useManyEvents((event) => {
    if (event.kind === 'run_text' || event.kind === 'task_step') return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { void refresh(event.many_id !== currentSelected.current); }, 300);
  });
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);
  const runs = useLiveRuns((state) => state.runs);

  useEffect(() => {
    setDraft(localStorage.getItem(`manys:draft:${selected}`) ?? '');
  }, [selected]);

  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      await refresh(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const perform = async (fn: () => Promise<unknown>): Promise<void> => {
    await run(fn);
  };

  const openResource = (id: string) => perform(async () => {
    const sync = await window.electron.domainSync.syncNow({ domain: 'library' });
    if (!sync.success) throw new Error('service_unavailable');
    const loadedResource = await window.electron.db.resources.getById(id) as { success: boolean; data?: Resource };
    if (!loadedResource.success || !loadedResource.data) throw new Error('resource_not_found');
    const resource = loadedResource.data;
    useAppStore.getState().addResource(resource);
    useTabStore.getState().openResourceTab(resource.id, resource.type, resource.title);
  });

  const send = () => perform(async () => {
    // One composer: when the agent asked something the message is the answer, otherwise it is a new turn.
    if (pendingQuestion) await request(`/${selected}/tasks/${pendingQuestion.id}`, 'PATCH', { action: 'answer', answer: draft.trim() });
    else await delegateToMany(selected, draft);
    localStorage.removeItem(`manys:draft:${selected}`);
    setDraft('');
  });

  const saveAccess = (input: CredentialInput) => perform(async () => {
    if (!pendingQuestion) return;
    // The secret goes to the vault and nowhere else; the agent is only told that the access exists.
    await request(`/${selected}/credentials`, 'POST', {
      scope: input.everyMany ? 'all' : 'many', label: input.label, username: input.username || undefined, secret: input.secret, hosts: input.hosts,
    });
    await request(`/${selected}/tasks/${pendingQuestion.id}`, 'PATCH', { action: 'answer', answer: t('manys.access.request.answer', { name: input.label }) });
  });

  const declineAccess = () => perform(async () => {
    if (pendingQuestion) await request(`/${selected}/tasks/${pendingQuestion.id}`, 'PATCH', { action: 'answer', answer: t('manys.access.request.declined') });
  });

  const cancelTasks = (tasks: { id: string }[]) => perform(async () => {
    await Promise.all(tasks.map((task) => request(`/${selected}/tasks/${task.id}`, 'PATCH', { action: 'cancel' })));
  });

  const detail = selected ? (details[selected] ?? null) : null;
  const summary = detail ? summarizeMany(detail) : null;
  const status = summary?.status ?? 'idle';
  const paused = detail?.many.grants.paused === true;
  const decisions = summary?.decisions ?? [];
  const questions = summary?.questions ?? [];
  const pendingQuestion = questions[0] ?? null;
  const lastFailed = summary?.lastFailed ?? null;
  const inFlight = detail?.tasks.filter((task) => task !== lastFailed && (task.state === 'running' || task.state === 'queued')) ?? [];
  const steps = useManySteps(selected, inFlight.map((task) => task.id));
  const currentStep = [...steps].reverse().find((step) => !step.done);
  const controlNow = detail?.computer?.control;
  useEffect(() => {
    if (controlNow === 'human') setInspector('computer');
  }, [controlNow]);

  const createMany = (input: { name: string; runtime: ManyCloudRuntime }) => run(async () => {
    const existing = pendingCreate.current;
    const many = existing ?? await request<CloudMany>('', 'POST', input);
    if (!existing) pendingCreate.current = many;
    if (template) {
      await request(`/${many.id}`, 'PATCH', {
        name: input.name,
        instructions: t(`manys.templates.${template}.instructions`),
        grants: many.grants,
      });
    }
    pendingCreate.current = null;
    setTemplate(null);
    setSelected(many.id);
  });
  const deleteMany = async () => {
    if (!toDelete) return;
    const target = toDelete;
    const deleted = await run(() => request(`/${target.id}`, 'DELETE'));
    if (!deleted) return;
    localStorage.removeItem(`manys:draft:${target.id}`);
    if (currentSelected.current === target.id) setSelected('');
    setToDelete(null);
  };
  const chooseTemplate = (value: ManyTemplate) => {
    setTemplate(value);
    setNewOpen(true);
  };
  const changeNewOpen = (open: boolean) => {
    setNewOpen(open);
    if (!open) {
      if (pendingCreate.current) {
        setSelected(pendingCreate.current.id);
        pendingCreate.current = null;
      }
      setTemplate(null);
    }
  };
  const changeDraft = (value: string) => {
    setDraft(value);
    localStorage.setItem(`manys:draft:${selected}`, value);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background md:flex-row">
      <ManyRoster
        manys={manys}
        details={details}
        loaded={loaded}
        selected={selected}
        busy={busy}
        newOpen={newOpen}
        presetName={template ? t(`manys.templates.${template}.name`) : ''}
        onNewOpenChange={changeNewOpen}
        onSelect={setSelected}
        onDelete={setToDelete}
        onCreate={createMany}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        {error && (
          <div className="dome-card dome-card-err mx-5 mt-3 flex items-center gap-2 px-3 py-2 text-sm">
            <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0 text-destructive" aria-hidden />
            <span className="min-w-0 grow">
              {t(`manys.errors.${error}`, { defaultValue: t('manys.errors.request_failed') })}
              {draft.trim() ? ` ${t('manys.errors.draft_saved')}` : ''}
            </span>
            <Button size="sm" variant="outline" onClick={() => { void refresh(true); }}>{t('manys.retry')}</Button>
          </div>
        )}
        {!selected && !loaded && (
          <div className="flex flex-col gap-3 px-8 py-8">
            <Skeleton className="h-10 w-1/3 rounded-xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        )}
        {!selected && loaded && (
          <div className="min-h-0 flex-1 overflow-auto">
            <ManysOverview
              manys={manys}
              details={details}
              busy={busy}
              onOpen={setSelected}
              onNew={() => setNewOpen(true)}
              onDelete={setToDelete}
              onTemplate={chooseTemplate}
              perform={perform}
            />
          </div>
        )}
        {selected && !detail && !error && (
          <div className="flex flex-1 flex-col justify-end gap-3 px-5 pb-4">
            <Skeleton className="h-16 w-2/3 rounded-[20px]" />
            <Skeleton className="ml-auto h-12 w-1/2 rounded-[20px]" />
          </div>
        )}
        {detail && (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex items-center gap-3 border-b border-border px-5 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="ghost" className="h-11 min-w-0 gap-2.5 pr-2.5 pl-1.5" />}>
                    <ManyMark variant={manyMarkVariant(detail.many.id)} />
                    <span className="flex min-w-0 flex-col items-start leading-[1.3]">
                      <span className="max-w-full truncate text-sm font-semibold">{detail.many.name}</span>
                      <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                        <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', STATUS_DOT[status])} />
                        {t(statusLabelKey(status))}
                      </span>
                    </span>
                    <HugeiconsIcon icon={ArrowDown01Icon} className="text-muted-foreground" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-80">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t('manys.switchMany')}</DropdownMenuLabel>
                      {manys.map((item) => {
                        const itemSummary = details[item.id] ? summarizeMany(details[item.id]) : null;
                        const itemStatus = itemSummary?.status ?? 'idle';
                        const pending = itemSummary ? pendingCount(itemSummary) : 0;
                        return (
                          <DropdownMenuItem key={item.id} className="h-auto gap-2.5 py-1.5" onClick={() => setSelected(item.id)}>
                            <ManyMark variant={manyMarkVariant(item.id)} className="size-6" />
                            <span className="flex min-w-0 grow flex-col">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              <span className="truncate text-xs text-muted-foreground">{t(statusLabelKey(itemStatus))}</span>
                            </span>
                            {pending > 0
                              ? <Badge variant="warn">{pending}</Badge>
                              : <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', STATUS_DOT[itemStatus])} />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setSelected(''); setTemplate(null); setNewOpen(true); }}>
                      <HugeiconsIcon icon={Add01Icon} aria-hidden />
                      {t('manys.newMany')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="grow" />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-pressed={inspector !== null}
                  aria-label={t('manys.panel')}
                  title={t('manys.panel')}
                  onClick={() => setInspector((current) => (current ? null : 'details'))}
                >
                  <HugeiconsIcon icon={PanelRightIcon} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" size="icon" variant="ghost" aria-label={t('manys.more')} title={t('manys.more')} />}>
                    <HugeiconsIcon icon={MoreHorizontalIcon} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem onClick={() => { void perform(() => setManyPaused(detail.many, !paused)); }}>
                      <HugeiconsIcon icon={paused ? PlayCircleIcon : PauseIcon} aria-hidden />
                      {t(paused ? 'manys.pause.resume' : 'manys.pause.pause')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setToDelete(detail.many)}>
                      <HugeiconsIcon icon={Delete02Icon} aria-hidden />
                      {t('manys.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </header>

              <CloudManyChat
                detail={detail}
                runs={runs}
                inFlight={inFlight}
                question={pendingQuestion}
                failed={lastFailed}
                decisions={decisions}
                busy={busy}
                perform={perform}
                draft={draft}
                onDraft={changeDraft}
                onSend={() => { void send(); }}
                onStop={() => { void cancelTasks(inFlight); }}
                onSkipQuestion={() => { if (pendingQuestion) void cancelTasks([pendingQuestion]); }}
                onSaveAccess={saveAccess}
                onDeclineAccess={() => { void declineAccess(); }}
                onRetry={() => { if (lastFailed) void perform(() => retryTask(selected, lastFailed)); }}
                paused={paused}
                onResume={() => { void perform(() => setManyPaused(detail.many, false)); }}
                suggestions={SUGGESTIONS.map((key) => t(`manys.${key}`))}
                doing={currentStep ? t(`manys.steps.${stepKey(currentStep.tool)}`, { detail: stepDetail(currentStep) }) : ''}
                onOpenResource={(id) => { void openResource(id); }}
              />
            </div>
            {inspector && (
              <ManyInspector tab={inspector} onTab={setInspector} detail={detail} status={status} busy={busy} perform={perform} />
            )}
          </div>
        )}
      </main>
      <ConfirmDialog
        isOpen={toDelete !== null}
        variant="danger"
        busy={busy}
        title={t('manys.deleteTitle', { name: toDelete?.name ?? '' })}
        message={t('manys.deleteBody')}
        confirmLabel={t('manys.delete')}
        onConfirm={() => { void deleteMany(); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
