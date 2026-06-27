import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Trash2,
  Play,
  Plus,
  X,
  Check,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  ChevronRight,
  FileText,
  Circle,
  Pencil,
  Eye,
  Loader2,
  CheckSquare,
  StickyNote,
  ExternalLink,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { DomeDatePicker } from '@/components/ui/DomeDatePicker';
import { DomeTextarea } from '@/components/ui/DomeInput';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import DomeContextMenu from '@/components/ui/DomeContextMenu';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { pipelinesClient, pipelinesEvents } from '@/lib/pipelines/client';
import type { PipelineItem, PipelineStage, PipelineItemEvent } from '@/lib/pipelines/types';
import { showToast } from '@/lib/store/useToastStore';
import { useTabStore } from '@/lib/store/useTabStore';
import RunSummaryModal from './RunSummaryModal';

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

function eventVisual(eventType: string): { Icon: LucideIcon; color: string } {
  switch (eventType) {
    case 'run_started':
      return { Icon: Play, color: 'var(--accent)' };
    case 'run_completed':
      return { Icon: CheckCircle2, color: 'var(--success)' };
    case 'run_failed':
      return { Icon: XCircle, color: 'var(--error)' };
    case 'card_created':
      return { Icon: Plus, color: 'var(--accent)' };
    case 'card_moved':
      return { Icon: ArrowRightLeft, color: 'var(--secondary-text)' };
    case 'auto_advanced':
      return { Icon: ChevronRight, color: 'var(--secondary-text)' };
    case 'report_generated':
      return { Icon: FileText, color: 'var(--accent)' };
    default:
      return { Icon: Circle, color: 'var(--tertiary-text)' };
  }
}


interface Props {
  item: PipelineItem;
  stage: PipelineStage | undefined;
  onClose: () => void;
  onSave: (patch: Partial<PipelineItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onRun: () => void;
}

export default function CardDetailModal({ item, stage, onClose, onSave, onDelete, onRun }: Props) {
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
  const [tab, setTab] = useState<DetailTab>('details');
  const [events, setEvents] = useState<PipelineItemEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsReloadKey, setEventsReloadKey] = useState(0);
  const [summary, setSummary] = useState<{ runId?: string; resourceId?: string; title?: string } | null>(null);
  const openResourceTab = useTabStore((s) => s.openResourceTab);
  const openCalendarTab = useTabStore((s) => s.openCalendarTab);

  useEffect(() => {
    if (tab !== 'activity') return;
    let cancelled = false;
    setEventsLoading(true);
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
      prev.map((f) =>
        f.id === fieldId
          ? {
              ...f,
              todos: (f.todos ?? []).map((td) => (td.id === todoId ? { ...td, ...patch } : td)),
            }
          : f,
      ),
    );
  };

