import { useManyStore } from '@/lib/store/useManyStore';
import { stripForTts } from '@/lib/many/stripForTts';

/** Map user language to OpenAI TTS voice */
const VOICE_FOR_LANGUAGE: Record<string, string> = {
  en: 'nova',
  es: 'nova',
  fr: 'shimmer',
  pt: 'nova',
};

function getVoiceForCurrentLanguage(): string {
  try {
    const lang = typeof localStorage !== 'undefined' ? localStorage.getItem('dome:language') || 'es' : 'es';
    return VOICE_FOR_LANGUAGE[lang] || 'nova';
  } catch {
    return 'nova';
  }
}

/**
 * Fallback TTS for non-run-engine paths (e.g. direct AI chat without LangGraph).
 * For run-engine flows, streaming TTS in electron/streaming-tts.cjs handles playback.
 */
export async function playManyAssistantTts(rawText: string): Promise<void> {
  const { setStatus, setTtsError } = useManyStore.getState();
  setTtsError(null);
  const text = stripForTts(rawText);
  if (!text) {
    setStatus('idle');
    return;
  }
  if (!window.electron?.audio?.generateSpeech) {
    setTtsError('TTS IPC no disponible en este entorno.');
    setStatus('idle');
    return;
  }
  if (!window.electron?.audio?.playFile) {
    setTtsError('Reproducción TTS no disponible en este entorno.');
    setStatus('idle');
    return;
  }
  const voice = getVoiceForCurrentLanguage();
  setStatus('speaking');
  try {
    const res = await window.electron.audio.generateSpeech(text, voice, { model: 'tts-1' });
    if (!res.success || !res.audioPath) {
      const err =
        typeof res.error === 'string' && res.error.trim()
          ? res.error
          : 'No se generó audio (revisa la clave OpenAI en Ajustes > AI).';
      setTtsError(err);
      setStatus('idle');
      return;
    }
    const playRes = await window.electron.audio.playFile(res.audioPath);
    if (!playRes.success) {
      const detail =
        typeof playRes.error === 'string' && playRes.error.trim()
          ? playRes.error.trim()
          : '';
      setTtsError(
        detail
          ? `No se pudo reproducir el audio: ${detail}`
          : 'No se pudo reproducir el audio generado.',
      );
      return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'playback') {
      setTtsError('No se pudo reproducir el audio generado.');
    } else {
      setTtsError(msg ? `Error de voz: ${msg}` : 'Error al reproducir la respuesta por voz.');
    }
  } finally {
    setStatus('idle');
  }
}
