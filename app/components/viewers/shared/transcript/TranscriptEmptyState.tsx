import type { TFunction } from 'i18next';

interface TranscriptEmptyStateProps {
  t: TFunction;
  hint: string;
}

export default function TranscriptEmptyState({ t, hint }: TranscriptEmptyStateProps) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
        {hint}
      </p>
      <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)', opacity: 0.85 }}>
        {t('media.transcript_editorial_hint')}
      </p>
    </div>
  );
}
