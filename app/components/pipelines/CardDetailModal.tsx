import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowLeftRightIcon, CalendarClockIcon, Cancel01Icon, CancelCircleIcon, CheckIcon, CheckmarkCircle02Icon, CheckmarkSquare02Icon, ChevronRightIcon, CircleIcon, Delete02Icon, ExternalLinkIcon, EyeIcon, File02Icon, Loading03Icon, PencilIcon, PlayIcon, PlusSignIcon, StickyNote02Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/shared/DatePicker';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { pipelinesClient, pipelinesEvents } from '@/lib/pipelines/client';
import type { PipelineItem, PipelineStage, PipelineItemEvent } from '@/lib/pipelines/types';
import { MANY_EXECUTOR_ID } from '@/lib/pipelines/types';
import type { ExecutorOption } from '@/lib/store/usePipelinesStore';
import { showToast } from '@/lib/store/useToastStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import { typesetDocsClass } from '@/lib/typeset';
import RunSummaryModal from './RunSummaryModal';
import {
  DetailDrawer,
  DetailDrawerBadge,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerFooter,
  DetailDrawerHeader,
  DetailDrawerMetaGrid,
  DetailDrawerPanel,
  DetailDrawerSection,
} from '@/components/shared/DetailDrawer';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger , DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { ReactNode } from 'react';
interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface CardField {
  id: string;
  type: 'description' | 'todos' | 'note';
  text?: string;
  todos?: TodoItem[];
}

type DetailTab = 'details' | 'activity';

