import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ComputerIcon,
  Delete02Icon,
  Folder01Icon,
  Maximize02Icon,
  Minimize02Icon,
  MoreHorizontalIcon,
  PanelRightIcon,
  Refresh01Icon,
  FileSearchIcon,
  RepeatIcon,
  SentIcon,
  Shield01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { MessageScroller, MessageScrollerProvider, MessageScrollerViewport, MessageScrollerContent } from '@/components/ui/message-scroller';
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
import { useManyStore } from '@/lib/store/useManyStore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import ManyReview from './ManyReview';
import ManyInspector, { type InspectorTab } from './ManyInspector';
import ManyRoster, { pendingCount } from './ManyRoster';
import ManyMark, { manyMarkVariant } from './ManyMark';
import ManysOverview, { type ManyTemplate } from './ManysOverview';
import { retryTask, STATUS_DOT, statusLabelKey, summarizeMany } from './manyStatus';

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
  const [inspector, setInspector] = useState<InspectorTab | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focus, setFocusState] = useState(() => localStorage.getItem('manys:focus') === '1');
  const currentSelected = useRef(selected);
  const pendingCreate = useRef<CloudMany | null>(null);
  currentSelected.current = selected;
  const setFocus = (value: boolean) => {
    setFocusState(value);
    localStorage.setItem('manys:focus', value ? '1' : '0');
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

  useEffect(() => {
    setDraft(localStorage.getItem(`manys:draft:${selected}`) ?? '');
    setDetailsOpen(false);
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

  const cancelTasks = (tasks: { id: string }[]) => perform(async () => {
    await Promise.all(tasks.map((task) => request(`/${selected}/tasks/${task.id}`, 'PATCH', { action: 'cancel' })));
  });

  const detail = selected ? (details[selected] ?? null) : null;
  const selectedVariant = detail ? manyMarkVariant(detail.many.id) : 'lime';
  const summary = detail ? summarizeMany(detail) : null;
  const status = summary?.status ?? 'idle';
  const decisions = summary?.decisions ?? [];
  const conflicts = summary?.conflicts ?? [];
  const questions = summary?.questions ?? [];
  const pendingQuestion = questions[0] ?? null;
  const lastFailed = summary?.lastFailed ?? null;
  const inFlight = detail?.tasks.filter((task) => task !== lastFailed && (task.state === 'running' || task.state === 'queued')) ?? [];
  const working = inFlight.length > 0;
  const spokenResults = detail?.tasks.filter((task) => {
    const text = task.result?.text;
    return !!text && !detail.messages.some((message) => message.content === text);
  }) ?? [];
  const chatOnly = focus && !!selected;
  const controlNow = detail?.computer?.control;
  const lastComputerUse = detail?.computer?.last_activity ? Date.parse(detail.computer.last_activity) : 0;
  const computerActive = Date.now() - lastComputerUse < 120000;
  useEffect(() => {
    if (controlNow === 'human') setInspector((current) => current ?? 'computer');
  }, [controlNow]);

  const openInspector = (tab: InspectorTab) => {
    setFocus(false);
    setInspector(tab);
  };

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
    if (currentSelected.current === target.id) {
      setInspector(null);
      setSelected('');
    }
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
  const fillSuggestion = (text: string) => {
    setDraft(text);
    localStorage.setItem(`manys:draft:${selected}`, text);
  };

  const showSuggestions = !!detail && detail.messages.length < 3 && !working && !pendingQuestion && !draft && !lastFailed;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background md:flex-row">
      {!chatOnly && (
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
          onOpenLocal={() => useManyStore.getState().setOpen(true)}
          onDelete={setToDelete}
          onCreate={createMany}
        />
      )}
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
              onOpenLocal={() => useManyStore.getState().setOpen(true)}
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
                {chatOnly ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" variant="ghost" className="h-11 gap-2.5 pr-2.5 pl-1.5" />}>
                      <ManyMark variant={selectedVariant} />
                      <span className="flex flex-col items-start leading-[1.3]">
                        <span className="text-sm font-semibold">{detail.many.name}</span>
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
                      <DropdownMenuItem onClick={() => { setFocus(false); setSelected(''); setTemplate(null); setNewOpen(true); }}>
                        <HugeiconsIcon icon={Add01Icon} aria-hidden />
                        {t('manys.newMany')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <>
                    <ManyMark variant={selectedVariant} className="size-10" />
                    <div className="flex min-w-0 grow flex-col">
                      <h2 className="truncate text-base font-semibold tracking-tight">{detail.many.name}</h2>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', STATUS_DOT[status])} />
                        {t(statusLabelKey(status))}
                       
                      </p>
                    </div>
                  </>
                )}
                {chatOnly && <span className="grow" />}
                {chatOnly ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setFocus(false)}>
                    <HugeiconsIcon icon={Minimize02Icon} aria-hidden />
                    {t('manys.exitChatOnly')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-pressed={inspector !== null}
                    aria-label={t('manys.panel')}
                    title={t('manys.panel')}
                    onClick={() => setInspector((current) => (current ? null : 'context'))}
                  >
                    <HugeiconsIcon icon={PanelRightIcon} />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" size="icon" variant="ghost" aria-label={t('manys.more')} title={t('manys.more')} />}>
                    <HugeiconsIcon icon={MoreHorizontalIcon} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem onClick={() => openInspector('computer')}>
                      <HugeiconsIcon icon={ComputerIcon} aria-hidden />
                      {t('manys.computer')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openInspector('context')}>
                      <HugeiconsIcon icon={Shield01Icon} aria-hidden />
                      {t('manys.context')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openInspector('routines')}>
                      <HugeiconsIcon icon={RepeatIcon} aria-hidden />
                      {t('manys.recurrences')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openInspector('governance')}>
                      <HugeiconsIcon icon={FileSearchIcon} aria-hidden />
                      {t('manys.governance.tab')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {!chatOnly && (
                      <DropdownMenuItem onClick={() => { setInspector(null); setFocus(true); }}>
                        <HugeiconsIcon icon={Maximize02Icon} aria-hidden />
                        {t('manys.chatOnly')}
                      </DropdownMenuItem>
                    )}
                    {chatOnly && (
                      <DropdownMenuItem onClick={() => useManyStore.getState().setOpen(true)}>
                        {t('manys.local')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setToDelete(detail.many)}>
                      <HugeiconsIcon icon={Delete02Icon} aria-hidden />
                      {t('manys.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </header>

              {!chatOnly && !inspector && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-5 py-2 text-xs">
                  <span className="text-muted-foreground">{t('manys.canDo')}</span>
                  <Button type="button" size="xs" variant="outline" className="h-6 bg-background" onClick={() => setInspector('context')}>
                    <HugeiconsIcon icon={Folder01Icon} aria-hidden />
                    {t('manys.capReads', { projects: detail.many.grants.projects.length, resources: detail.many.grants.resources.length })}
                  </Button>
                  <Button type="button" size="xs" variant="outline" className="h-6 bg-background" onClick={() => setInspector('context')}>
                    <HugeiconsIcon icon={Shield01Icon} aria-hidden />
                    {t('manys.capPermissions', { granted: detail.many.grants.capabilities.length, total: 8 })}
                  </Button>
                  <Button type="button" size="xs" variant="outline" className="h-6 bg-background" onClick={() => setInspector('routines')}>
                    <HugeiconsIcon icon={RepeatIcon} aria-hidden />
                    {t('manys.capRoutines', { count: detail.recurrences.length })}
                  </Button>
                  <span className="grow" />
                  <span className="hidden text-muted-foreground md:inline">{t('manys.worksClosed')}</span>
                </div>
              )}

              <MessageScrollerProvider>
                <MessageScroller className="min-h-0 flex-1">
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="mx-auto w-full max-w-[680px] gap-4 px-5 py-6">
                      {detail.messages.length === 0 && spokenResults.length === 0 && !lastFailed && (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
                          <ManyMark variant={selectedVariant} className="size-14" />
                          <p className="text-sm text-muted-foreground">{detail.many.name}</p>
                        </div>
                      )}
                      {detail.messages.map((message) => {
                        const isUser = message.role === 'user';
                        const task = detail.tasks.find((item) => item.id === message.task_id);
                        const queued = task?.state === 'queued';
                        const related = detail.messages.filter((item) => item.task_id === message.task_id);
                        const isLastForTask = related[related.length - 1]?.id === message.id;
                        const resources = isLastForTask ? (task?.result?.resources ?? []) : [];
                        return (
                          <Message key={message.id} align={isUser ? 'end' : 'start'} className="gap-2.5 text-sm/relaxed">
                            {!isUser && (
                              <MessageAvatar className="mt-0.5 size-6 min-w-6 self-start bg-transparent">
                                <ManyMark variant={selectedVariant} className="size-6 ring-0" />
                              </MessageAvatar>
                            )}
                            <MessageContent>
                              <Bubble variant={isUser ? 'default' : 'muted'} align={isUser ? 'end' : 'start'}>
                                <BubbleContent className="whitespace-pre-wrap">
                                  {message.content}
                                </BubbleContent>
                              </Bubble>
                              {queued && <Badge variant="outline" className="self-start">{t('manys.states.queued')}</Badge>}
                              {resources.map((id) => (
                                <Button key={id} variant="link" className="self-start" onClick={() => { void openResource(id); }}>{t('manys.openResource')}</Button>
                              ))}
                            </MessageContent>
                          </Message>
                        );
                      })}
                      {spokenResults.map((task) => (
                        <Message key={task.id} align="start" className="gap-2.5 text-sm/relaxed">
                          <MessageAvatar className="mt-0.5 size-6 min-w-6 self-start bg-transparent">
                            <ManyMark variant={selectedVariant} className="size-6 ring-0" />
                          </MessageAvatar>
                          <MessageContent>
                            <Bubble variant="muted" align="start">
                              <BubbleContent className="whitespace-pre-wrap">
                                {task.result?.text}
                              </BubbleContent>
                            </Bubble>
                            {!detail.messages.some((message) => message.task_id === task.id) && task.result?.resources?.map((id) => (
                              <Button key={id} variant="link" className="self-start" onClick={() => { void openResource(id); }}>{t('manys.openResource')}</Button>
                            ))}
                          </MessageContent>
                        </Message>
                      ))}
                      {lastFailed && (
                        <Message align="start" className="gap-2.5 text-sm/relaxed">
                          <MessageAvatar className="mt-0.5 size-6 min-w-6 self-start bg-transparent">
                            <ManyMark variant={selectedVariant} className="size-6 ring-0" />
                          </MessageAvatar>
                          <MessageContent>
                            <div className="dome-card dome-card-err px-4 py-3.5">
                              <div className="mb-1.5 flex items-center gap-2">
                                <HugeiconsIcon icon={Alert02Icon} className="size-[18px] shrink-0 text-destructive" aria-hidden />
                                <span className="text-sm font-semibold tracking-[-0.01em]">{t('manys.failedTitle')}</span>
                              </div>
                              <p className="mb-3 text-muted-foreground">{t(`manys.errors.${lastFailed.checkpoint?.reason ?? ''}`, { defaultValue: t('manys.failedBody') })}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" disabled={busy} onClick={() => { void perform(() => retryTask(selected, lastFailed)); }}>
                                  <HugeiconsIcon icon={Refresh01Icon} aria-hidden />
                                  {t('manys.retry')}
                                </Button>
                                <span className="grow" />
                                <Button type="button" size="sm" variant="ghost" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((value) => !value)}>
                                  {t('manys.technicalDetails')}
                                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn(detailsOpen && 'rotate-180')} aria-hidden />
                                </Button>
                              </div>
                              {detailsOpen && (
                                <pre className="dome-term mt-3 overflow-auto whitespace-pre-wrap">
                                  {lastFailed.checkpoint?.reason ?? lastFailed.result?.text ?? lastFailed.id}
                                </pre>
                              )}
                            </div>
                          </MessageContent>
                        </Message>
                      )}
                      {questions.map((task) => (
                        <Message key={task.id} align="start" className="gap-2.5 text-sm/relaxed">
                          <MessageAvatar className="mt-0.5 size-6 min-w-6 self-start bg-transparent">
                            <ManyMark variant={selectedVariant} className="size-6 ring-0" />
                          </MessageAvatar>
                          <MessageContent>
                            <Bubble variant="muted" align="start">
                              <BubbleContent className="whitespace-pre-wrap">{task.question}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      ))}
                      {(decisions.length > 0 || conflicts.length > 0) && (
                        <div className="sm:ml-[34px]">
                          <ManyReview detail={{ ...detail, actions: decisions }} busy={busy} perform={perform} />
                        </div>
                      )}
                      {working && (
                        <Message align="start" className="gap-2.5 text-sm/relaxed" role="status" aria-live="polite">
                          <MessageAvatar className="mt-0.5 size-6 min-w-6 self-start bg-transparent">
                            <ManyMark variant={selectedVariant} className="size-6 ring-0" />
                          </MessageAvatar>
                          <MessageContent>
                            <Bubble variant="muted" align="start">
                              <BubbleContent className="flex items-center gap-2 text-muted-foreground">
                                <span aria-hidden="true" className="size-[7px] shrink-0 animate-pulse rounded-full bg-success" />
                                {t('manys.working')}
                              </BubbleContent>
                            </Bubble>
                            <Button type="button" variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => { void cancelTasks(inFlight); }}>
                              {t('manys.stopReply')}
                            </Button>
                          </MessageContent>
                        </Message>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                </MessageScroller>
              </MessageScrollerProvider>

              <footer className="px-5 pb-4">
                <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2.5">
                  {showSuggestions && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('manys.tryWith')}</span>
                      {SUGGESTIONS.map((key) => (
                        <Button key={key} type="button" size="sm" variant="outline" onClick={() => fillSuggestion(t(`manys.${key}`))}>
                          {t(`manys.${key}`)}
                        </Button>
                      ))}
                    </div>
                  )}
                  {detail.computer && !chatOnly && !inspector && (
                    <div className="dome-card flex items-center gap-3 px-2.5 py-2">
                      <div aria-hidden="true" className="aspect-[1280/800] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-muted ring-1 ring-border">
                        <div className="h-[14%] bg-foreground/10" />
                      </div>
                      <div className="flex min-w-0 grow flex-col">
                        <span className="text-sm font-semibold tracking-[-0.01em]">
                          {detail.computer.control === 'human' ? t('manys.youControl') : t('manys.computerIdle')}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{t('manys.computerHint')}</span>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => setInspector('computer')}>
                        {t('manys.viewComputer')}
                      </Button>
                    </div>
                  )}
                  <form
                    className="dome-glass-strong dome-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void send();
                    }}
                  >
                    <Field className="min-w-0 flex-1">
                      <FieldLabel htmlFor="many-message" className="sr-only">{t('manys.message')}</FieldLabel>
                      <Textarea
                        id="many-message"
                        value={draft}
                        maxLength={50000}
                        rows={1}
                        placeholder={pendingQuestion ? t('manys.answerPlaceholder') : t('manys.message')}
                        className="max-h-36 min-h-8 border-0 bg-transparent px-0 py-1.5 text-sm shadow-none hover:bg-transparent focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0 md:text-sm"
                        onChange={(event) => {
                          setDraft(event.target.value);
                          localStorage.setItem(`manys:draft:${selected}`, event.target.value);
                        }}
                      />
                    </Field>
                    <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label={t('manys.send')} title={t('manys.send')}>
                      <HugeiconsIcon icon={SentIcon} />
                    </Button>
                  </form>
                  {pendingQuestion && (
                    <Button type="button" variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => { void cancelTasks([pendingQuestion]); }}>
                      {t('manys.skipQuestion')}
                    </Button>
                  )}
                </div>
              </footer>
            </div>
            {inspector && !chatOnly && (
              <ManyInspector tab={inspector} onTab={setInspector} detail={detail} busy={busy} live={status === 'running' && computerActive} perform={perform} />
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
