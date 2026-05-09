'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 min-h-full w-full border-0 p-0 cursor-pointer"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        aria-label={t('ui.close')}
        onClick={onClose}
      />
      <div
        className="relative z-10 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-auto"
        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <h2 id="event-modal-title" className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            {event ? t('calendarPage.edit_event') : t('calendarPage.new_event')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--dome-bg)]"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label htmlFor="event-modal-title-input" className="block text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
              {t('common.name')}
            </label>
            <input
              id="event-modal-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: 'var(--dome-bg)',
                borderColor: 'var(--dome-border)',
                color: 'var(--dome-text)',
              }}
              placeholder={t('calendarPage.event_title_placeholder')}
              required
            />
          </div>

          <div>
            <label htmlFor="event-modal-location" className="block text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
              {t('common.location')}
            </label>
            <input
              id="event-modal-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
              style={{
                background: 'var(--dome-bg)',
                borderColor: 'var(--dome-border)',
                color: 'var(--dome-text)',
              }}
              placeholder={t('calendarPage.event_location_placeholder')}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <label htmlFor="allDay" className="text-sm" style={{ color: 'var(--dome-text)' }}>
              {t('calendarPage.all_day')}
            </label>
          </div>

          {!allDay && (
            <>
              <div>
                <label htmlFor="event-modal-start-dt" className="block text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
                  {t('calendarPage.event_start')}
                </label>
                <input
                  id="event-modal-start-dt"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: 'var(--dome-bg)',
                    borderColor: 'var(--dome-border)',
                    color: 'var(--dome-text)',
                  }}
                />
              </div>
              <div>
                <label htmlFor="event-modal-end-dt" className="block text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
                  {t('calendarPage.event_end')}
                </label>
                <input
                  id="event-modal-end-dt"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: 'var(--dome-bg)',
                    borderColor: 'var(--dome-border)',
                    color: 'var(--dome-text)',
                  }}
                />
              </div>
            </>
          )}

          {allDay && (
            <>
              <div>
                <label htmlFor="event-modal-start-date" className="block text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
                  {t('calendarPage.start_date')}
                </label>
                <input
                  id="event-modal-start-date"
                  type="date"
                  value={startAt.slice(0, 10)}
                  onChange={(e) => setStartAt(e.target.value + 'T00:00')}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: 'var(--dome-bg)',
                    borderColor: 'var(--dome-border)',
                    color: 'var(--dome-text)',
                  }}
                />
              </div>
              <div>
                <label htmlFor="event-modal-end-date" className="block text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
                  {t('calendarPage.end_date')}
                </label>
                <input
                  id="event-modal-end-date"
                  type="date"
                  value={endAt.slice(0, 10)}
                  onChange={(e) => setEndAt(e.target.value + 'T23:59')}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    background: 'var(--dome-bg)',
                    borderColor: 'var(--dome-border)',
                    color: 'var(--dome-text)',
                  }}
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="event-modal-description" className="block text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
              {t('common.description')}
            </label>
            <textarea
              id="event-modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border resize-none"
              style={{
                background: 'var(--dome-bg)',
                borderColor: 'var(--dome-border)',
                color: 'var(--dome-text)',
              }}
              placeholder={t('calendarPage.event_notes_placeholder')}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-4 py-2 rounded-lg font-medium disabled:opacity-50"
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-accent-fg)' }}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {event && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                style={{ background: 'var(--dome-error-bg)', color: 'var(--dome-error)' }}
              >
                {deleting ? t('calendarPage.deleting') : t('common.delete')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium"
              style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
