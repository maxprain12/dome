'use client';

import { useEffect, useState } from 'react';
import {
  ExternalLink, Tag, GitBranch, CircleDot, CheckCircle2,
  Rocket, Milestone, Github, Pencil, MapPin, Clock, Workflow,
} from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { pipelinesClient } from '@/lib/pipelines/client';
import { useTabStore } from '@/lib/store/useTabStore';
import type { PipelineItem } from '@/lib/pipelines/types';

const GITHUB_CALENDAR_ID = 'github-dome';

function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function isGithubCalendarEvent(event: CalendarEvent | null | undefined): boolean {
  if (!event) return false;
  if (event.calendar_id === GITHUB_CALENDAR_ID) return true;
  return event.metadata?.source === 'github';
}

function pipelineItemIdOf(event: CalendarEvent | null | undefined): string | null {
  if (!event || event.metadata?.source !== 'pipeline') return null;
  const id = event.metadata?.pipelineItemId;
  return typeof id === 'string' ? id : null;
}

function githubEventUrl(event: CalendarEvent): string | null {
  const url = event.metadata?.url;
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

function githubEntityType(event: CalendarEvent): 'release' | 'milestone' | 'issue' | null {
  const m = event.metadata;
  if (m?.source !== 'github') return null;
  const t = m.entityType;
  if (t === 'release' || t === 'milestone' || t === 'issue') return t;
  // Fallback: old events without entityType (pre-bridge-metadata). Infer from shape.
  if (m?.tagName) return 'release';
  if (m?.milestoneTitle || m?.milestoneState) return 'milestone';
  if (m?.issueNumber != null) return 'issue';
  return null;
}

function githubMeta(event: CalendarEvent) {
  const m = event.metadata;
  return {
    repoFullName: typeof m?.repoFullName === 'string' ? m.repoFullName : null,
    tagName: typeof m?.tagName === 'string' ? m.tagName : null,
    releaseName: typeof m?.releaseName === 'string' ? m.releaseName : null,
    publishedAt: typeof m?.publishedAt === 'number' ? m.publishedAt : null,
    issueNumber: typeof m?.issueNumber === 'number' ? m.issueNumber : null,
    issueTitle: typeof m?.issueTitle === 'string' ? m.issueTitle : null,
    issueState: m?.issueState === 'closed' ? 'closed' as const : m?.issueState === 'open' ? 'open' as const : null,
    milestoneTitle: typeof m?.milestoneTitle === 'string' ? m.milestoneTitle : null,
    milestoneState: m?.milestoneState === 'closed' ? 'closed' as const : m?.milestoneState === 'open' ? 'open' as const : null,
    dueOn: typeof m?.dueOn === 'number' ? m.dueOn : null,
  };
}

/** Drop the auto-appended source footer so markdown body stays clean. */
function markdownBodyFromDescription(description: string | undefined): string {
  if (!description) return '';
  return description.replace(/\n\n— Fuente: GitHub(?: · .+)?$/u, '').trim();
}

function formatEventWhen(event: CalendarEvent, locale: string): string {
  const dueOn = typeof event.metadata?.dueOn === 'number' ? event.metadata.dueOn : null;
  const start = new Date(dueOn ?? event.start_at);
  if (event.all_day) {
    return start.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  return start.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });
}

interface MetaRowProps {
  label: string;
  children: React.ReactNode;
}
function MetaRow({ label, children }: MetaRowProps) {
  return (
    <>
      <dt
        className="text-[11px] font-medium uppercase tracking-wide pt-1.5"
        style={{ color: 'var(--dome-text-muted)' }}
      >
        {label}
      </dt>
      <dd className="text-sm pt-1.5 min-w-0" style={{ color: 'var(--dome-text)' }}>
        {children}
      </dd>
    </>
  );
}

interface PipelineDetail {
  item: PipelineItem;
  stageTitle: string | null;
  pipelineName: string | null;
}

