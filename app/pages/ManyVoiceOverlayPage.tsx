import { useEffect, type CSSProperties } from 'react';
import ManyVoiceHud from '@/components/many/ManyVoiceHud';

/**
 * Superficie mínima para el HUD de voz global: ventana flotante propia (processo renderer separado).
 */
export default function ManyVoiceOverlayPage() {
  useEffect(() => {
    const unsub =
      window.electron?.manyVoice?.onOverlayLoaded?.(() => {
        void window.electron.manyVoice.overlayMounted();
      });
    void window.electron?.manyVoice?.overlayMounted?.();
    return () => {
      unsub?.();
    };
  }, []);

  /** Permite que la ventana frameless transparente no pinte el fondo opaco del body. */
  useEffect(() => {
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.backgroundColor = prevBody;
      document.documentElement.style.backgroundColor = prevHtml;
    };
  }, []);

  return (
    <div
      className="h-full w-full overflow-hidden flex items-end justify-center pb-2 px-1.5 pointer-events-none bg-transparent"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <div className="pointer-events-auto w-full flex justify-center items-end min-h-0">
        <ManyVoiceHud />
      </div>
    </div>
  );
}
