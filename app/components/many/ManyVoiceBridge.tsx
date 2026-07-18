import { useEffect } from 'react';
import { useManyStore } from '@/lib/store/useManyStore';

/**
 * Headless bridge — mounts once in AppShell and mirrors main-process TTS
 * events (sentence playing / finished / error) into `useManyStore` so every
 * Many surface renders the same voice status.
 */
export default function ManyVoiceBridge() {
  useEffect(() => {
    const audio = window.electron?.audio;
    if (!audio?.onTtsSentencePlaying) return undefined;
    return audio.onTtsSentencePlaying((data: { runId: string; sentence: string }) => {
      const { setStatus, setCurrentSentence } = useManyStore.getState();
      setStatus('speaking');
      setCurrentSentence(data.sentence);
    });
  }, []);

  useEffect(() => {
    const audio = window.electron?.audio;
    if (!audio?.onTtsFinished) return undefined;
    return audio.onTtsFinished(() => {
      const { setStatus, setCurrentSentence } = useManyStore.getState();
      setCurrentSentence(null);
      setStatus('idle');
    });
  }, []);

  useEffect(() => {
    const audio = window.electron?.audio;
    if (!audio?.onTtsError) return undefined;
    return audio.onTtsError((data: { runId: string; error: string }) => {
      const { setTtsError, setCurrentSentence, setStatus } = useManyStore.getState();
      setTtsError(data.error || 'Error de voz al reproducir respuesta.');
      setCurrentSentence(null);
      setStatus('idle');
    });
  }, []);

  return null;
}