function toDateInput(ms?: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInput(v: string): number | null {
  if (!v) return null;
  const ms = new Date(`${v}T00:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newTodoId(): string {
  return newId('todo');
}

function newFieldId(): string {
  return newId('field');
}

function normalizeTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is TodoItem => t != null && typeof t === 'object' && typeof t.text === 'string')
    .map((t) => ({
      id: typeof t.id === 'string' ? t.id : newTodoId(),
      text: t.text,
      done: Boolean(t.done),
    }));
}

/** Return a new todos array with the matching id patched (no-op if absent). */
function patchTodo(todos: TodoItem[] | undefined, todoId: string, patch: Partial<TodoItem>): TodoItem[] {
  if (!todos) return [];
  return todos.map((td) => (td.id === todoId ? { ...td, ...patch } : td));
}

function migrateFields(data?: Record<string, unknown> | null): CardField[] {
  if (!data) return [];
  if (Array.isArray(data.fields)) {
    return data.fields
      .map((raw): CardField | null => {
        if (!raw || typeof raw !== 'object') return null;
        const f = raw as Record<string, unknown>;
        const type: CardField['type'] =
          f.type === 'todos' || f.type === 'note' ? f.type : 'description';
        const id = typeof f.id === 'string' ? f.id : newFieldId();
        if (type === 'todos') return { id, type, todos: normalizeTodos(f.todos) };
        return { id, type, text: typeof f.text === 'string' ? f.text : '' };
      })
      .filter((f): f is CardField => f !== null);
  }
  const fields: CardField[] = [];
  if (typeof data.text === 'string' && data.text.trim().length > 0) {
    fields.push({ id: newFieldId(), type: 'description', text: data.text });
  }
  if (Array.isArray(data.todos) && data.todos.length > 0) {
    fields.push({ id: newFieldId(), type: 'todos', todos: normalizeTodos(data.todos) });
  }
  return fields;
}

function countTodos(fields: CardField[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const field of fields) {
    if (field.type !== 'todos' || !field.todos) continue;
    for (const todo of field.todos) {
      if (!todo.text.trim()) continue;
      total += 1;
      if (todo.done) done += 1;
    }
  }
  return { done, total };
}

function formatWhenRange(startAt?: number | null, endAt?: number | null): string {
  if (!startAt && !endAt) return '—';
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  if (startAt && endAt) return `${fmt(startAt)} → ${fmt(endAt)}`;
  if (startAt) return fmt(startAt);
  return fmt(endAt as number);
}

function resolveAgentLabel(
  item: PipelineItem,
  stage: PipelineStage | undefined,
  agents: ExecutorOption[],
  t: (key: string) => string,
): string {
  const agentId = item.assignedAgentId ?? stage?.assignedAgentId;
  if (!agentId) {
    if (stage?.executionPolicy === 'manual_resolve') return t('pipelines.assigned_manual');
    return t('pipelines.assigned_unassigned');
  }
  if (agentId === MANY_EXECUTOR_ID) return 'Many';
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function eventVisual(eventType: string): { icon: IconSvgElement; colorClass: string } {
  switch (eventType) {
    case 'run_started':
      return { icon: PlayIcon, colorClass: 'text-primary' };
    case 'run_completed':
      return { icon: CheckmarkCircle02Icon, colorClass: 'text-primary' };
    case 'run_failed':
      return { icon: CancelCircleIcon, colorClass: 'text-destructive' };
    case 'card_created':
      return { icon: PlusSignIcon, colorClass: 'text-primary' };
    case 'card_moved':
      return { icon: ArrowLeftRightIcon, colorClass: 'text-muted-foreground' };
    case 'auto_advanced':
      return { icon: ChevronRightIcon, colorClass: 'text-muted-foreground' };
    case 'report_generated':
      return { icon: File02Icon, colorClass: 'text-primary' };
    default:
      return { icon: CircleIcon, colorClass: 'text-muted-foreground' };
  }
}


interface Props {
  item: PipelineItem;
  stage: PipelineStage | undefined;
  pipelineName?: string;
  agents?: ExecutorOption[];
  onClose: () => void;
  onSave: (patch: Partial<PipelineItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onRun: () => void | Promise<void>;
}

export default function CardDetailModal({
  item,
  stage,
  pipelineName,
  agents = [],
  onClose,
  onSave,
  onDelete,
  onRun,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(item.title);
  const [startInput, setStartInput] = useState(toDateInput(item.startAt));
  const [endInput, setEndInput] = useState(toDateInput(item.endAt));
  const [fields, setFields] = useState<CardField[]>(() => migrateFields(item.data));
  const [descView, setDescView] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of migrateFields(item.data)) {
      if (f.type === 'description') init[f.id] = (f.text ?? '').trim().length > 0;
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [tab, setTab] = useState<DetailTab>('details');
  const [editing, setEditing] = useState(false);
  const [events, setEvents] = useState<PipelineItemEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsReloadKey, setEventsReloadKey] = useState(0);
  const [summary, setSummary] = useState<{ runId?: string; resourceId?: string; title?: string } | null>(null);
  const openResourceTab = useTabStore((s) => s.openResourceTab);
  const openCalendarTab = useTabStore((s) => s.openCalendarTab);
  const runPending = usePipelinesStore((s) => Boolean(s.runInFlightIds[item.id]));

  const activityFetchKey = `${tab}:${item.id}:${eventsReloadKey}`;
  const prevActivityFetchKeyRef = useRef(activityFetchKey);
  if (tab === 'activity' && activityFetchKey !== prevActivityFetchKeyRef.current) {
    prevActivityFetchKeyRef.current = activityFetchKey;
    setEventsLoading(true);
  }

  useEffect(() => {
    if (tab !== 'activity') return;
    let cancelled = false;
    pipelinesClient
      .listItemEvents(item.id)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, item.id, eventsReloadKey]);

  // Many finishes the report asynchronously; react to the broadcast for this
  // card: stop the spinner, refresh activity, and open the run summary.
  useEffect(() => {
    const unsub = pipelinesEvents.onReportReady((p) => {
      if (p.itemId !== item.id) return;
      setGenerating(false);
      if (p.error) {
        showToast('error', t('pipelines.action_failed'));
        return;
      }
      showToast('success', t('pipelines.report_generated_success'));
      setTab('activity');
      setEventsReloadKey((k) => k + 1);
      setSummary({ runId: p.runId, resourceId: p.resourceId, title: p.title });
    });
    return unsub;
  }, [item.id, t]);

  const isRunning = item.execStatus === 'running' || runPending;
  const agentBusy = isRunning || launching;

  const execStatusKey = `${item.execStatus}:${item.updatedAt}`;
  const prevExecStatusKeyRef = useRef(execStatusKey);
  if (execStatusKey !== prevExecStatusKeyRef.current) {
    prevExecStatusKeyRef.current = execStatusKey;
    if (item.execStatus === 'running') {
      setLaunching(false);
    }
    if (item.execStatus === 'ready' || item.execStatus === 'failed') {
      setLaunching(false);
      setEventsReloadKey((k) => k + 1);
    }
  }

  const addField = (type: CardField['type']) => {
    const id = newFieldId();
    const field: CardField =
      type === 'todos' ? { id, type, todos: [] } : { id, type, text: '' };
    setFields((prev) => [...prev, field]);
    if (type === 'description') {
      setDescView((prev) => ({ ...prev, [id]: false }));
    }
  };

  const updateField = (id: string, patch: Partial<CardField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setDescView((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleDescView = (id: string) => {
    setDescView((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const addTodo = (fieldId: string) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, todos: [...(f.todos ?? []), { id: newTodoId(), text: '', done: false }] }
          : f,
      ),
    );
  };

  const updateTodo = (fieldId: string, todoId: string, patch: Partial<TodoItem>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, todos: patchTodo(f.todos, todoId, patch) } : f)),
    );
  };

  const removeTodo = (fieldId: string, todoId: string) => {
    const isNotTargetTodo = (td: TodoItem) => td.id !== todoId;
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, todos: (f.todos ?? []).filter(isNotTargetTodo) }
          : f,
      ),
    );
  };

  const saveData = async (): Promise<void> => {
    const data: Record<string, unknown> = { fields };
    for (const f of fields) {
      if (f.type === 'description' && typeof f.text === 'string' && f.text.trim()) {
        data.text = f.text;
      }
      if (f.type === 'todos' && Array.isArray(f.todos)) {
        const cleanTodos = f.todos.filter((td) => td.text.trim().length > 0);
        if (cleanTodos.length > 0) data.todos = cleanTodos;
      }
    }
    await onSave({
      title: title.trim() || item.title,
      startAt: fromDateInput(startInput),
      endAt: fromDateInput(endInput),
      data: (fields.length > 0 ? data : null) as Record<string, unknown> | null,
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveData();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      // Persist the card first so Many sees the latest fields, then hand off to
      // Many (main process) to author the report. The result arrives async via
      // the `pipelines:report:ready` broadcast (see the effect below).
      await saveData();
      await pipelinesClient.generateReport(item.id);
      showToast('info', t('pipelines.report_started'));
      setTab('activity');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err));
      setGenerating(false);
    }
  };

  const handleRun = async () => {
    if (agentBusy) return;
    setLaunching(true);
    try {
      await onRun();
      showToast('info', t('pipelines.run_started_toast'));
      setTab('activity');
      setEventsReloadKey((k) => k + 1);
    } catch (err) {
      setLaunching(false);
      showToast('error', err instanceof Error ? err.message : t('pipelines.action_failed'));
    }
  };

  const canRun = stage && stage.executionPolicy !== 'manual_resolve';

  const tabOptions = [
    { value: 'details', label: t('pipelines.tab_details') },
    { value: 'activity', label: t('pipelines.tab_activity') },
  ];

  const addFieldItems = [
    {
      label: t('pipelines.field_description'),
      icon: <HugeiconsIcon icon={File02Icon} size={14} />,
      onClick: () => addField('description'),
    },
    {
      label: t('pipelines.field_todos'),
      icon: <HugeiconsIcon icon={CheckmarkSquare02Icon} size={14} />,
      onClick: () => addField('todos'),
    },
    {
      label: t('pipelines.field_note'),
      icon: <HugeiconsIcon icon={StickyNote02Icon} size={14} />,
      onClick: () => addField('note'),
    },
  ];

  const fieldLabel = (type: CardField['type']): string => {
    if (type === 'todos') return t('pipelines.field_todos');
    if (type === 'note') return t('pipelines.field_note');
    return t('pipelines.field_description');
  };

  const { done: todosDone, total: todosTotal } = countTodos(fields);
  const descriptionMarkdown = fields
    .filter((f) => (f.type === 'description' || f.type === 'note') && (f.text ?? '').trim())
    .map((f) => f.text ?? '')
    .join('\n\n');
  const headerTitle = stage?.title
    ? `${stage.title} — ${title.trim() || item.title}`
    : title.trim() || item.title;
  const badgeLabel = [pipelineName, stage?.title].filter(Boolean).join(' — ');
  const metaItems = [
    {
      label: t('pipelines.meta_when'),
      value: formatWhenRange(item.startAt, item.endAt),
      icon: <HugeiconsIcon icon={CalendarClockIcon} className="size-3.5" />,
    },
    {
      label: t('pipelines.assigned_agent'),
      value: resolveAgentLabel(item, stage, agents, t),
    },
    {
      label: t('pipelines.meta_status'),
      value: t(`pipelines.status_${item.execStatus}`),
    },
    {
      label: t('pipelines.meta_tasks'),
      value:
        todosTotal > 0
          ? t('pipelines.meta_tasks_progress', { done: todosDone, total: todosTotal })
          : '—',
    },
  ];

  return (
    <>
      <DetailDrawer open onOpenChange={(next) => { if (!next) onClose(); }}>
        <DetailDrawerContent size="lg">
          <DetailDrawerHeader
            title={headerTitle}
            badge={
              badgeLabel ? <DetailDrawerBadge>{badgeLabel}</DetailDrawerBadge> : undefined
            }
          />
          <DetailDrawerBody>
            {editing ? (
              <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-title">{t('pipelines.card_title_placeholder')}</Label>
          <Input
            id="card-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <DatePicker
            className="flex-1"
            label={t('pipelines.start_date')}
            value={startInput}
            onChange={setStartInput}
          />
          <DatePicker
            className="flex-1"
            label={t('pipelines.end_date')}
            value={endInput}
            onChange={setEndInput}
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="min-w-0"><TabsList aria-label={t('pipelines.tab_details')} className="h-auto w-full max-w-full flex-wrap">{(tabOptions).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>

        {agentBusy && (
          <output
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-muted px-3 py-2"
            aria-live="polite"
          >
            <HugeiconsIcon icon={Loading03Icon} className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            <span className="text-sm font-medium text-foreground">
              {launching ? t('pipelines.run_launching') : t('pipelines.agent_running_overlay')}
            </span>
          </output>
        )}

        <div className="relative">
          {generating && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/80 backdrop-blur-sm">
              <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-primary" />
              <span className="text-sm text-foreground">{t('pipelines.report_generating')}</span>
            </div>
          )}

          <div
            className={cn(
              generating && 'pointer-events-none opacity-40 blur-[2px]',
            )}
          >
            {tab === 'details' && (
              <>
                {fields.length === 0 && (
                  <span className="py-2 text-xs text-muted-foreground">{t('pipelines.field_empty')}</span>
                )}

                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="mb-2 flex flex-col gap-1.5 rounded-xl border bg-card p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {fieldLabel(f.type)}
                      </span>
                      <div className="flex items-center gap-1">
                        {f.type === 'description' && (
                          <Button variant="ghost" aria-label={
                              descView[f.id]
                                ? t('pipelines.edit_mode')
                                : t('pipelines.view_mode')
                            } onClick={() => toggleDescView(f.id)} size="icon-xs">
                            {descView[f.id] ? <HugeiconsIcon icon={PencilIcon} size={14} /> : <HugeiconsIcon icon={EyeIcon} size={14} />}
                          </Button>
                        )}
                        <Button variant="ghost" aria-label={t('pipelines.remove_field')} className="text-muted-foreground hover:text-destructive" onClick={() => removeField(f.id)} size="icon-xs">
                          <HugeiconsIcon icon={Cancel01Icon} size={14} />
                        </Button>
                      </div>
                    </div>

                    {f.type === 'description' &&
                      (descView[f.id] ? (
                        (f.text ?? '').trim() ? (
                          <DetailDrawerPanel className={cn(typesetDocsClass, 'max-h-60 overflow-y-auto text-foreground')}>
                            <MarkdownRenderer content={f.text ?? ''} />
                          </DetailDrawerPanel>
                        ) : (
                          <span className="py-2 text-xs text-muted-foreground">
                            {t('pipelines.card_data_placeholder')}
                          </span>
                        )
                      ) : (
                        <Textarea className="min-h-24 resize-y resize-y text-sm" value={f.text ?? ''} onChange={(e) => updateField(f.id, { text: e.target.value })} rows={5} placeholder={t('pipelines.card_data_placeholder')} />
                      ))}

                    {f.type === 'note' && (
                      <Textarea className="min-h-24 resize-y resize-y text-sm" value={f.text ?? ''} onChange={(e) => updateField(f.id, { text: e.target.value })} rows={3} placeholder={t('pipelines.card_data_placeholder')} />
                    )}

                    {f.type === 'todos' && (
                      <div className="flex flex-col gap-1.5">
                        {(f.todos ?? []).length === 0 && (
                          <span className="py-2 text-xs text-muted-foreground">
                            {t('pipelines.card_todo_empty')}
                          </span>
                        )}
                        {(f.todos ?? []).map((td) => (
                          <div
                            key={td.id}
                            className="flex items-center gap-2 rounded-lg border bg-muted/50 px-2 py-1.5"
                          >
                            <Button
                              type="button"
                              role="checkbox"
                              aria-checked={td.done}
                              onClick={() =>
                                updateTodo(f.id, td.id, { done: !td.done })
                              }
                              className={cn(
                                'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors',
                                td.done
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-input bg-transparent',
                              )}
                            >
                              {td.done && (
                                <HugeiconsIcon icon={CheckIcon} size={13} aria-hidden />
                              )}
                            </Button>
                            <Input
                              value={td.text}
                              onChange={(e) =>
                                updateTodo(f.id, td.id, { text: e.target.value })
                              }
                              placeholder={t('pipelines.card_todo_placeholder')}
                              aria-label={t('pipelines.card_todo_placeholder')}
                              className={cn(
                                'min-w-0 flex-1 bg-transparent text-sm outline-none',
                                td.done && 'text-muted-foreground line-through',
                              )}
                            />
                            <Button variant="ghost" aria-label={t('pipelines.delete')} className="text-muted-foreground hover:text-destructive" onClick={() => removeTodo(f.id, td.id)} size="icon-xs">
                              <HugeiconsIcon icon={Cancel01Icon} size={14} />
                            </Button>
                          </div>
                        ))}
                        <Button variant="outline" onClick={() => addTodo(f.id)} size="sm">{<HugeiconsIcon icon={PlusSignIcon} size={14} />}
                          {t('pipelines.card_add_todo')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="mb-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                      <HugeiconsIcon icon={PlusSignIcon} size={14} />
                      {t('pipelines.add_field')}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-40"><DropdownMenuGroup>
                      {addFieldItems.map((menuItem) => (
                        <DropdownMenuItem key={menuItem.label} onClick={menuItem.onClick}>
                          {menuItem.icon}
                          {menuItem.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup></DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {item.lastOutput && (
                  <DetailDrawerSection label={t('pipelines.history')}>
                    <DetailDrawerPanel className={cn(typesetDocsClass, 'max-h-64 overflow-y-auto text-foreground')}>
                      <MarkdownRenderer content={item.lastOutput} />
                    </DetailDrawerPanel>
                  </DetailDrawerSection>
                )}
              </>
            )}

            {tab === 'activity' && (
              <div className="flex flex-col gap-2">
                {item.calendarEventId && (
                  <Button
                    type="button"
                    onClick={() => openCalendarTab()}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border bg-card px-2 py-1.5 text-left"
                  >
                    <HugeiconsIcon icon={CalendarClockIcon} size={16} className="shrink-0 text-primary" />
                    <span className="flex-1 text-sm text-foreground">
                      {t('pipelines.open_calendar_event')}
                    </span>
                    <HugeiconsIcon icon={ExternalLinkIcon} size={12} className="text-muted-foreground" />
                  </Button>
                )}
                {eventsLoading && (
                  <span className="py-2 text-xs text-muted-foreground">{t('pipelines.saving')}</span>
                )}
                {!eventsLoading && events.length === 0 && (
                  <span className="py-2 text-xs text-muted-foreground">{t('pipelines.activity_empty')}</span>
                )}
                {!eventsLoading &&
                  events.map((ev) => {
                    const { icon: eventIcon, colorClass } = eventVisual(ev.eventType);
                    const actorLabel =
                      ev.actor && ev.actor !== 'system' && ev.actor !== 'user'
                        ? ev.actor
                        : null;
                    // Full agent output is stored in detail.output (the summary
                    // is only a short preview). Render markdown for run results.
                    const detailOutput =
                      ev.detail && typeof ev.detail.output === 'string' ? ev.detail.output : null;
                    const richBody =
                      detailOutput ??
                      (ev.eventType === 'run_completed' || ev.eventType === 'run_failed'
                        ? ev.summary ?? null
                        : null);
                    const reportResourceId =
                      ev.eventType === 'report_generated' &&
                      ev.detail &&
                      typeof ev.detail.resourceId === 'string'
                        ? ev.detail.resourceId
                        : null;
                    const reportTitle =
                      ev.detail && typeof ev.detail.title === 'string' ? ev.detail.title : t('pipelines.open_report');
                    return (
                      <div
                        key={ev.id}
                        className="flex items-start gap-2 rounded-xl border bg-card px-2 py-1.5"
                      >
                        <HugeiconsIcon icon={eventIcon} size={16} className={cn('mt-0.5 shrink-0', colorClass)} />
                        <div className="min-w-0 flex-1 flex-col gap-0.5">
                          {richBody ? (
                            <div className="max-h-56 overflow-y-auto text-sm text-foreground">
                              <MarkdownRenderer content={richBody} />
                            </div>
                          ) : (
                            <span className="text-sm text-foreground">{ev.summary ?? ev.eventType}</span>
                          )}
                          {actorLabel && (
                            <span className="text-[11px] text-muted-foreground">{actorLabel}</span>
                          )}
                          {reportResourceId && (
                            <Button
                              type="button"
                              onClick={() =>
                                setSummary({
                                  resourceId: reportResourceId,
                                  title: reportTitle,
                                  runId: ev.runId ?? undefined,
                                })
                              }
                              className="mt-0.5 inline-flex cursor-pointer items-center gap-1 self-start border-none bg-transparent text-[11px] font-medium text-primary"
                            >
                              <HugeiconsIcon icon={ExternalLinkIcon} size={11} />
                              {t('pipelines.view_summary')}
                            </Button>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {new Date(ev.createdAt).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <DetailDrawerMetaGrid items={metaItems} />
                {descriptionMarkdown ? (
                  <>
                    <Separator />
                    <DetailDrawerSection label={t('pipelines.field_description')}>
                      <div className={cn(typesetDocsClass, 'text-sm text-foreground')}>
                        <MarkdownRenderer content={descriptionMarkdown} />
                      </div>
                    </DetailDrawerSection>
                  </>
                ) : null}
                {item.lastOutput ? (
                  <>
                    <Separator />
                    <DetailDrawerSection label={t('pipelines.history')}>
                      <DetailDrawerPanel
                        className={cn(typesetDocsClass, 'max-h-64 overflow-y-auto text-foreground')}
                      >
                        <MarkdownRenderer content={item.lastOutput} />
                      </DetailDrawerPanel>
                    </DetailDrawerSection>
                  </>
                ) : null}
              </div>
            )}
          </DetailDrawerBody>
          <DetailDrawerFooter>
            {editing ? (
              <>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive hover:text-destructive" size="sm" />}>
                    <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                    {t('pipelines.delete')}
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('pipelines.delete')}</AlertDialogTitle>
                      <AlertDialogDescription>{item.title}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('pipelines.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>{t('pipelines.delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="flex-1" />
                <Button variant="outline" onClick={() => setEditing(false)} size="sm">
                  {t('pipelines.cancel')}
                </Button>
                {canRun ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleRun()}
                    disabled={generating || agentBusy || saving}
                    size="sm"
                  >
                    {agentBusy ? <HugeiconsIcon icon={Loading03Icon} data-icon="inline-start" className="animate-spin" /> : <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />}
                    {launching
                      ? t('pipelines.run_launching')
                      : isRunning
                        ? t('pipelines.status_running')
                        : t('pipelines.run_now')}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => void generateReport()}
                  disabled={saving || agentBusy}
                  size="sm"
                >
                  {generating ? <HugeiconsIcon icon={Loading03Icon} data-icon="inline-start" className="animate-spin" /> : <HugeiconsIcon icon={File02Icon} data-icon="inline-start" />}
                  {t('pipelines.generate_report')}
                </Button>
                <Button onClick={() => void save()} disabled={saving || agentBusy} size="sm">
                  {saving ? t('pipelines.saving') : t('pipelines.save')}
                </Button>
              </>
            ) : (
              <>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive hover:text-destructive" size="sm" />}>
                    <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                    {t('pipelines.delete')}
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('pipelines.delete')}</AlertDialogTitle>
                      <AlertDialogDescription>{item.title}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('pipelines.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>{t('pipelines.delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="flex-1" />
                <Button variant="outline" onClick={() => setEditing(true)} size="sm">
                  <HugeiconsIcon icon={PencilIcon} className="size-4" />
                  {t('pipelines.edit')}
                </Button>
                <Button onClick={onClose} size="sm">
                  {t('pipelines.close')}
                </Button>
              </>
            )}
          </DetailDrawerFooter>
        </DetailDrawerContent>
      </DetailDrawer>
      {summary ? (
        <RunSummaryModal
          runId={summary.runId}
          resourceId={summary.resourceId}
          reportTitle={summary.title}
          cardTitle={item.title}
          events={events}
          hasCalendar={!!item.calendarEventId}
          onOpenReport={(rid, title) => openResourceTab(rid, 'artifact', title)}
          onOpenCalendar={() => openCalendarTab()}
          onClose={() => setSummary(null)}
        />
      ) : null}
    </>
  );
}
