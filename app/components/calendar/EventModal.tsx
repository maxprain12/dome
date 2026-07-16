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
  Calendar03Icon,
} from '@hugeicons/core-free-icons';
import { DatePicker } from '@/components/shared/DatePicker';
import { DateTimePicker } from '@/components/shared/DateTimePicker';
import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';
import ResourcePickerModal from '@/components/editor/ResourcePickerModal';
import { EventColorPill, EventDetailChrome } from '@/components/calendar/EventDetailChrome';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { pipelinesClient } from '@/lib/pipelines/client';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import type { PipelineItem } from '@/lib/pipelines/types';
import type { Resource } from '@/types';
import { cn } from '@/lib/utils';

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

/** Round minutes down to a 5-minute step (matches DateTimePicker options). */
function snapMinutes(d: Date): Date {
  const next = new Date(d);
  next.setMinutes(Math.floor(next.getMinutes() / 5) * 5, 0, 0);
  return next;
}

function toLocalISO(d: Date) {
  const snapped = snapMinutes(d);
  const y = snapped.getFullYear();
  const m = String(snapped.getMonth() + 1).padStart(2, '0');
  const day = String(snapped.getDate()).padStart(2, '0');
  const h = String(snapped.getHours()).padStart(2, '0');
  const min = String(snapped.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Parse `yyyy-MM-ddTHH:mm` as local wall time → ISO UTC (avoids Invalid Date / TZ quirks). */
function localDateTimeToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) {
      throw new Error(`Invalid datetime: ${value}`);
    }
    return fallback.toISOString();
  }
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const h = Number(match[4]);
  const mi = Number(match[5]);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

function localDateTimeMs(value: string): number {
  return new Date(localDateTimeToIso(value)).getTime();
}

