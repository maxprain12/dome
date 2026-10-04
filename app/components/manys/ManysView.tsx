import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { MessageScroller, MessageScrollerProvider, MessageScrollerViewport, MessageScrollerContent } from '@/components/ui/message-scroller';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { request, delegateToMany, type CloudMany, type ManyDetail } from '@/lib/manys/api';
import { useAppStore } from '@/lib/store/useAppStore';
import type { Resource } from '@/types';
import { useTabStore } from '@/lib/store/useTabStore';
import { useManyStore } from '@/lib/store/useManyStore';
import ManySettings from './ManySettings';
import ManyComputer from './ManyComputer';
import ManyReview from './ManyReview';
import ManyMark, { manyMarkVariant } from './ManyMark';
import ManyCreateForm from './ManyCreateForm';

export default function ManysView() {
  const { t } = useTranslation();
  const [manys, setManys] = useState<CloudMany[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<ManyDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const currentSelected = useRef(selected);
  currentSelected.current = selected;
  const [draft, setDraft] = useState('');
  const [computerOpen, setComputerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await request<{ manys: CloudMany[] }>('');
      setManys(result.manys);
      setLoaded(true);
      if (selected) {
        const value = await request<ManyDetail>(`/${selected}`);
        if (currentSelected.current === selected) setDetail(value);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
      setLoaded(true);
    }
  }, [selected]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    setDetail(null);
    setContextOpen(false);
    setDraft(localStorage.getItem(`manys:draft:${selected}`) ?? '');
  }, [selected]);

  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      await refresh();
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
    await delegateToMany(selected, draft);
    localStorage.removeItem(`manys:draft:${selected}`);
    setDraft('');
  });

  const patchTask = (taskId: string, body: Record<string, unknown>) => {
    void perform(() => request(`/${selected}/tasks/${taskId}`, 'PATCH', body));
  };

  const selectedVariant = detail ? manyMarkVariant(detail.many.id) : 'lime';
  const decisions = detail?.actions.filter((action) => action.state === 'pending' || action.state === 'outcome_unknown') ?? [];
  const conflicts = detail?.conflicts ?? [];
  const composerTasks = detail?.tasks.filter((task) => (
    task.state === 'running' || task.state === 'paused' || task.state === 'waiting_approval'
  )) ?? [];
  const questions = detail?.tasks.filter((task) => task.question) ?? [];
  const spokenResults = detail?.tasks.filter((task) => {
    const text = task.result?.text;
    return !!text && !detail.messages.some((message) => message.content === text);
  }) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background md:flex-row">
      <aside className="flex max-h-[42vh] min-h-0 w-full shrink-0 flex-col border-b border-border md:max-h-none md:h-full md:w-72 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-3 pt-4 pb-2">
          <h1 className="px-1 text-base font-semibold">{t('manys.title')}</h1>
          <Button variant="ghost" size="sm" onClick={() => useManyStore.getState().setOpen(true)}>
            {t('manys.local')}
          </Button>
        </div>
        <nav aria-label={t('manys.title')} className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto px-2 pb-2">
          {!loaded && (
            <div className="flex flex-col gap-2 px-1">
              <Skeleton className="h-11 rounded-xl" />
              <Skeleton className="h-11 rounded-xl" />
            </div>
          )}
          {manys.map((many) => (
            <Button
              key={many.id}
              type="button"
              variant="ghost"
              aria-pressed={selected === many.id}
              onClick={() => setSelected(many.id)}
              className={selectionSurfaceClass(selected === many.id, 'h-auto w-full justify-start gap-2.5 px-2 py-1.5 font-normal')}
            >
              <ManyMark variant={manyMarkVariant(many.id)} />
              <span className="min-w-0 truncate text-left text-sm">{many.name}</span>
            </Button>
          ))}
        </nav>
        <ManyCreateForm
          busy={busy}
          onCreate={(input) => run(async () => {
            const many = await request<CloudMany>('', 'POST', input);
            setSelected(many.id);
          })}
        />
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(`manys.errors.${error}`, { defaultValue: t('manys.errors.service_unavailable') })}{' '}
                <Button size="sm" variant="outline" onClick={() => { void refresh(); }}>{t('manys.retry')}</Button>
              </AlertDescription>
            </Alert>
          )}
          {!selected && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <ManyMark className="size-16" />
              <div className="max-w-sm">
                <h2 className="text-base font-semibold">{t('manys.title')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t('manys.intro')}</p>
              </div>
            </div>
          )}
          {selected && !detail && !error && (
            <div className="flex flex-1 flex-col justify-end gap-3 pb-4">
              <Skeleton className="h-16 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
            </div>
          )}
          {detail && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <header className="flex items-center gap-3">
                <ManyMark variant={selectedVariant} className="size-10" />
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{detail.many.name}</h2>
                <Button variant="ghost" onClick={() => setContextOpen(true)}>{t('manys.context')}</Button>
                <Button variant="outline" onClick={() => setComputerOpen((value) => !value)}>{t('manys.computer')}</Button>
              </header>
              <Dialog open={contextOpen} onOpenChange={setContextOpen}>
                <DialogContent className="max-h-[min(80vh,40rem)] overflow-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t('manys.context')}</DialogTitle>
                    <DialogDescription>{t('manys.permissionHint')}</DialogDescription>
                  </DialogHeader>
                  <ManySettings key={selected} many={detail.many} onSave={(value) => perform(() => request(`/${selected}`, 'PATCH', value))} />
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="text-sm font-medium">{t('manys.recurrences')}</h3>
                    <form
                      className="flex flex-col gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void perform(() => request(`/${selected}/recurrences`, 'POST', {
                          conversationId: detail.conversations[0].id,
                          prompt: form.get('prompt'),
                          intervalSeconds: Number(form.get('interval')),
                          nextAt: new Date(Date.now() + 300000).toISOString(),
                        }));
                      }}
                    >
                      <Field>
                        <FieldLabel>{t('manys.message')}</FieldLabel>
                        <Textarea name="prompt" required />
                      </Field>
                      <Field>
                        <FieldLabel>{t('manys.interval')}</FieldLabel>
                        <Input name="interval" type="number" min={300} max={31536000} defaultValue={86400} />
                      </Field>
                      <Button type="submit" disabled={busy}>{t('manys.create')}</Button>
                    </form>
                    {detail.recurrences.map((recurrence) => (
                      <article key={recurrence.id} className="flex items-center gap-2">
                        <p className="min-w-0 flex-1">{recurrence.prompt} · {new Date(recurrence.next_at).toLocaleString()}</p>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            void perform(() => request(`/${selected}/recurrences/${recurrence.id}`, 'DELETE'));
                          }}
                        >
                          {t('manys.remove')}
                        </Button>
                      </article>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <MessageScrollerProvider>
                <MessageScroller className="min-h-0 flex-1">
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="gap-4 px-1 py-2">
                      {detail.messages.length === 0 && spokenResults.length === 0 && (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
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
                          <Message key={message.id} align={isUser ? 'end' : 'start'} className="text-sm/relaxed">
                            {!isUser && (
                              <MessageAvatar className="size-8 bg-transparent">
                                <ManyMark variant={selectedVariant} className="size-8 ring-0" />
                              </MessageAvatar>
                            )}
                            <MessageContent>
                              <Bubble variant={isUser ? 'default' : 'secondary'} align={isUser ? 'end' : 'start'}>
                                <BubbleContent className="rounded-2xl px-3.5 py-2 text-sm/relaxed whitespace-pre-wrap">
                                  {message.content}
                                </BubbleContent>
                              </Bubble>
                              {queued && <Badge variant="outline">{t('manys.states.queued')}</Badge>}
                              {isLastForTask && task?.checkpoint?.reason && (
                                <p className="text-sm text-muted-foreground">
                                  {t(`manys.errors.${task.checkpoint.reason}`, { defaultValue: task.checkpoint.reason })}
                                </p>
                              )}
                              {resources.map((id) => (
                                <Button key={id} variant="link" onClick={() => { void openResource(id); }}>{t('manys.openResource')}</Button>
                              ))}
                            </MessageContent>
                          </Message>
                        );
                      })}
                      {spokenResults.map((task) => (
                        <Message key={task.id} align="start" className="text-sm/relaxed">
                          <MessageAvatar className="size-8 bg-transparent">
                            <ManyMark variant={selectedVariant} className="size-8 ring-0" />
                          </MessageAvatar>
                          <MessageContent>
                            <Bubble variant="secondary" align="start">
                              <BubbleContent className="rounded-2xl px-3.5 py-2 text-sm/relaxed whitespace-pre-wrap">
                                {task.result?.text}
                              </BubbleContent>
                            </Bubble>
                            {!detail.messages.some((message) => message.task_id === task.id) && task.result?.resources?.map((id) => (
                              <Button key={id} variant="link" onClick={() => { void openResource(id); }}>{t('manys.openResource')}</Button>
                            ))}
                          </MessageContent>
                        </Message>
                      ))}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                </MessageScroller>
              </MessageScrollerProvider>
              {questions.map((task) => (
                <form
                  key={task.id}
                  className="flex flex-col gap-2 rounded-2xl bg-muted px-3.5 py-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    patchTask(task.id, { action: 'answer', answer: form.get('answer') });
                  }}
                >
                  <Field>
                    <FieldLabel>{task.question}</FieldLabel>
                    <Input name="answer" required />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>{t('manys.answer')}</Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => patchTask(task.id, { action: 'cancel' })}>
                      {t('manys.cancelTask')}
                    </Button>
                  </div>
                </form>
              ))}
              {(decisions.length > 0 || conflicts.length > 0) && (
                <ManyReview detail={{ ...detail, actions: decisions }} busy={busy} perform={perform} />
              )}
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                {composerTasks.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {composerTasks.map((task) => (
                      <span key={task.id} className="flex flex-wrap gap-2">
                        {task.state === 'running' && (
                          <Button type="button" variant="outline" onClick={() => patchTask(task.id, { action: 'pause' })}>
                            {t('manys.stopReply')}
                          </Button>
                        )}
                        {task.state === 'paused' && (
                          <Button type="button" disabled={busy} onClick={() => patchTask(task.id, { action: 'resume' })}>
                            {t('manys.resume')}
                          </Button>
                        )}
                        <Button type="button" variant="outline" disabled={busy} onClick={() => patchTask(task.id, { action: 'cancel' })}>
                          {t('manys.cancelTask')}
                        </Button>
                      </span>
                    ))}
                  </div>
                )}
                <form
                  className="flex items-end gap-2 rounded-2xl border border-border bg-card px-2 py-1.5"
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
                      placeholder={t('manys.message')}
                      className="max-h-36 min-h-10 border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-sm"
                      onChange={(event) => {
                        setDraft(event.target.value);
                        localStorage.setItem(`manys:draft:${selected}`, event.target.value);
                      }}
                    />
                  </Field>
                  <Button type="submit" disabled={busy || !draft.trim()} className="mb-0.5 rounded-full">
                    {t('manys.send')}
                  </Button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
      {detail && computerOpen && (
        <aside className="w-full overflow-auto border-l border-border p-4 lg:w-96 lg:shrink-0">
          <ManyComputer key={selected} manyId={selected} control={detail.computer?.control ?? 'agent'} />
        </aside>
      )}
    </div>
  );
}
