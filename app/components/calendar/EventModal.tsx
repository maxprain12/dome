'use client';

import { useState } from 'react';
import DomeModal from '@/components/ui/DomeModal';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';

function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
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
  const { t } = useTranslation();
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
