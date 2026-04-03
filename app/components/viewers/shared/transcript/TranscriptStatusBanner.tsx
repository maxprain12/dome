import type { TFunction } from 'i18next';

interface TranscriptStatusBannerProps {
  t: TFunction;
  transcribing: boolean;
  metaProcessing: boolean;
  metaFailed: boolean;
}

export default function TranscriptStatusBanner({
  t,
  transcribing,
  metaProcessing,
  metaFailed,
}: TranscriptStatusBannerProps) {
  if (metaFailed) {
    return (
      <div
        className="border-b px-4 py-2 text-xs font-medium md:px-6"
        style={{
          borderColor: 'var(--dome-border)',
          background: 'rgba(185, 28, 28, 0.08)',
          color: 'var(--dome-text)',
        }}
      >
        {t('media.transcript_status_failed')}
      </div>
    );
  }
  if (transcribing || metaProcessing) {
    return (
      <div
        className="border-b px-4 py-2 text-xs font-medium md:px-6"
        style={{
          borderColor: 'var(--dome-border)',
          background: 'var(--dome-bg-hover)',
          color: 'var(--dome-text-muted)',
        }}
      >
        {t('media.transcript_status_processing')}
      </div>
    );
  }
  return null;
}
