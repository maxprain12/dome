import { Minus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHubUi } from '@/lib/transcription/hubUiContext';

const btnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors';

type Props = {
  onRequestCloseDock: () => void;
};

/**
 * Controles del hub integrado en la ventana principal (compactar vista / cerrar panel).
 */
export default function TranscriptionHubChrome({ onRequestCloseDock }: Props) {
  const { t } = useTranslation();
  const hubUi = useHubUi();

  return (
    <div className="pointer-events-auto flex w-full max-w-[min(96vw,920px)] shrink-0 items-center justify-end gap-0.5 self-center">
      <button
        type="button"
        onClick={() => hubUi?.toggleHubMinimized()}
        className={btnClass}
        style={{
          color: 'var(--dome-text-muted)',
          background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
          border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
        }}
        title={t('hub.minimize_panel')}
        aria-label={t('hub.minimize_panel')}
      >
        <Minus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onRequestCloseDock}
        className={btnClass}
        style={{
          color: 'var(--dome-text-muted)',
          background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
          border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
        }}
        title={t('hub.hide_panel')}
        aria-label={t('hub.hide_panel')}
      >
        <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
