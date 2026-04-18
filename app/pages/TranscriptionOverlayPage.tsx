import { useEffect, type CSSProperties } from 'react';
import HubOverlay from '@/components/transcription/HubOverlay';
import { HubUiProvider } from '@/lib/transcription/hubUiContext';
import { dispatchTranscriptionTrayAction, type TranscriptionTrayAction } from '@/lib/transcription/hubTrayHandlers';
import { useAppStore } from '@/lib/store/useAppStore';

function parseTrayAction(payload: unknown): TranscriptionTrayAction | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const a = (payload as { action?: unknown }).action;
  if (a === 'stop' || a === 'cancel' || a === 'pause-resume') return a;
  return null;
}

/**
 * Ventana flotante dedicada al hub de grabación/transcripción (sin AppShell).
 */
export default function TranscriptionOverlayPage() {
  const loadCurrentProject = useAppStore((s) => s.loadCurrentProject);

  useEffect(() => {
    void loadCurrentProject();
  }, [loadCurrentProject]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return undefined;
    return window.electron.on('transcription:tray-action', (payload: unknown) => {
      const action = parseTrayAction(payload);
      if (action) dispatchTranscriptionTrayAction(action);
    });
  }, []);

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
    <HubUiProvider>
      <div
        className="box-border flex h-full min-h-0 w-full flex-col justify-start overflow-x-hidden overflow-y-auto bg-transparent px-2 pb-2 pt-1 sm:px-3 sm:pb-3 pointer-events-none [scrollbar-gutter:stable]"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <div className="pointer-events-auto mx-auto flex max-h-full min-h-0 w-full max-w-[min(96vw,920px)] flex-col items-center justify-start">
          <HubOverlay />
        </div>
      </div>
    </HubUiProvider>
  );
}
