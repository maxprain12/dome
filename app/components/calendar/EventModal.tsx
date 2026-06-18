'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';

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

function githubEventUrl(event: CalendarEvent): string | null {
  const url = event.metadata?.url;
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
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

function githubMilestoneMeta(event: CalendarEvent) {
  if (event.metadata?.entityType !== 'milestone') return null;
  return {
    repoFullName: typeof event.metadata.repoFullName === 'string' ? event.metadata.repoFullName : null,
    milestoneTitle: typeof event.metadata.milestoneTitle === 'string' ? event.metadata.milestoneTitle : null,
    dueOn: typeof event.metadata.dueOn === 'number' ? event.metadata.dueOn : null,
    state: event.metadata.milestoneState === 'closed' ? 'closed' as const : 'open' as const,
  };
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
  const milestoneMeta = event ? githubMilestoneMeta(event) : null;
  const markdownBody = markdownBodyFromDescription(event?.description);

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
            <button type="button" onClick={onClose} className="h-pill-btn primary">
              {t('common.close', { defaultValue: 'Cerrar' })}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {milestoneMeta ? (
            <dl
              className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm rounded-lg px-3 py-3"
              style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
            >
              {milestoneMeta.repoFullName ? (
                <>
                  <dt className="font-medium" style={{ color: 'var(--dome-text-muted)' }}>{t('github.calendar_repo')}</dt>
                  <dd style={{ color: 'var(--dome-text)' }}>{milestoneMeta.repoFullName}</dd>
                </>
              ) : null}
              {milestoneMeta.milestoneTitle ? (
                <>
                  <dt className="font-medium" style={{ color: 'var(--dome-text-muted)' }}>{t('github.calendar_milestone')}</dt>
                  <dd style={{ color: 'var(--dome-text)' }}>{milestoneMeta.milestoneTitle}</dd>
                </>
              ) : null}
              {milestoneMeta.dueOn ? (
                <>
                  <dt className="font-medium" style={{ color: 'var(--dome-text-muted)' }}>{t('github.calendar_due_date')}</dt>
                  <dd style={{ color: 'var(--dome-text)' }}>
                    {new Date(milestoneMeta.dueOn).toLocaleDateString(i18n.language, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </dd>
                </>
              ) : null}
              <dt className="font-medium" style={{ color: 'var(--dome-text-muted)' }}>{t('github.calendar_state')}</dt>
              <dd style={{ color: milestoneMeta.state === 'closed' ? 'var(--success)' : 'var(--dome-text)' }}>
                {milestoneMeta.state === 'closed' ? t('github.calendar_completed') : t('github.calendar_pending')}
              </dd>
            </dl>
          ) : (
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {formatEventWhen(event, i18n.language)}
              {event.all_day ? ` · ${t('calendarPage.all_day')}` : null}
            </p>
          )}
          {event.calendar_title && !milestoneMeta ? (
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {event.calendar_title}
            </p>
          ) : null}
          {markdownBody ? (
            <GithubMarkdownBody content={markdownBody} className="text-sm max-h-[min(60vh,520px)] overflow-y-auto" />
          ) : (
            <p className="text-sm italic" style={{ color: 'var(--dome-text-muted)' }}>
              {t('github.no_description')}
            </p>
          )}
          {githubUrl ? (
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm inline-flex items-center gap-1.5 w-fit"
              style={{ color: 'var(--dome-accent)' }}
            >
              <ExternalLink size={14} />
              {t('github.calendar_view_on_github')}
            </a>
          ) : null}
        </div>
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
