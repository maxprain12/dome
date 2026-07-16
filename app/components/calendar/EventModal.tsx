'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Cancel01Icon,
  ExternalLinkIcon,
  Tag01Icon,
  GitBranchIcon,
  CircleDotIcon,
  CheckmarkCircle02Icon,
  RocketIcon,
  Flag02Icon,
  GithubIcon,
  PencilEdit02Icon,
  MapPinIcon,
  Clock01Icon,
  WorkflowSquare01Icon,
  Share08Icon,
} from '@hugeicons/core-free-icons';
import { DatePicker } from '@/components/shared/DatePicker';
import { DateTimePicker } from '@/components/shared/DateTimePicker';
import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';
import ResourcePickerModal from '@/components/editor/ResourcePickerModal';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { pipelinesClient } from '@/lib/pipelines/client';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import type { PipelineItem } from '@/lib/pipelines/types';
import type { Resource } from '@/types';
import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function resourceIdsFromMeta(meta: Record<string, unknown> | undefined): string[] {
  const raw = meta?.resourceIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function isSocialEvent(event: CalendarEvent | null | undefined): boolean {
  return event?.metadata?.source === 'social';
}

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
        className="text-[11px] font-medium uppercase tracking-wide pt-1.5 text-muted-foreground"
      >
        {label}
      </dt>
      <dd className="text-sm pt-1.5 min-w-0 text-foreground">
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

/** Delete button with shadcn AlertDialog confirmation (replaces window.confirm). */
function DeleteEventAction({
  deleting,
  onConfirm,
}: {
  deleting: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm" className="mr-auto text-destructive" loading={deleting}>
            {t('common.delete')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
          <AlertDialogDescription>{t('calendarPage.delete_event_confirm')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('common.delete')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LinkedResourcesSection({
  resourceIds,
  titles,
  editable,
  onOpen,
  onRemove,
  onAdd,
}: {
  resourceIds: string[];
  titles: Record<string, string>;
  editable?: boolean;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
}) {
  const { t } = useTranslation();
  if (resourceIds.length === 0 && !editable) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('calendarPage.linked_resources')}
      </span>
      {resourceIds.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('calendarPage.linked_resources_empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {resourceIds.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 pr-1 font-normal">
              <button type="button" className="truncate max-w-40 text-left" onClick={() => onOpen(id)}>
                {titles[id] ?? id.slice(0, 8)}
              </button>
              {onRemove ? (
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={t('common.remove')}
                  onClick={() => onRemove(id)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      )}
      {onAdd ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAdd}>
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          {t('calendarPage.link_resource')}
        </Button>
      ) : null}
    </div>
  );
}

/** Read-only detail view for a local (or pipeline-sourced) calendar event. */
function LocalEventDetail({
  event,
  locale,
  pipeline,
  linkedTitles,
  onOpenPipeline,
  onOpenSocial,
  onOpenResource,
}: {
  event: CalendarEvent;
  locale: string;
  pipeline: PipelineDetail | null;
  linkedTitles: Record<string, string>;
  onOpenPipeline: () => void;
  onOpenSocial: () => void;
  onOpenResource: (id: string) => void;
}) {
  const { t } = useTranslation();
  const todos = Array.isArray(pipeline?.item.data?.todos)
    ? (pipeline!.item.data!.todos as Array<{ done?: boolean }>)
    : [];
  const todoDone = todos.filter((td) => td?.done).length;
  const dataText =
    pipeline && typeof pipeline.item.data?.text === 'string' ? pipeline.item.data.text.trim() : '';
  const linkedIds = resourceIdsFromMeta(event.metadata);
  const social = isSocialEvent(event);

  return (
    <div className="flex flex-col gap-4">
      {pipeline && (
        <Badge className="self-start">
          <HugeiconsIcon icon={WorkflowSquare01Icon} className="size-3" />
          {pipeline.pipelineName ?? t('tabs.pipelines')}
        </Badge>
      )}
      {social ? (
        <Badge className="self-start" variant="secondary">
          <HugeiconsIcon icon={Share08Icon} className="size-3" />
          {t('tabs.social')}
        </Badge>
      ) : null}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0">
        <MetaRow label={t('calendarPage.when', { defaultValue: 'When' })}>
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={Clock01Icon} className="size-3.5 text-muted-foreground" />
            {formatEventWhen(event, locale)}
          </span>
        </MetaRow>
        {event.location ? (
          <MetaRow label={t('calendarPage.location', { defaultValue: 'Location' })}>
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon icon={MapPinIcon} className="size-3.5 text-muted-foreground" />
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
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('pipelines.field_description')}
          </span>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {dataText}
          </p>
        </div>
      ) : event.description ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('calendarPage.description', { defaultValue: 'Description' })}
          </span>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {event.description}
          </p>
        </div>
      ) : null}

      {pipeline?.item.lastOutput ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('pipelines.history')}
          </span>
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background px-2 py-1.5 text-xs text-muted-foreground">
            {pipeline.item.lastOutput.slice(0, 600)}
          </p>
        </div>
      ) : null}

      <LinkedResourcesSection
        resourceIds={linkedIds}
        titles={linkedTitles}
        onOpen={onOpenResource}
      />

      <div className="flex flex-wrap gap-2">
        {pipeline ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenPipeline}>
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-3.5" />
            {t('pipelines.open_in_pipelines', { defaultValue: 'Open in Pipelines' })}
          </Button>
        ) : null}
        {social ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenSocial}>
            <HugeiconsIcon icon={Share08Icon} className="size-3.5" />
            {t('calendarPage.open_in_social')}
          </Button>
        ) : null}
      </div>
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
      return { icon: <HugeiconsIcon icon={RocketIcon} className="size-3" />, label: t('github.calendar_type_release'), tone: 'accent' as const };
    }
    if (entityType === 'milestone') {
      return { icon: <HugeiconsIcon icon={Flag02Icon} className="size-3" />, label: t('github.calendar_type_milestone'), tone: 'neutral' as const };
    }
    return { icon: <HugeiconsIcon icon={CircleDotIcon} className="size-3" />, label: t('github.calendar_type_issue'), tone: 'neutral' as const };
  })();

  const dateLabel = formatEventWhen(event, i18n.language);
  const showBody = entityType !== 'milestone'; // milestone already shows a rich dl below

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
      <div className="flex flex-col gap-2 rounded-lg border bg-background px-3 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {typeBadge && (
            <Badge
              variant="outline"
              className={
                typeBadge.tone === 'accent'
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'text-muted-foreground'
              }
            >
              {typeBadge.icon}
              {typeBadge.label}
            </Badge>
          )}
          <span
            className="inline-flex items-center gap-1 text-[12px] text-foreground"
            title={meta.repoFullName || repoFallback || undefined}
          >
            <HugeiconsIcon icon={GithubIcon} className="size-3 text-muted-foreground" />
            <span className="font-medium">{meta.repoFullName || repoFallback}</span>
          </span>
        </div>
        <span className="text-xs inline-flex items-center gap-1.5 text-muted-foreground">
          {dateLabel}
          {event.all_day ? <span>· {t('calendarPage.all_day')}</span> : null}
        </span>
      </div>

      {/* Entity-specific fields */}
      {entityType === 'milestone' ? (
        <dl
          className="grid grid-cols-[max-content_1fr] gap-x-4 rounded-lg border bg-background px-3 py-1"
        >
          {meta.milestoneTitle ? (
            <MetaRow label={t('github.calendar_milestone')}>{meta.milestoneTitle}</MetaRow>
          ) : null}
          <MetaRow label={t('github.calendar_state')}>
            <span
              className={cn(
                'inline-flex items-center gap-1',
                meta.milestoneState === 'closed' && 'text-(--success)',
              )}
            >
              {meta.milestoneState === 'closed' ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" /> : <HugeiconsIcon icon={CircleDotIcon} className="size-3.5" />}
              {meta.milestoneState === 'closed' ? t('github.calendar_completed') : t('github.calendar_pending')}
            </span>
          </MetaRow>
        </dl>
      ) : null}

      {entityType === 'release' ? (
        <dl
          className="grid grid-cols-[max-content_1fr] gap-x-4 rounded-lg border bg-background px-3 py-1"
        >
          {meta.tagName ? (
            <MetaRow label={t('github.calendar_release_tag')}>
              <span className="inline-flex items-center gap-1 font-mono text-[13px] text-primary">
                <HugeiconsIcon icon={Tag01Icon} className="size-3" /> {meta.tagName}
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
          className="grid grid-cols-[max-content_1fr] gap-x-4 rounded-lg border bg-background px-3 py-1"
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
                className={cn(
                  'inline-flex items-center gap-1',
                  meta.issueState === 'closed' ? 'text-muted-foreground' : 'text-(--success)',
                )}
              >
                {meta.issueState === 'closed' ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" /> : <HugeiconsIcon icon={CircleDotIcon} className="size-3.5" />}
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
          className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground"
        >
          {meta.tagName ? (
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon icon={Tag01Icon} className="size-3" />
              <span className="font-mono text-primary">{meta.tagName}</span>
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
              <HugeiconsIcon icon={ExternalLinkIcon} className="size-3" /> {githubUrl}
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Source URL (legacy / non-classified events) */}
      {showBody && !meta.repoFullName && githubUrl && entityType !== 'release' ? (
        <p className="text-xs flex items-center gap-1 text-muted-foreground">
          <HugeiconsIcon icon={GitBranchIcon} className="size-3" />
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
    metadata?: Record<string, unknown>;
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
  const openGitHubTab = useTabStore((s) => s.openGitHubTab);
  const openSocialTab = useTabStore((s) => s.openSocialTab);
  const openResourceTab = useTabStore((s) => s.openResourceTab);
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  // Existing events open in a read-only detail view; new events go straight to
  // the edit form.
  const [editing, setEditing] = useState(!event);
  const [pipelineInfo, setPipelineInfo] = useState<PipelineDetail | null>(null);
  const [resourceIds, setResourceIds] = useState(() => resourceIdsFromMeta(event?.metadata));
  const [linkedTitles, setLinkedTitles] = useState<Record<string, string>>({});
  const [linkedTypes, setLinkedTypes] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const prevPipelineItemIdRef = useRef(pipelineItemId);
  if (pipelineItemId !== prevPipelineItemIdRef.current) {
    prevPipelineItemIdRef.current = pipelineItemId;
    if (!pipelineItemId) setPipelineInfo(null);
  }

  useEffect(() => {
    if (!pipelineItemId) {
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

  useEffect(() => {
    let cancelled = false;
    const loadTitles = async () => {
      if (resourceIds.length === 0) {
        setLinkedTitles({});
        setLinkedTypes({});
        return;
      }
      const api = window.electron?.db?.resources;
      if (!api?.getById) return;
      const nextTitles: Record<string, string> = {};
      const nextTypes: Record<string, string> = {};
      await Promise.all(
        resourceIds.map(async (id) => {
          try {
            const res = await api.getById(id);
            if (res?.success && res.data) {
              if (res.data.title) nextTitles[id] = String(res.data.title);
              if (res.data.type) nextTypes[id] = String(res.data.type);
            }
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) {
        setLinkedTitles(nextTitles);
        setLinkedTypes(nextTypes);
      }
    };
    void loadTitles();
    return () => {
      cancelled = true;
    };
  }, [resourceIds]);

  const openLinkedResource = useCallback(
    (id: string) => {
      const title = linkedTitles[id] ?? t('workspace.untitled');
      const type = linkedTypes[id] ?? 'file';
      openResourceTab(id, type, title, projectId);
      onClose();
    },
    [linkedTitles, linkedTypes, onClose, openResourceTab, projectId, t],
  );

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
        metadata: { resourceIds },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !onDelete) return;
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
      <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3 pr-12">
            <DialogTitle className="truncate">{event.title}</DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              {githubUrl ? (
                <a href={githubUrl} target="_blank" rel="noreferrer" title={t('github.open_on_github')} className="text-muted-foreground">
                  <HugeiconsIcon icon={ExternalLinkIcon} className="size-4" />
                </a>
              ) : null}
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <GithubEventBody event={event} githubUrl={githubUrl} />
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-auto"
                onClick={() => {
                  openGitHubTab();
                  onClose();
                }}
              >
                <HugeiconsIcon icon={GithubIcon} className="size-3.5" />
                {t('calendarPage.open_in_github')}
              </Button>
              {githubUrl ? (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary"
                >
                  <HugeiconsIcon icon={ExternalLinkIcon} className="size-3.5" />
                  {t('github.calendar_view_on_github')}
                </a>
              ) : null}
              <Button type="button" size="sm" onClick={onClose}>
                {t('common.close', { defaultValue: 'Cerrar' })}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Read-only detail view for existing (non-GitHub) events. "Edit" switches to
  // the form; pipeline-sourced events show extended, relevant info.
  if (event && !editing) {
    return (
      <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3">
            <DialogTitle className="truncate">{event.title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <LocalEventDetail
              event={event}
              locale={i18n.language}
              pipeline={pipelineInfo}
              linkedTitles={linkedTitles}
              onOpenPipeline={() => {
                openPipelinesTab();
                onClose();
              }}
              onOpenSocial={() => {
                openSocialTab();
                onClose();
              }}
              onOpenResource={openLinkedResource}
            />
          </div>
          <DialogFooter className="border-t px-4 py-3">
            {onDelete ? (
              <DeleteEventAction deleting={deleting} onConfirm={() => void handleDelete()} />
            ) : null}
            <Button variant="outline" onClick={() => setEditing(true)} size="sm">
              <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
              {t('common.edit', { defaultValue: 'Edit' })}
            </Button>
            <Button onClick={onClose} size="sm">
              {t('common.close', { defaultValue: 'Close' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{event ? t('calendarPage.edit_event') : t('calendarPage.new_event')}</DialogTitle></div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <form id="event-modal-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="event-modal-title-input" className="text-xs">
              {t('common.name')}
            </FieldLabel>
            <Input
              id="event-modal-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('calendarPage.event_title_placeholder')}
              required
            />
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="event-modal-location" className="text-xs">
              {t('common.location')}
            </FieldLabel>
            <Input
              id="event-modal-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('calendarPage.event_location_placeholder')}
            />
          </Field>

          <FieldLabel className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            {t('calendarPage.all_day')}
          </FieldLabel>

          {!allDay ? (
            <>
              <DateTimePicker
                id="event-modal-start-dt"
                label={t('calendarPage.event_start')}
                value={startAt}
                onChange={setStartAt}
              />
              <DateTimePicker
                id="event-modal-end-dt"
                label={t('calendarPage.event_end')}
                value={endAt}
                onChange={setEndAt}
              />
            </>
          ) : (
            <>
              <DatePicker
                id="event-modal-start-date"
                label={t('calendarPage.start_date')}
                value={startAt.slice(0, 10)}
                onChange={(d) => setStartAt(`${d}T00:00`)}
                clearable={false}
              />
              <DatePicker
                id="event-modal-end-date"
                label={t('calendarPage.end_date')}
                value={endAt.slice(0, 10)}
                onChange={(d) => setEndAt(`${d}T23:59`)}
                clearable={false}
              />
            </>
          )}

          <Field className="gap-1.5">
            <FieldLabel htmlFor="event-modal-description" className="text-xs">
              {t('common.description')}
            </FieldLabel>
            <Textarea
              id="event-modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
              placeholder={t('calendarPage.event_notes_placeholder')}
            />
          </Field>

          <LinkedResourcesSection
            resourceIds={resourceIds}
            titles={linkedTitles}
            editable
            onOpen={openLinkedResource}
            onRemove={(id) => setResourceIds((prev) => prev.filter((x) => x !== id))}
            onAdd={() => setPickerOpen(true)}
          />

      </form>
    </div>
    <DialogFooter className="border-t px-4 py-3">
          {event && onDelete ? (
            <DeleteEventAction deleting={deleting} onConfirm={() => void handleDelete()} />
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="event-modal-form"
            size="sm"
            disabled={saving || !title.trim()}
            loading={saving}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
        <ResourcePickerModal
          opened={pickerOpen}
          onClose={() => setPickerOpen(false)}
          projectId={projectId}
          title={t('calendarPage.link_resource')}
          onSelect={(resource: Resource) => {
            setResourceIds((prev) => (prev.includes(resource.id) ? prev : [...prev, resource.id]));
            setLinkedTitles((prev) => ({ ...prev, [resource.id]: resource.title }));
            setLinkedTypes((prev) => ({ ...prev, [resource.id]: resource.type }));
            setPickerOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