/** Read-only detail view for a local (or pipeline-sourced) calendar event. */
function LocalEventDetail({
  event,
  locale,
  pipeline,
  onOpenPipeline,
}: {
  event: CalendarEvent;
  locale: string;
  pipeline: PipelineDetail | null;
  onOpenPipeline: () => void;
}) {
  const { t } = useTranslation();
  const todos = Array.isArray(pipeline?.item.data?.todos)
    ? (pipeline!.item.data!.todos as Array<{ done?: boolean }>)
    : [];
  const todoDone = todos.filter((td) => td?.done).length;
  const dataText =
    pipeline && typeof pipeline.item.data?.text === 'string' ? pipeline.item.data.text.trim() : '';

  return (
    <div className="flex flex-col gap-4">
      {pipeline && (
        <div
          className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: 'var(--accent)', color: 'var(--dome-on-accent, var(--base-text))' }}
        >
          <Workflow size={12} />
          {pipeline.pipelineName ? `${pipeline.pipelineName}` : t('tabs.pipelines')}
        </div>
      )}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0">
        <MetaRow label={t('calendarPage.when', { defaultValue: 'When' })}>
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} style={{ color: 'var(--dome-text-muted)' }} />
            {formatEventWhen(event, locale)}
          </span>
        </MetaRow>
        {event.location ? (
          <MetaRow label={t('calendarPage.location', { defaultValue: 'Location' })}>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={13} style={{ color: 'var(--dome-text-muted)' }} />
              {event.location}
            </span>
          </MetaRow>
        ) : null}
        {pipeline?.stageTitle ? (
          <MetaRow label={t('pipelines.stage_agent', { defaultValue: 'Stage' })}>
            {pipeline.stageTitle}
          </MetaRow>
        ) : null}
        {pipeline ? (
          <MetaRow label={t('calendarPage.status', { defaultValue: 'Status' })}>
            {t(`pipelines.status_${pipeline.item.execStatus}`, { defaultValue: pipeline.item.execStatus })}
          </MetaRow>
        ) : null}
        {pipeline && todos.length > 0 ? (
          <MetaRow label={t('pipelines.field_todos')}>
            {t('pipelines.todos_progress', { done: todoDone, total: todos.length })}
          </MetaRow>
        ) : null}
      </dl>

      {dataText ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
            {t('pipelines.field_description')}
          </span>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--dome-text)' }}>
            {dataText}
          </p>
        </div>
      ) : event.description ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
            {t('calendarPage.description', { defaultValue: 'Description' })}
          </span>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--dome-text)' }}>
            {event.description}
          </p>
        </div>
      ) : null}

      {pipeline?.item.lastOutput ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
            {t('pipelines.history')}
          </span>
          <p
            className="text-xs whitespace-pre-wrap max-h-32 overflow-y-auto rounded-md px-2 py-1.5"
            style={{ color: 'var(--dome-text-muted)', background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            {pipeline.item.lastOutput.slice(0, 600)}
          </p>
        </div>
      ) : null}

      {pipeline ? (
        <button
          type="button"
          onClick={onOpenPipeline}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium"
          style={{ color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <ExternalLink size={14} />
          {t('pipelines.open_in_pipelines', { defaultValue: 'Open in Pipelines' })}
        </button>
      ) : null}
    </div>
  );
}

interface GithubEventBodyProps {
  event: CalendarEvent;
  githubUrl: string | null;
}

function GithubEventBody({ event, githubUrl }: GithubEventBodyProps) {
  const { t, i18n } = useTranslation();
  const entityType = githubEntityType(event);
  const meta = githubMeta(event);
  const markdownBody = markdownBodyFromDescription(event.description);

  const typeBadge = (() => {
    if (!entityType) return null;
    if (entityType === 'release') {
      return { icon: <Rocket size={11} />, label: t('github.calendar_type_release'), tone: 'accent' as const };
    }
    if (entityType === 'milestone') {
      return { icon: <Milestone size={11} />, label: t('github.calendar_type_milestone'), tone: 'neutral' as const };
    }
    return { icon: <CircleDot size={11} />, label: t('github.calendar_type_issue'), tone: 'neutral' as const };
  })();

  const dateLabel = formatEventWhen(event, i18n.language);
  const showBody = entityType !== 'milestone'; // milestone already shows a rich dl below
  const dlBg = 'var(--dome-bg)';
  const dlBorder = '1px solid var(--dome-border)';

  // Repo label fallback: when the metadata is from an older sync (no repoFullName)
  // we still try to surface something useful so the header strip never collapses.
  // We derive a hint from the html_url hostname (github.com) plus the URL path's
  // owner/repo segments when available, otherwise we render a generic "GitHub".
  const repoFallback = (() => {
    if (meta.repoFullName) return null;
    if (githubUrl) {
      try {
        const u = new URL(githubUrl);
        const parts = u.pathname.replace(/^\/+/, '').split('/');
        if (parts.length >= 2 && parts[0] && parts[1]) {
          return `${parts[0]}/${parts[1]}`;
        }
      } catch {
        /* ignore */
      }
    }
    return t('github.calendar_repo_unknown', { defaultValue: 'GitHub' });
  })();

  // For release events, when we don't yet have a body (legacy sync), show a tiny
  // info row so the modal is not just a tag URL rendered as plain text.
  const releaseMinimalRow =
    entityType === 'release' && !markdownBody && (meta.tagName || meta.publishedAt != null);

  return (
    <div className="flex flex-col gap-4">
      {/* Header strip: type badge + repo + date */}
      <div
        className="flex flex-col gap-2 rounded-lg px-3 py-3"
        style={{ background: dlBg, border: dlBorder }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {typeBadge && (
            <span
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{
                background: typeBadge.tone === 'accent'
                  ? 'color-mix(in srgb, var(--dome-accent) 14%, transparent)'
                  : 'var(--dome-bg-hover)',
                color: typeBadge.tone === 'accent' ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                border: typeBadge.tone === 'accent'
                  ? '1px solid color-mix(in srgb, var(--dome-accent) 28%, transparent)'
                  : '1px solid var(--dome-border)',
              }}
            >
              {typeBadge.icon}
              {typeBadge.label}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 text-[12px]"
            style={{ color: 'var(--dome-text)' }}
            title={meta.repoFullName || repoFallback || undefined}
          >
            <Github size={12} style={{ color: 'var(--dome-text-muted)' }} />
            <span className="font-medium">{meta.repoFullName || repoFallback}</span>
          </span>
        </div>
        <span className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--dome-text-muted)' }}>
          {dateLabel}
          {event.all_day ? <span>· {t('calendarPage.all_day')}</span> : null}
        </span>
      </div>

      {/* Entity-specific fields */}
      {entityType === 'milestone' ? (
        <dl
          className="grid grid-cols-[max-content_1fr] gap-x-4 rounded-lg px-3 py-1"
          style={{ background: dlBg, border: dlBorder }}
        >
          {meta.milestoneTitle ? (
            <MetaRow label={t('github.calendar_milestone')}>{meta.milestoneTitle}</MetaRow>
          ) : null}
          <MetaRow label={t('github.calendar_state')}>
            <span
              className="inline-flex items-center gap-1"
              style={{ color: meta.milestoneState === 'closed' ? 'var(--success)' : 'var(--dome-text)' }}
            >
              {meta.milestoneState === 'closed' ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
              {meta.milestoneState === 'closed' ? t('github.calendar_completed') : t('github.calendar_pending')}
            </span>
          </MetaRow>
        </dl>
      ) : null}

      {entityType === 'release' ? (
        <dl
          className="grid grid-cols-[max-content_1fr] gap-x-4 rounded-lg px-3 py-1"
          style={{ background: dlBg, border: dlBorder }}
        >
          {meta.tagName ? (
            <MetaRow label={t('github.calendar_release_tag')}>
              <span className="inline-flex items-center gap-1 font-mono text-[13px]" style={{ color: 'var(--dome-accent)' }}>
                <Tag size={12} /> {meta.tagName}
              </span>
            </MetaRow>
          ) : null}
          {meta.releaseName && meta.releaseName !== meta.tagName ? (
            <MetaRow label={t('github.calendar_release_name')}>{meta.releaseName}</MetaRow>
          ) : null}
        </dl>
      ) : null}

      {entityType === 'issue' ? (
        <dl
          className="grid grid-cols-[max-content_1fr] gap-x-4 rounded-lg px-3 py-1"
          style={{ background: dlBg, border: dlBorder }}
        >
          {meta.issueNumber != null ? (
            <MetaRow label={t('github.calendar_issue_number')}>
              <span className="font-mono text-[13px]">#{meta.issueNumber}</span>
            </MetaRow>
          ) : null}
          {meta.issueTitle ? (
            <MetaRow label={t('github.calendar_issue_title')}>{meta.issueTitle}</MetaRow>
          ) : null}
          {meta.issueState ? (
            <MetaRow label={t('github.calendar_state')}>
              <span
                className="inline-flex items-center gap-1"
                style={{
                  color: meta.issueState === 'closed' ? 'var(--dome-text-muted)' : 'var(--success)',
                }}
              >
                {meta.issueState === 'closed' ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                {meta.issueState === 'closed' ? t('github.calendar_issue_state_closed') : t('github.calendar_issue_state_open')}
              </span>
            </MetaRow>
          ) : null}
        </dl>
      ) : null}

      {/* Minimal info row for releases without a body (legacy sync).
          Surfaces tag + published date as plain text so the modal is useful
          even before the next sync overwrites the event with a full body. */}
      {releaseMinimalRow ? (
        <div
          className="text-xs flex flex-col gap-1 rounded-lg px-3 py-2"
          style={{ background: dlBg, border: dlBorder, color: 'var(--dome-text-muted)' }}
        >
          {meta.tagName ? (
            <span className="inline-flex items-center gap-1">
              <Tag size={11} />
              <span className="font-mono" style={{ color: 'var(--dome-accent)' }}>{meta.tagName}</span>
            </span>
          ) : null}
          {meta.publishedAt != null ? (
            <span>
              {t('github.calendar_release_published', {
                defaultValue: 'Published',
              })}
              : {new Date(meta.publishedAt).toLocaleString(i18n.language)}
            </span>
          ) : null}
          {githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
              <ExternalLink size={11} /> {githubUrl}
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Source URL (legacy / non-classified events) */}
      {showBody && !meta.repoFullName && githubUrl && entityType !== 'release' ? (
        <p className="text-xs flex items-center gap-1" style={{ color: 'var(--dome-text-muted)' }}>
          <GitBranch size={11} />
          <a href={githubUrl} target="_blank" rel="noreferrer" className="underline">
            {githubUrl}
          </a>
        </p>
      ) : null}

      {/* Description body */}
      {markdownBody ? (
        <GithubMarkdownBody content={markdownBody} className="text-sm max-h-[min(50vh,420px)] overflow-y-auto" />
      ) : null}
    </div>
  );
}

interface EventModalProps {
  event?: CalendarEvent | null;
  initialDate?: Date;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description?: string;
    location?: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
  }) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
}

export default function EventModal({
  event,
  initialDate,
  onClose,
  onSave,
  onDelete,
}: EventModalProps) {
  const { t, i18n } = useTranslation();
  const githubEvent = isGithubCalendarEvent(event);
  const githubUrl = event ? githubEventUrl(event) : null;
  const pipelineItemId = pipelineItemIdOf(event);
  const openPipelinesTab = useTabStore((s) => s.openPipelinesTab);
  // Existing events open in a read-only detail view; new events go straight to
  // the edit form.
  const [editing, setEditing] = useState(!event);
  const [pipelineInfo, setPipelineInfo] = useState<PipelineDetail | null>(null);

  useEffect(() => {
    if (!pipelineItemId) {
      setPipelineInfo(null);
      return;
    }
    let cancelled = false;
    pipelinesClient
      .getItem(pipelineItemId)
      .then((d) => {
        if (!cancelled) setPipelineInfo(d);
      })
      .catch(() => {
        if (!cancelled) setPipelineInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pipelineItemId]);

  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [startAt, setStartAt] = useState(
    event ? toLocalISO(new Date(event.start_at)) : initialDate ? toLocalISO(initialDate) : toLocalISO(new Date())
  );
  const [endAt, setEndAt] = useState(
    event
      ? toLocalISO(new Date(event.end_at))
      : initialDate
        ? toLocalISO(new Date(initialDate.getTime() + 60 * 60 * 1000))
        : (() => {
            const d = new Date();
            d.setHours(d.getHours() + 1);
            return toLocalISO(d);
          })()
  );
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        all_day: allDay,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !onDelete) return;
    if (!confirm(t('calendarPage.delete_event_confirm'))) return;
    setDeleting(true);
    try {
      await onDelete(event.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  if (githubEvent && event) {
    return (
      <DomeModal
        open
        onClose={onClose}
        title={event.title}
        size="lg"
        headerActions={
          githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noreferrer" title={t('github.open_on_github')} style={{ color: 'var(--dome-text-muted)' }}>
              <ExternalLink size={16} />
            </a>
          ) : null
        }
        footer={
          <div className="flex items-center justify-end w-full">
            {githubUrl ? (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm inline-flex items-center gap-1.5 mr-auto"
                style={{ color: 'var(--dome-accent)' }}
              >
                <ExternalLink size={14} />
                {t('github.calendar_view_on_github')}
              </a>
            ) : null}
            <button type="button" onClick={onClose} className="h-pill-btn primary">
              {t('common.close', { defaultValue: 'Cerrar' })}
            </button>
          </div>
        }
      >
        <GithubEventBody event={event} githubUrl={githubUrl} />
      </DomeModal>
    );
  }

  // Read-only detail view for existing (non-GitHub) events. "Edit" switches to
  // the form; pipeline-sourced events show extended, relevant info.
  if (event && !editing) {
    return (
      <DomeModal
        open
        onClose={onClose}
        title={event.title}
        size="md"
        footer={
          <>
            {onDelete ? (
              <DomeButton
                variant="ghost"
                size="sm"
                onClick={() => void handleDelete()}
                loading={deleting}
                style={{ color: 'var(--home-rose)' }}
              >
                {t('common.delete')}
              </DomeButton>
            ) : null}
            <div style={{ flex: 1 }} />
            <DomeButton variant="outline" size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil className="size-4" />}>
              {t('common.edit', { defaultValue: 'Edit' })}
            </DomeButton>
            <DomeButton variant="primary" size="sm" onClick={onClose}>
              {t('common.close', { defaultValue: 'Close' })}
            </DomeButton>
          </>
        }
      >
        <LocalEventDetail
          event={event}
          locale={i18n.language}
          pipeline={pipelineInfo}
          onOpenPipeline={() => {
            openPipelinesTab();
            onClose();
          }}
        />
      </DomeModal>
    );
  }

  return (
    <DomeModal
      open
      onClose={onClose}
      title={event ? t('calendarPage.edit_event') : t('calendarPage.new_event')}
      size="md"
      footer={
        <>
          {event && onDelete ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="h-pill-btn mr-auto"
              style={{ color: 'var(--home-rose)' }}
            >
              {deleting ? t('calendarPage.deleting') : t('common.delete')}
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="h-pill-btn">
            {t('common.cancel')}
          </button>
          <button type="submit" form="event-modal-form" disabled={saving || !title.trim()} className="h-pill-btn primary">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="event-modal-form" onSubmit={handleSubmit} className="c-calendar-modal-form">
          <div>
            <label htmlFor="event-modal-title-input" className="c-calendar-modal-label">
              {t('common.name')}
            </label>
            <input
              id="event-modal-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="c-calendar-modal-field"
              placeholder={t('calendarPage.event_title_placeholder')}
              required
            />
          </div>

          <div>
            <label htmlFor="event-modal-location" className="c-calendar-modal-label">
              {t('common.location')}
            </label>
            <input
              id="event-modal-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="c-calendar-modal-field"
              placeholder={t('calendarPage.event_location_placeholder')}
            />
          </div>

          <label className="c-calendar-modal-check">
            <input type="checkbox" id="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            {t('calendarPage.all_day')}
          </label>

          {!allDay ? (
            <>
              <div>
                <label htmlFor="event-modal-start-dt" className="c-calendar-modal-label">
                  {t('calendarPage.event_start')}
                </label>
                <input
                  id="event-modal-start-dt"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="c-calendar-modal-field"
                />
              </div>
              <div>
                <label htmlFor="event-modal-end-dt" className="c-calendar-modal-label">
                  {t('calendarPage.event_end')}
                </label>
                <input
                  id="event-modal-end-dt"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="c-calendar-modal-field"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="event-modal-start-date" className="c-calendar-modal-label">
                  {t('calendarPage.start_date')}
                </label>
                <input
                  id="event-modal-start-date"
                  type="date"
                  value={startAt.slice(0, 10)}
                  onChange={(e) => setStartAt(`${e.target.value}T00:00`)}
                  className="c-calendar-modal-field"
                />
              </div>
              <div>
                <label htmlFor="event-modal-end-date" className="c-calendar-modal-label">
                  {t('calendarPage.end_date')}
                </label>
                <input
                  id="event-modal-end-date"
                  type="date"
                  value={endAt.slice(0, 10)}
                  onChange={(e) => setEndAt(`${e.target.value}T23:59`)}
                  className="c-calendar-modal-field"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="event-modal-description" className="c-calendar-modal-label">
              {t('common.description')}
            </label>
            <textarea
              id="event-modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="c-calendar-modal-field resize-none"
              placeholder={t('calendarPage.event_notes_placeholder')}
            />
          </div>

      </form>
    </DomeModal>
  );
}
