import { useEffect } from 'react';
import { useManyStore } from '@/lib/store/useManyStore';

/**
 * Headless component — mounts once in AppShell and syncs main-process TTS events
 * into `useManyStore` (status, current sentence, errors) for the Many panel UI.
 */
export default function ManyVoiceBridge() {
  useEffect(() => {
    if (!window.electron?.audio?.onTtsSentencePlaying) return undefined;
    return window.electron.audio.onTtsSentencePlaying(
      (data: { runId: string; sentence: string }) => {
        const { setStatus, setCurrentSentence } = useManyStore.getState();
        setStatus('speaking');
        setCurrentSentence(data.sentence);
      },
    );
  }, []);

  useEffect(() => {
    if (!window.electron?.audio?.onTtsFinished) return undefined;
    return window.electron.audio.onTtsFinished(() => {
      const { setStatus, setCurrentSentence } = useManyStore.getState();
      setCurrentSentence(null);
      setStatus('idle');
    });
  }, []);

  useEffect(() => {
    if (!window.electron?.audio?.onTtsError) return undefined;
    return window.electron.audio.onTtsError(
      (data: { runId: string; error: string }) => {
        const { setTtsError, setCurrentSentence, setStatus } = useManyStore.getState();
        setTtsError(data.error || 'Error de voz al reproducir respuesta.');
        setCurrentSentence(null);
        setStatus('idle');
      },
    );
  }, []);

  return null;
}