/** Default timed slot when opening “new event” from a calendar day (midnight). */
function defaultTimedRangeFromDay(day: Date): { start: string; end: string } {
  const start = new Date(day);
  if (start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0) {
    start.setHours(9, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: toLocalISO(start), end: toLocalISO(end) };
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
      <div className="flex flex-wrap gap-1.5">
        {event.all_day ? (
          <Badge variant="outline" className="font-normal">{t('calendarPage.all_day')}</Badge>
        ) : null}
        {pipeline?.stageTitle ? (
          <Badge variant="secondary" className="font-normal">{pipeline.stageTitle}</Badge>
        ) : null}
        {pipeline ? (
          <Badge variant="outline" className="font-normal">
            {t(`pipelines.status_${pipeline.item.execStatus}`, { defaultValue: pipeline.item.execStatus })}
          </Badge>
        ) : null}
        {pipeline && todos.length > 0 ? (
          <Badge variant="outline" className="font-normal">
            {t('pipelines.todos_progress', { done: todoDone, total: todos.length })}
          </Badge>
        ) : null}
        {event.location ? (
          <Badge variant="secondary" className="max-w-full gap-1 font-normal">
            <HugeiconsIcon icon={MapPinIcon} className="size-3" />
            <span className="truncate">{event.location}</span>
          </Badge>
        ) : null}
      </div>

      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <HugeiconsIcon icon={Clock01Icon} className="size-3.5 shrink-0" />
        {formatEventWhen(event, locale)}
      </p>

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
      return { icon: <HugeiconsIcon icon={RocketIcon} />, label: t('github.calendar_type_release'), tone: 'accent' as const };
    }
    if (entityType === 'milestone') {
      return { icon: <HugeiconsIcon icon={Flag02Icon} />, label: t('github.calendar_type_milestone'), tone: 'neutral' as const };
    }
    return { icon: <HugeiconsIcon icon={CircleDotIcon} />, label: t('github.calendar_type_issue'), tone: 'neutral' as const };
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

  const githubAccent = event.calendar_color ?? 'var(--primary)';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {typeBadge ? (
          <EventColorPill color={typeBadge.tone === 'accent' ? githubAccent : undefined}>
            {typeBadge.icon}
            <span className="truncate">{typeBadge.label}</span>
          </EventColorPill>
        ) : null}
        {(meta.repoFullName || repoFallback) ? (
          <Badge variant="secondary" className="h-auto max-w-full gap-1 overflow-visible py-0.5 font-normal leading-none [&_svg]:size-2.5">
            <HugeiconsIcon icon={GithubIcon} />
            <span className="truncate">{meta.repoFullName || repoFallback}</span>
          </Badge>
        ) : null}
        {event.all_day ? (
          <Badge variant="outline" className="h-auto overflow-visible py-0.5 font-normal leading-none">
            {t('calendarPage.all_day')}
          </Badge>
        ) : null}
        {meta.tagName ? (
          <Badge variant="outline" className="h-auto max-w-full gap-1 overflow-visible py-0.5 font-mono font-normal leading-none [&_svg]:size-2.5">
            <HugeiconsIcon icon={Tag01Icon} />
            <span className="truncate">{meta.tagName}</span>
          </Badge>
        ) : null}
        {meta.issueNumber != null ? (
          <Badge variant="outline" className="h-auto overflow-visible py-0.5 font-mono font-normal leading-none">
            #{meta.issueNumber}
          </Badge>
        ) : null}
        {meta.issueState ? (
          <Badge
            variant={meta.issueState === 'closed' ? 'secondary' : 'outline'}
            className={cn(
              'h-auto gap-1 overflow-visible py-0.5 font-normal leading-none [&_svg]:size-2.5',
              meta.issueState !== 'closed' && 'text-(--success)',
            )}
          >
            {meta.issueState === 'closed' ? (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} />
            ) : (
              <HugeiconsIcon icon={CircleDotIcon} />
            )}
            {meta.issueState === 'closed'
              ? t('github.calendar_issue_state_closed')
              : t('github.calendar_issue_state_open')}
          </Badge>
        ) : null}
        {meta.milestoneState ? (
          <Badge
            variant={meta.milestoneState === 'closed' ? 'secondary' : 'outline'}
            className={cn(
              'h-auto gap-1 overflow-visible py-0.5 font-normal leading-none [&_svg]:size-2.5',
              meta.milestoneState === 'closed' && 'text-(--success)',
            )}
          >
            {meta.milestoneState === 'closed' ? (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} />
            ) : (
              <HugeiconsIcon icon={CircleDotIcon} />
            )}
            {meta.milestoneState === 'closed'
              ? t('github.calendar_completed')
              : t('github.calendar_pending')}
          </Badge>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{dateLabel}</p>

      {entityType === 'milestone' && meta.milestoneTitle ? (
        <p className="text-sm font-medium">{meta.milestoneTitle}</p>
      ) : null}

      {entityType === 'release' && meta.releaseName && meta.releaseName !== meta.tagName ? (
        <p className="text-sm">{meta.releaseName}</p>
      ) : null}

      {entityType === 'issue' && meta.issueTitle ? (
        <p className="text-sm font-medium">{meta.issueTitle}</p>
      ) : null}

      {releaseMinimalRow && meta.publishedAt != null ? (
        <p className="text-xs text-muted-foreground">
          {t('github.calendar_release_published', { defaultValue: 'Published' })}
          : {new Date(meta.publishedAt).toLocaleString(i18n.language)}
        </p>
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
        <GithubMarkdownBody
          content={markdownBody}
          className="min-w-0 max-h-[min(40vh,360px)] overflow-x-hidden overflow-y-auto break-words text-sm [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_img]:max-w-full"
        />
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
  const [startAt, setStartAt] = useState(() => {
    if (event) return toLocalISO(new Date(event.start_at));
    if (initialDate) return defaultTimedRangeFromDay(initialDate).start;
    return toLocalISO(new Date());
  });
  const [endAt, setEndAt] = useState(() => {
    if (event) return toLocalISO(new Date(event.end_at));
    if (initialDate) return defaultTimedRangeFromDay(initialDate).end;
    return toLocalISO(new Date(Date.now() + 60 * 60 * 1000));
  });
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateStartAt = (next: string) => {
    setStartAt(next);
    try {
      const startMs = localDateTimeMs(next);
      const endMs = localDateTimeMs(endAt);
      if (endMs <= startMs) {
        setEndAt(toLocalISO(new Date(startMs + 60 * 60 * 1000)));
      }
    } catch {
      /* ignore parse while typing */
    }
  };

  const updateEndAt = (next: string) => {
    setEndAt(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      let startIso: string;
      let endIso: string;
      if (allDay) {
        startIso = localDateTimeToIso(`${startAt.slice(0, 10)}T00:00`);
        endIso = localDateTimeToIso(`${endAt.slice(0, 10)}T23:59`);
      } else {
        startIso = localDateTimeToIso(startAt);
        endIso = localDateTimeToIso(endAt);
        if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
          endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
        }
      }
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start_at: startIso,
        end_at: endIso,
        all_day: allDay,
        metadata: { resourceIds },
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast('error', message);
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

  const accent = event?.calendar_color ?? 'var(--primary)';

  if (githubEvent && event) {
    return (
      <EventDetailChrome
        onClose={onClose}
        accent={accent}
        accentLabel={event.calendar_title ?? 'GitHub'}
        title={event.title}
        description={formatEventWhen(event, i18n.language)}
        icon={<HugeiconsIcon icon={GithubIcon} />}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                openGitHubTab();
                onClose();
              }}
            >
              <HugeiconsIcon icon={GithubIcon} className="size-3.5" />
              {t('calendarPage.open_in_github')}
            </Button>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
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
          </>
        }
      >
        <GithubEventBody event={event} githubUrl={githubUrl} />
      </EventDetailChrome>
    );
  }

  // Read-only detail view for existing (non-GitHub) events. "Edit" switches to
  // the form; pipeline-sourced events show extended, relevant info.
  if (event && !editing) {
    const accentLabel =
      event.calendar_title
      ?? (pipelineInfo
        ? (pipelineInfo.pipelineName ?? t('tabs.pipelines'))
        : isSocialEvent(event)
          ? t('tabs.social')
          : 'Local');
    const headerIcon = pipelineInfo
      ? <HugeiconsIcon icon={WorkflowSquare01Icon} />
      : isSocialEvent(event)
        ? <HugeiconsIcon icon={Share08Icon} />
        : <HugeiconsIcon icon={Calendar03Icon} />;

    return (
      <EventDetailChrome
        onClose={onClose}
        accent={accent}
        accentLabel={accentLabel}
        title={event.title}
        description={formatEventWhen(event, i18n.language)}
        icon={headerIcon}
        footer={
          <>
            {onDelete ? (
              <DeleteEventAction deleting={deleting} onConfirm={() => void handleDelete()} />
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(true)} size="sm">
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
                {t('common.edit', { defaultValue: 'Edit' })}
              </Button>
              <Button onClick={onClose} size="sm">
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
            </div>
          </>
        }
      >
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
      </EventDetailChrome>
    );
  }

  return (
    <>
      <EventDetailChrome
        onClose={onClose}
        accent={accent}
        accentLabel={
          event?.calendar_title
          ?? (event ? 'Local' : t('calendarPage.new_event_short'))
        }
        title={event ? t('calendarPage.edit_event') : t('calendarPage.new_event')}
        description={event ? formatEventWhen(event, i18n.language) : undefined}
        icon={<HugeiconsIcon icon={Calendar03Icon} />}
        badges={
          allDay ? (
            <Badge variant="outline" className="font-normal">
              {t('calendarPage.all_day')}
            </Badge>
          ) : undefined
        }
        footer={
          <>
            {event && onDelete ? (
              <DeleteEventAction deleting={deleting} onConfirm={() => void handleDelete()} />
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
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
            </div>
          </>
        }
      >
        <form id="event-modal-form" onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <Field className="min-w-0 gap-1.5">
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
              className="min-w-0"
            />
          </Field>

          <Field className="min-w-0 gap-1.5">
            <FieldLabel htmlFor="event-modal-location" className="text-xs">
              {t('common.location')}
            </FieldLabel>
            <Input
              id="event-modal-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('calendarPage.event_location_placeholder')}
              className="min-w-0"
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
                onChange={updateStartAt}
              />
              <DateTimePicker
                id="event-modal-end-dt"
                label={t('calendarPage.event_end')}
                value={endAt}
                onChange={updateEndAt}
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
      </EventDetailChrome>
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
    </>
  );
}
