import { useEffect, useRef } from 'react';
import { useManyStore } from '@/lib/store/useManyStore';
import { sendManyUserMessage } from '@/lib/many/manySendController';

/**
 * Headless component — mounts once in AppShell (unconditionally) and registers
 * all IPC listeners that only need the Zustand store, not ManyPanel's local state.
 *
 * This allows the following features to work even when the Many sidebar is
 * closed or a Chat History panel is shown in its place:
 *   - Voice relay (many-voice-overlay → Many engine)
 *   - TTS state sync (ManyVoiceHud overlay updates)
 *   - Open-panel requests from the voice overlay
 *   - TTS error dismissal
 */

export default function ManyVoiceBridge() {
  // Use a ref so cleanup is always tied to this specific instance lifecycle,
  // avoiding stale closures from the module-level singleton pattern.
  const relayCleanupRef = useRef<(() => void) | null>(null);

  // ── Voice relay: many-voice-overlay sends message → Many engine ────────────
  useEffect(() => {
    if (!window.electron?.manyVoice?.onRelayToMain) return undefined;
    relayCleanupRef.current = window.electron.manyVoice.onRelayToMain(
      (payload: { text: string; autoSpeak?: boolean; openPanel?: boolean; voiceLanguage?: string }) => {
        void sendManyUserMessage(payload.text, {
          autoSpeak: payload.autoSpeak,
          openPanel: payload.openPanel,
          voiceLanguage: payload.voiceLanguage,
        });
      },
    );
    return () => {
      relayCleanupRef.current?.();
      relayCleanupRef.current = null;
    };
  }, []);

  // ── Push Many store state to voice-overlay window ──────────────────────────
  useEffect(() => {
    if (!window.electron?.manyVoice?.pushStateToOverlay) return undefined;
    const pushNow = () => {
      const { status, ttsError, currentSentence } = useManyStore.getState();
      void window.electron.manyVoice.pushStateToOverlay({ status, ttsError, currentSentence });
    };
    let last = {
      status: useManyStore.getState().status,
      ttsError: useManyStore.getState().ttsError,
      currentSentence: useManyStore.getState().currentSentence,
    };
    const unsub = useManyStore.subscribe((state) => {
      const next = { status: state.status, ttsError: state.ttsError, currentSentence: state.currentSentence };
      if (
        next.status === last.status &&
        next.ttsError === last.ttsError &&
        next.currentSentence === last.currentSentence
      ) return;
      last = next;
      void window.electron.manyVoice.pushStateToOverlay(next);
    });
    pushNow();
    return unsub;
  }, []);

  // ── Voice overlay requests a fresh state push ──────────────────────────────
  useEffect(() => {
    if (!window.electron?.manyVoice?.onRequestStatePush) return undefined;
    return window.electron.manyVoice.onRequestStatePush(() => {
      const { status, ttsError, currentSentence } = useManyStore.getState();
      void window.electron.manyVoice.pushStateToOverlay({ status, ttsError, currentSentence });
    });
  }, []);

  // ── TTS sentence playing ───────────────────────────────────────────────────
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

  // ── TTS finished ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electron?.audio?.onTtsFinished) return undefined;
    return window.electron.audio.onTtsFinished(() => {
      const { setStatus, setCurrentSentence } = useManyStore.getState();
      setCurrentSentence(null);
      setStatus('idle');
    });
  }, []);

  // ── TTS error ──────────────────────────────────────────────────────────────
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

  // ── Voice overlay requests to open the Many panel ─────────────────────────
  useEffect(() => {
    if (!window.electron?.manyVoice?.onOpenPanelRequest) return undefined;
    return window.electron.manyVoice.onOpenPanelRequest(() => {
      useManyStore.getState().setOpen(true);
      window.dispatchEvent(new CustomEvent('dome:many-requires-panel', { detail: { reason: 'user' } }));
    });
  }, []);

  // ── TTS error dismiss from voice overlay ──────────────────────────────────
  useEffect(() => {
    if (!window.electron?.manyVoice?.onDismissTtsError) return undefined;
    return window.electron.manyVoice.onDismissTtsError(() => {
      useManyStore.getState().setTtsError(null);
    });
  }, []);

  return null;
}
