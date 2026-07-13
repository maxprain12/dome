import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar03Icon,
  Layers01Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type { CalendarEventArtifactV, FlashcardDeckArtifactV } from '@/lib/chat/artifactSchemas';

export function CalendarEventArtifact({ artifact }: { artifact: CalendarEventArtifactV }) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-lg border p-3 flex flex-col gap-y-2"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--primary) 6%, var(--muted))' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <HugeiconsIcon icon={Calendar03Icon} className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold text-sm truncate text-foreground">
          {artifact.title}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {artifact.all_day ? t('chat.calendar_all_day', 'Todo el día') : `${artifact.start_at} → ${artifact.end_at}`}
      </p>
      {artifact.location ? (
        <p className="text-xs text-muted-foreground">
          {artifact.location}
        </p>
      ) : null}
      {artifact.event_id ? (
        <p className="text-[10px] font-mono truncate opacity-70 text-muted-foreground">
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
      className="rounded-lg border p-3 flex flex-col gap-y-3"
      style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Layers01Icon} className="size-4 shrink-0 text-[var(--success)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate text-foreground">
            {artifact.title}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t('chat.flashcard_deck_count', { count, defaultValue: '{{count}} tarjetas' })}
          </p>
        </div>
      </div>
      {preview.length > 0 ? (
        <ul className="flex flex-col gap-y-2 max-h-40 overflow-y-auto">
          {preview.map((c, i) => (
            <li
              key={i}
              className="text-xs rounded-md p-2 border"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <p className="font-medium text-foreground">
                {c.question}
              </p>
              <p className="mt-1 opacity-85 text-muted-foreground">
                {c.answer}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