  const removeTodo = (fieldId: string, todoId: string) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, todos: (f.todos ?? []).filter((td) => td.id !== todoId) }
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

  const canRun = stage && stage.executionPolicy !== 'manual_resolve';

  const tabOptions = [
    { value: 'details', label: t('pipelines.tab_details') },
    { value: 'activity', label: t('pipelines.tab_activity') },
  ];

  const addFieldItems = [
    {
      label: t('pipelines.field_description'),
      icon: <FileText size={14} />,
      onClick: () => addField('description'),
    },
    {
      label: t('pipelines.field_todos'),
      icon: <CheckSquare size={14} />,
      onClick: () => addField('todos'),
    },
    {
      label: t('pipelines.field_note'),
      icon: <StickyNote size={14} />,
      onClick: () => addField('note'),
    },
  ];

  const fieldLabel = (type: CardField['type']): string => {
    if (type === 'todos') return t('pipelines.field_todos');
    if (type === 'note') return t('pipelines.field_note');
    return t('pipelines.field_description');
  };

  return (
    <DomeModal
      open
      onClose={onClose}
      title={item.title}
      subtitle={stage?.title}
      size="md"
      footer={
        <>
          <DomeButton
            variant="ghost"
            size="sm"
            onClick={() => void onDelete()}
            leftIcon={<Trash2 className="size-4" />}
          >
            {t('pipelines.delete')}
          </DomeButton>
          <div style={{ flex: 1 }} />
          {canRun && (
            <DomeButton
              variant="outline"
              size="sm"
              onClick={onRun}
              disabled={generating}
              leftIcon={<Play className="size-4" />}
            >
              {t('pipelines.run_now')}
            </DomeButton>
          )}
          <DomeButton
            variant="outline"
            size="sm"
            onClick={() => void generateReport()}
            loading={generating}
            disabled={saving}
            leftIcon={<FileText className="size-4" />}
          >
            {t('pipelines.generate_report')}
          </DomeButton>
          <DomeButton
            variant="primary"
            size="sm"
            onClick={() => void save()}
            disabled={saving}
            loading={saving}
          >
            {saving ? t('pipelines.saving') : t('pipelines.save')}
          </DomeButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span
            className="text-[11px] font-medium uppercase tracking-wide"
            style={{ color: 'var(--tertiary-text)' }}
          >
            {t('pipelines.card_title_placeholder')}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm rounded-md px-2 py-1.5 outline-none"
            style={{
              background: 'var(--bg)',
              color: 'var(--primary-text)',
              border: '1px solid var(--border)',
            }}
          />
        </label>

        <div className="flex gap-3">
          <DomeDatePicker
            className="flex-1"
            label={t('pipelines.start_date')}
            value={startInput}
            onChange={setStartInput}
          />
          <DomeDatePicker
            className="flex-1"
            label={t('pipelines.end_date')}
            value={endInput}
            onChange={setEndInput}
          />
        </div>

        <DomeSegmentedControl
          options={tabOptions}
          value={tab}
          onChange={(v) => setTab(v as DetailTab)}
          size="sm"
          aria-label={t('pipelines.tab_details')}
        />

        <div style={{ position: 'relative' }}>
          {generating && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md"
              style={{ background: 'var(--overlay-bg, rgba(0,0,0,0.55))' }}
            >
              <Loader2 className="size-6 animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-sm" style={{ color: 'var(--primary-text)' }}>
                {t('pipelines.report_generating')}
              </span>
            </div>
          )}

          <div
            style={
              generating
                ? { filter: 'blur(2px)', opacity: 0.4, pointerEvents: 'none' }
                : undefined
            }
          >
            {tab === 'details' && (
              <>
                {fields.length === 0 && (
                  <span className="text-xs py-2" style={{ color: 'var(--tertiary-text)' }}>
                    {t('pipelines.field_empty')}
                  </span>
                )}

                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-col gap-1.5 rounded-md p-2 mb-2"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[11px] font-medium uppercase tracking-wide"
                        style={{ color: 'var(--tertiary-text)' }}
                      >
                        {fieldLabel(f.type)}
                      </span>
                      <div className="flex items-center gap-1">
                        {f.type === 'description' && (
                          <DomeButton
                            iconOnly
                            variant="ghost"
                            size="xs"
                            aria-label={
                              descView[f.id]
                                ? t('pipelines.edit_mode')
                                : t('pipelines.view_mode')
                            }
                            onClick={() => toggleDescView(f.id)}
                          >
                            {descView[f.id] ? <Pencil size={14} /> : <Eye size={14} />}
                          </DomeButton>
                        )}
                        <DomeButton
                          iconOnly
                          variant="ghost"
                          size="xs"
                          aria-label={t('pipelines.remove_field')}
                          className="!text-[var(--tertiary-text)] hover:!text-[var(--error)]"
                          onClick={() => removeField(f.id)}
                        >
                          <X size={14} />
                        </DomeButton>
                      </div>
                    </div>

                    {f.type === 'description' &&
                      (descView[f.id] ? (
                        (f.text ?? '').trim() ? (
                          <div
                            className="rounded-md px-2 py-1.5 max-h-60 overflow-y-auto prose-sm"
                            style={{
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <MarkdownRenderer content={f.text ?? ''} />
                          </div>
                        ) : (
                          <span className="text-xs py-2" style={{ color: 'var(--tertiary-text)' }}>
                            {t('pipelines.card_data_placeholder')}
                          </span>
                        )
                      ) : (
                        <DomeTextarea
                          value={f.text ?? ''}
                          onChange={(e) => updateField(f.id, { text: e.target.value })}
                          rows={5}
                          textareaClassName="resize-y text-sm"
                          placeholder={t('pipelines.card_data_placeholder')}
                        />
                      ))}

                    {f.type === 'note' && (
                      <DomeTextarea
                        value={f.text ?? ''}
                        onChange={(e) => updateField(f.id, { text: e.target.value })}
                        rows={3}
                        textareaClassName="resize-y text-sm"
                        placeholder={t('pipelines.card_data_placeholder')}
                      />
                    )}

                    {f.type === 'todos' && (
                      <div className="flex flex-col gap-1.5">
                        {(f.todos ?? []).length === 0 && (
                          <span
                            className="text-xs py-2"
                            style={{ color: 'var(--tertiary-text)' }}
                          >
                            {t('pipelines.card_todo_empty')}
                          </span>
                        )}
                        {(f.todos ?? []).map((td) => (
                          <div
                            key={td.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5"
                            style={{
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={td.done}
                              onClick={() =>
                                updateTodo(f.id, td.id, { done: !td.done })
                              }
                              className="flex size-5 shrink-0 items-center justify-center rounded border transition-colors"
                              style={{
                                borderColor: td.done ? 'var(--accent)' : 'var(--border)',
                                background: td.done ? 'var(--accent)' : 'transparent',
                                cursor: 'pointer',
                              }}
                            >
                              {td.done && (
                                <Check size={13} style={{ color: 'var(--base-text)' }} aria-hidden />
                              )}
                            </button>
                            <input
                              value={td.text}
                              onChange={(e) =>
                                updateTodo(f.id, td.id, { text: e.target.value })
                              }
                              placeholder={t('pipelines.card_todo_placeholder')}
                              aria-label={t('pipelines.card_todo_placeholder')}
                              className="flex-1 min-w-0 text-sm bg-transparent outline-none"
                              style={{
                                color: td.done
                                  ? 'var(--tertiary-text)'
                                  : 'var(--primary-text)',
                                textDecoration: td.done ? 'line-through' : 'none',
                              }}
                            />
                            <DomeButton
                              iconOnly
                              variant="ghost"
                              size="xs"
                              aria-label={t('pipelines.delete')}
                              className="!text-[var(--tertiary-text)] hover:!text-[var(--error)]"
                              onClick={() => removeTodo(f.id, td.id)}
                            >
                              <X size={14} />
                            </DomeButton>
                          </div>
                        ))}
                        <DomeButton
                          variant="outline"
                          size="sm"
                          leftIcon={<Plus size={14} />}
                          onClick={() => addTodo(f.id)}
                        >
                          {t('pipelines.card_add_todo')}
                        </DomeButton>
                      </div>
                    )}
                  </div>
                ))}

                <div className="mb-2">
                  <DomeContextMenu
                    trigger={
                      <DomeButton variant="outline" size="sm" leftIcon={<Plus size={14} />}>
                        {t('pipelines.add_field')}
                      </DomeButton>
                    }
                    align="start"
                    items={addFieldItems}
                  />
                </div>

                {item.lastOutput && (
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: 'var(--tertiary-text)' }}
                    >
                      {t('pipelines.history')}
                    </span>
                    <div
                      className="text-xs rounded-md px-3 py-2 max-h-64 overflow-y-auto"
                      style={{
                        background: 'var(--bg)',
                        color: 'var(--secondary-text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <MarkdownRenderer content={item.lastOutput} />
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'activity' && (
              <div className="flex flex-col gap-2">
                {item.calendarEventId && (
                  <button
                    type="button"
                    onClick={() => openCalendarTab()}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <CalendarClock size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm flex-1" style={{ color: 'var(--primary-text)' }}>
                      {t('pipelines.open_calendar_event')}
                    </span>
                    <ExternalLink size={12} style={{ color: 'var(--tertiary-text)' }} />
                  </button>
                )}
                {eventsLoading && (
                  <span className="text-xs py-2" style={{ color: 'var(--tertiary-text)' }}>
                    {t('pipelines.saving')}
                  </span>
                )}
                {!eventsLoading && events.length === 0 && (
                  <span className="text-xs py-2" style={{ color: 'var(--tertiary-text)' }}>
                    {t('pipelines.activity_empty')}
                  </span>
                )}
                {!eventsLoading &&
                  events.map((ev) => {
                    const { Icon, color } = eventVisual(ev.eventType);
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
                        className="flex items-start gap-2 rounded-md px-2 py-1.5"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      >
                        <Icon size={16} className="shrink-0 mt-0.5" style={{ color }} />
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          {richBody ? (
                            <div
                              className="text-sm max-h-56 overflow-y-auto"
                              style={{ color: 'var(--primary-text)' }}
                            >
                              <MarkdownRenderer content={richBody} />
                            </div>
                          ) : (
                            <span className="text-sm" style={{ color: 'var(--primary-text)' }}>
                              {ev.summary ?? ev.eventType}
                            </span>
                          )}
                          {actorLabel && (
                            <span
                              className="text-[11px]"
                              style={{ color: 'var(--tertiary-text)' }}
                            >
                              {actorLabel}
                            </span>
                          )}
                          {reportResourceId && (
                            <button
                              type="button"
                              onClick={() =>
                                setSummary({
                                  resourceId: reportResourceId,
                                  title: reportTitle,
                                  runId: ev.runId ?? undefined,
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-medium mt-0.5 self-start"
                              style={{ color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                              <ExternalLink size={11} />
                              {t('pipelines.view_summary')}
                            </button>
                          )}
                        </div>
                        <span
                          className="text-[11px] shrink-0"
                          style={{ color: 'var(--tertiary-text)' }}
                        >
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
      {summary && (
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
      )}
    </DomeModal>
  );
}
