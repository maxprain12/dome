import { useTranslation } from 'react-i18next';
import { Calendar, Layers } from 'lucide-react';
import type { CalendarEventArtifactV, FlashcardDeckArtifactV } from '@/lib/chat/artifactSchemas';

export function CalendarEventArtifact({ artifact }: { artifact: CalendarEventArtifactV }) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-tertiary))' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Calendar className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
        <span className="font-semibold text-sm truncate" style={{ color: 'var(--primary-text)' }}>
          {artifact.title}
        </span>
      </div>
      <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
        {artifact.all_day ? t('chat.calendar_all_day', 'Todo el día') : `${artifact.start_at} → ${artifact.end_at}`}
      </p>
      {artifact.location ? (
        <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
          {artifact.location}
        </p>
      ) : null}
      {artifact.event_id ? (
        <p className="text-[10px] font-mono truncate opacity-70" style={{ color: 'var(--tertiary-text)' }}>
          id: {artifact.event_id}
        </p>
      ) : null}
    </div>
  );
}

export function FlashcardDeckArtifact({ artifact }: { artifact: FlashcardDeckArtifactV }) {
  const { t } = useTranslation();
  const preview = artifact.preview?.slice(0, 4) ?? [];
  const count = artifact.card_count ?? preview.length;
  return (
    <div
      className="rounded-lg border p-3 space-y-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
    >
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--primary-text)' }}>
            {artifact.title}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--secondary-text)' }}>
            {t('chat.flashcard_deck_count', { count, defaultValue: '{{count}} tarjetas' })}
          </p>
        </div>
      </div>
      {preview.length > 0 ? (
        <ul className="space-y-2 max-h-40 overflow-y-auto">
          {preview.map((c, i) => (
            <li
              key={i}
              className="text-xs rounded-md p-2 border"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
            >
              <p className="font-medium" style={{ color: 'var(--primary-text)' }}>
                {c.question}
              </p>
              <p className="mt-1 opacity-85" style={{ color: 'var(--secondary-text)' }}>
                {c.answer}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
