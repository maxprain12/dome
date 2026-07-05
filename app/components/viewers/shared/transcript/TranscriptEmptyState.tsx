import type { TFunction } from 'i18next';
import { FileText, Loader2 } from 'lucide-react';

interface TranscriptEmptyStateProps {
  t: TFunction;
  hint: string;
  onTranscribe?: () => void;
  transcribing?: boolean;
}

export default function TranscriptEmptyState({
  t, hint, onTranscribe, transcribing = false,
}: TranscriptEmptyStateProps) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
        {hint}
      </p>
      {onTranscribe ? (
        <button
          type="button"
          onClick={onTranscribe}
          disabled={transcribing}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-[filter] enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: 'var(--dome-accent)', border: 'none' }}
        >
          {transcribing
            ? <Loader2 size={14} className="animate-spin" />
            : <FileText size={14} />}
          {transcribing ? t('media.transcribing') : t('media.transcribe_to_note')}
        </button>
      ) : null}
      <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)', opacity: 0.85 }}>
        {t('media.transcript_editorial_hint')}
      </p>
    </div>
  );
}
