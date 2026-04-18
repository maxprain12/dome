import { Minus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const btnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors';

/**
 * Controles nativos de la ventana del hub (la barra del sistema está oculta en esta ventana transparente).
 */
export default function TranscriptionOverlayWindowControls() {
  const { t } = useTranslation();

  return (
    <div className="pointer-events-auto flex w-full max-w-[min(96vw,920px)] shrink-0 items-center justify-end gap-0.5 self-center">
      <button
        type="button"
        onClick={() => void window.electron?.transcriptionOverlay?.overlayWindowChrome?.('minimize')}
        className={btnClass}
        style={{
          color: 'var(--dome-text-muted)',
          background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
          border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
        }}
        title={t('hub.window_minimize')}
        aria-label={t('hub.window_minimize')}
      >
        <Minus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => void window.electron?.transcriptionOverlay?.overlayWindowChrome?.('close')}
        className={btnClass}
        style={{
          color: 'var(--dome-text-muted)',
          background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
          border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
        }}
        title={t('hub.window_close')}
        aria-label={t('hub.window_close')}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
