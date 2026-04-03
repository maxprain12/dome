import { useEffect, type CSSProperties } from 'react';
import VoiceRecordingDock from '@/components/transcription/VoiceRecordingDock';
import { useAppStore } from '@/lib/store/useAppStore';

/**
 * Ventana flotante dedicada al hub de grabación/transcripción (sin AppShell).
 */
export default function TranscriptionOverlayPage() {
  const loadCurrentProject = useAppStore((s) => s.loadCurrentProject);

  useEffect(() => {
    void loadCurrentProject();
  }, [loadCurrentProject]);

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
      <div className="pointer-events-auto w-full flex justify-center items-end min-h-0 max-h-full">
        <VoiceRecordingDock variant="overlay" />
      </div>
    </div>
  );
}
