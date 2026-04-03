import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Loader2, AlertCircle, Radio } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { ManyStatus } from '@/lib/store/useManyStore';
import { pickRecordMimeType, transcribeAudioBlob } from '@/lib/transcription/transcribeBlob';
import { RealtimeVoiceSession, type RealtimeStatus } from '@/lib/realtime/realtimeVoiceSession';

/** Animated waveform bars */
const BAR_BASE = [4, 8, 13, 8, 4];

/** Build the realtime system prompt with Dome context and Many's personality */
function buildRealtimePrompt(language: string, instructionsSuffix?: string): string {
  const langName: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', pt: 'Portuguese' };
  const lang = langName[language] ?? 'Spanish';
  const base =
    `You are Many, the voice assistant for Dome — a personal knowledge management app for researchers, students, and curious minds.\n\n` +
    `## Who you are\n` +
    `You are friendly, warm, and a bit witty. You speak like a knowledgeable friend — not a corporate bot. ` +
    `You know everything the user has in their Dome library: notes, PDFs, videos, research projects, and more. ` +
    `When the user asks about their documents or wants to find something, you search the library first.\n\n` +
    `## Voice conversation rules\n` +
    `- Respond ONLY in ${lang}\n` +
    `- Keep responses SHORT (2–4 sentences max for simple questions)\n` +
    `- Use natural spoken language — no markdown, no bullet lists, no headers\n` +
    `- Summarize rather than enumerate; reading aloud sounds different than text\n` +
    `- If you open or search something, briefly say what you found or did\n\n` +
    `## What you can do\n` +
    `- Search the user's library; list recently updated items; open resources in a tab\n` +
    `- Navigate Dome sections: home, settings, calendar, agents, studio, and more (use navigate_dome_ui)\n` +
    `- Create a new note when the user dictates something to save\n` +
    `- Answer general knowledge questions\n\n` +
    `## Closing the session\n` +
    `When the user says goodbye, bye, see you, adios, chao, hasta luego, au revoir, tchau, or any farewell, ` +
    `respond warmly and then call the close_session tool to end the conversation.`;
  const extra = instructionsSuffix?.trim();
  if (!extra) return base;
  return `${base}\n\n## User preferences (from Settings)\n${extra}`;
}

/**
 * Many Voice HUD — floating overlay window (`many-voice-overlay`).
 * Dual-mode:
 *   - Realtime mode (OpenAI Realtime API): low-latency STS with tools
 *   - Legacy mode (MediaRecorder + STT + LangGraph): fallback
 */
export default function ManyVoiceHud() {
  const { t } = useTranslation();

  // ── Legacy state ──────────────────────────────────────
  const [remoteManyStatus, setRemoteManyStatus] = useState<ManyStatus>('idle');
  const [remoteTtsError, setRemoteTtsError] = useState<string | null>(null);
  const [currentSentence, setCurrentSentence] = useState<string | null>(null);

  const [phase, setPhase] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [followManyVoice, setFollowManyVoice] = useState(false);
  const [barPhase, setBarPhase] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const processAfterStopRef = useRef(true);
  const cancelledDuringSetupRef = useRef(false);
  const micSetupInProgressRef = useRef(false);

  // ── Realtime state ────────────────────────────────────
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string | null>(null);
  const sessionRef = useRef<RealtimeVoiceSession | null>(null);
  const realtimeModeRef = useRef<'ptt' | 'server_vad'>('server_vad');
  const realtimeAvailableRef = useRef<boolean | null>(null); // null = not checked yet

  const isRealtimeActive = realtimeStatus !== 'idle' && realtimeStatus !== 'error';

  // ── Wake word detection ────────────────────────────────
  const wakeWordRecogRef = useRef<SpeechRecognition | null>(null);
  const wakeWordActiveRef = useRef(false);

  // ── HUD state from main process ───────────────────────
  useEffect(() => {
    const unsub = window.electron?.manyVoice?.onHudState?.((payload: {
      status?: ManyStatus;
      ttsError?: string | null;
      currentSentence?: string | null;
    }) => {
      if (!payload) return;
      if (Object.prototype.hasOwnProperty.call(payload, 'status') && payload.status) {
        setRemoteManyStatus(payload.status);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'ttsError')) {
        setRemoteTtsError(payload.ttsError ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'currentSentence')) {
        setCurrentSentence(payload.currentSentence ?? null);
      }
    });
    return () => { unsub?.(); };
  }, []);

  // ── Check realtime availability ───────────────────────
  const checkRealtimeAvailable = useCallback(async (): Promise<boolean> => {
    if (realtimeAvailableRef.current !== null) return realtimeAvailableRef.current;
    try {
      const cfg = await window.electron?.realtime?.getSessionConfig?.();
      const ok = cfg?.success === true;
      realtimeAvailableRef.current = ok;
      return ok;
    } catch {
      realtimeAvailableRef.current = false;
      return false;
    }
  }, []);

  // ── Realtime session management ───────────────────────
  const closeRealtimeSession = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.close();
    sessionRef.current = null;
    setRealtimeStatus('idle');
    setRealtimeTranscript(null);
  }, []);

  const startRealtimeSession = useCallback(async (mode: 'ptt' | 'server_vad') => {
    // Close any existing session first
    closeRealtimeSession();
    setRealtimeError(null);
    realtimeModeRef.current = mode;

    const language = (typeof localStorage !== 'undefined'
      ? localStorage.getItem('dome:language')
      : null) ?? 'es';

    // Request mic permission on macOS first (IPC-based system prompt)
    if (window.electron?.isMac) {
      const perm = await window.electron.transcription?.requestMicrophoneAccess?.();
      if (perm?.success === false || perm?.granted === false) {
        notifications.show({
          title: t('media.dock_mic_permission'),
          message: perm?.error || t('media.dock_mic_denied'),
          color: 'red',
        });
        return;
      }
    }

    const session = new RealtimeVoiceSession();
    sessionRef.current = session;

    session.onStatusChange = (s) => setRealtimeStatus(s);
    session.onError = (err) => {
      setRealtimeError(err);
      closeRealtimeSession();
    };
    session.onTranscriptDelta = (delta) => {
      setRealtimeTranscript((prev) => (prev ?? '') + delta);
    };
    session.onTranscriptDone = () => {
      setRealtimeTranscript(null);
    };
    session.onUserTranscript = () => {
      setRealtimeTranscript(null);
    };
    session.onCloseRequested = () => {
      closeRealtimeSession();
    };

    try {
      let instructionsSuffix = '';
      try {
        const rtCfg = await window.electron?.realtime?.getSessionConfig?.();
        if (rtCfg?.success === true && 'instructionsSuffix' in rtCfg) {
          instructionsSuffix = String((rtCfg as { instructionsSuffix?: string }).instructionsSuffix || '');
        }
      } catch {
        /* ignore */
      }
      await session.start({
        language,
        systemPrompt: buildRealtimePrompt(language, instructionsSuffix),
        mode,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRealtimeError(msg);
      closeRealtimeSession();
    }
  }, [closeRealtimeSession, t]);

  // ── Legacy helpers ────────────────────────────────────
  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const resetUi = useCallback(() => {
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setPhase('idle');
  }, []);

  const clearMainTts = useCallback(() => {
    void window.electron?.manyVoice?.dismissTtsError?.();
    setRemoteTtsError(null);
    setCurrentSentence(null);
  }, []);

  const startRecordingMic = useCallback(async () => {
    micSetupInProgressRef.current = true;
    clearMainTts();
    if (typeof MediaRecorder === 'undefined' || !window.electron?.transcription?.bufferToText) {
      micSetupInProgressRef.current = false;
      notifications.show({
        title: t('manyVoice.unavailable'),
        message: t('manyVoice.no_mediarecorder'),
        color: 'red',
      });
      return;
    }
    try {
      cancelledDuringSetupRef.current = false;
      if (window.electron.isMac) {
        const perm = await window.electron.transcription.requestMicrophoneAccess();
        if (perm.success === false || perm.granted === false) {
          notifications.show({
            title: t('media.dock_mic_permission'),
            message: perm.error || t('media.dock_mic_denied'),
            color: 'red',
          });
          micSetupInProgressRef.current = false;
          return;
        }
      }
      if (cancelledDuringSetupRef.current) {
        micSetupInProgressRef.current = false;
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledDuringSetupRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        micSetupInProgressRef.current = false;
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecordMimeType();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        void (async () => {
          cleanupStream();
          const shouldProcess = processAfterStopRef.current;
          processAfterStopRef.current = true;
          if (!shouldProcess) {
            resetUi();
            return;
          }
          const outMime = mr.mimeType || mime || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: outMime });
          chunksRef.current = [];
          if (blob.size < 256) {
            notifications.show({
              title: t('media.dock_empty_recording'),
              message: t('media.dock_no_audio_captured'),
              color: 'yellow',
            });
            resetUi();
            return;
          }
          setPhase('processing');
          try {
            const tr = await transcribeAudioBlob(blob);
            if (!tr.success) {
              notifications.show({ title: t('manyVoice.transcribe_failed'), message: tr.error, color: 'red' });
              resetUi();
              setFollowManyVoice(false);
              return;
            }
            setFollowManyVoice(true);
            const voiceLanguage =
              (typeof localStorage !== 'undefined' ? localStorage.getItem('dome:language') : null) || 'es';
            const relay = await window.electron.manyVoice.relaySend({
              text: tr.text,
              autoSpeak: true,
              openPanel: false,
              voiceLanguage,
            });
            if (!relay?.success) {
              notifications.show({
                title: t('manyVoice.send_failed'),
                message: relay?.error || t('common.unknown_error'),
                color: 'red',
              });
              setFollowManyVoice(false);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.show({ title: t('manyVoice.send_failed'), message: msg, color: 'red' });
            setFollowManyVoice(false);
          } finally {
            resetUi();
          }
        })();
      };
      mr.start(200);
      micSetupInProgressRef.current = false;
      setPhase('recording');
    } catch (err) {
      micSetupInProgressRef.current = false;
      cleanupStream();
      notifications.show({
        title: t('media.dock_mic_permission'),
        message: err instanceof Error ? err.message : t('media.dock_mic_access_error'),
        color: 'red',
      });
      resetUi();
    }
  }, [cleanupStream, clearMainTts, resetUi, t]);

  const stopRecording = useCallback(() => {
    processAfterStopRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    else resetUi();
  }, [resetUi]);

  const cancelAll = useCallback(() => {
    processAfterStopRef.current = false;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    else {
      cleanupStream();
      resetUi();
    }
    setFollowManyVoice(false);
    // Also close realtime if active
    closeRealtimeSession();
    setRealtimeError(null);
  }, [cleanupStream, closeRealtimeSession, resetUi]);

  // ── Toggle handler (press to start / press to stop) ──
  useEffect(() => {
    if (!window.electron?.manyVoice?.onToggle) return undefined;
    return window.electron.manyVoice.onToggle(() => {
      // If realtime is active, close it
      if (isRealtimeActive) {
        closeRealtimeSession();
        return;
      }
      // If legacy recording active
      if (phase === 'processing') return;
      if (phase === 'recording') { stopRecording(); return; }
      if (micSetupInProgressRef.current) {
        cancelledDuringSetupRef.current = true;
        cancelAll();
        return;
      }
      clearMainTts();
      // Try realtime first, fall back to legacy
      void checkRealtimeAvailable().then((available) => {
        if (available) {
          void startRealtimeSession('server_vad');
        } else {
          void startRecordingMic();
        }
      });
    });
  }, [cancelAll, checkRealtimeAvailable, clearMainTts, closeRealtimeSession, isRealtimeActive, phase, startRecordingMic, startRealtimeSession, stopRecording]);

  // ── PTT handlers ─────────────────────────────────────
  useEffect(() => {
    const start = window.electron?.manyVoice?.onPttStart;
    const end = window.electron?.manyVoice?.onPttEnd;
    if (!start || !end) return undefined;
    const unA = start(() => {
      if (phase === 'processing') return;
      clearMainTts();
      cancelledDuringSetupRef.current = false;
      // Try realtime PTT first
      void checkRealtimeAvailable().then((available) => {
        if (available) {
          void startRealtimeSession('ptt');
        } else {
          void startRecordingMic();
        }
      });
    });
    const unB = end(() => {
      // Commit realtime audio if active in PTT mode
      if (sessionRef.current && realtimeModeRef.current === 'ptt') {
        sessionRef.current.commitAudio();
        return;
      }
      if (phase === 'recording') stopRecording();
      else if (micSetupInProgressRef.current) {
        cancelledDuringSetupRef.current = true;
        cancelAll();
      }
    });
    return () => { unA?.(); unB?.(); };
  }, [cancelAll, checkRealtimeAvailable, clearMainTts, phase, startRecordingMic, startRealtimeSession, stopRecording]);

  // ── Cleanup on unmount ────────────────────────────────
  useEffect(() => () => {
    cleanupStream();
    closeRealtimeSession();
    wakeWordRecogRef.current?.abort();
    wakeWordRecogRef.current = null;
  }, [cleanupStream, closeRealtimeSession]);

  // ── Wake word detection ("oye Many" / "hey Many") ─────
  useEffect(() => {
    // Only run if SpeechRecognition is available (Chromium/Electron)
    const SpeechRecognitionAPI =
      (window as unknown as Record<string, unknown>).SpeechRecognition as typeof SpeechRecognition | undefined ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition as typeof SpeechRecognition | undefined;
    if (!SpeechRecognitionAPI) return undefined;

    // Stop wake word listener when realtime session is active (mic is already in use)
    if (isRealtimeActive) {
      wakeWordRecogRef.current?.abort();
      wakeWordRecogRef.current = null;
      return undefined;
    }

    const language = (typeof localStorage !== 'undefined'
      ? localStorage.getItem('dome:language')
      : null) ?? 'es';
    const langBcp: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', pt: 'pt-BR' };

    let recog: SpeechRecognition | null = null;
    let stopped = false;
    let consecutiveErrors = 0;
    const MAX_ERRORS = 3; // give up after 3 consecutive failures to avoid infinite loop

    const start = () => {
      if (stopped || wakeWordActiveRef.current || consecutiveErrors >= MAX_ERRORS) return;
      recog = new SpeechRecognitionAPI();
      wakeWordRecogRef.current = recog;
      recog.lang = langBcp[language] ?? 'es-ES';
      recog.continuous = false;
      recog.interimResults = false;
      recog.maxAlternatives = 3;

      recog.onresult = (e) => {
        consecutiveErrors = 0;
        for (let i = 0; i < e.results.length; i++) {
          for (let j = 0; j < e.results[i].length; j++) {
            const t = e.results[i][j].transcript.toLowerCase().trim();
            if (
              t.includes('oye many') ||
              t.includes('hey many') ||
              t.includes('ey many') ||
              t.includes('hola many')
            ) {
              wakeWordActiveRef.current = true;
              void checkRealtimeAvailable().then((available) => {
                wakeWordActiveRef.current = false;
                if (available) {
                  void startRealtimeSession('server_vad');
                }
              });
              return;
            }
          }
        }
      };

      recog.onend = () => {
        wakeWordRecogRef.current = null;
        recog = null;
        // Restart with a short pause — only if we haven't hit error limit
        if (!stopped && consecutiveErrors < MAX_ERRORS) {
          setTimeout(start, 800);
        }
      };

      recog.onerror = (e) => {
        wakeWordRecogRef.current = null;
        recog = null;
        // 'no-speech' is expected and not a real error
        if ((e as SpeechRecognitionErrorEvent).error !== 'no-speech') {
          consecutiveErrors++;
        }
        if (!stopped && consecutiveErrors < MAX_ERRORS) {
          // Exponential backoff: 3s, 9s, give up
          setTimeout(start, 3000 * consecutiveErrors);
        }
      };

      try { recog.start(); } catch { consecutiveErrors++; }
    };

    start();

    return () => {
      stopped = true;
      recog?.abort();
      wakeWordRecogRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealtimeActive]);

  // ── Bar animation ─────────────────────────────────────
  useEffect(() => {
    const active =
      phase === 'recording' ||
      phase === 'processing' ||
      remoteManyStatus === 'thinking' ||
      remoteManyStatus === 'speaking' ||
      remoteManyStatus === 'listening' ||
      realtimeStatus === 'recording' ||
      realtimeStatus === 'speaking' ||
      realtimeStatus === 'processing';
    if (!active) return undefined;
    const id = setInterval(() => setBarPhase((p) => (p + 1) % 24), 80);
    return () => clearInterval(id);
  }, [remoteManyStatus, phase, realtimeStatus]);

  // ── Auto-dismiss followManyVoice ─────────────────────
  useEffect(() => {
    if (!followManyVoice) return;
    if (phase !== 'idle') return;
    if (remoteManyStatus !== 'idle') return;
    const tmr = window.setTimeout(() => setFollowManyVoice(false), 600);
    return () => window.clearTimeout(tmr);
  }, [followManyVoice, remoteManyStatus, phase]);

  // ── Overlay height — resize window to fit content ────
  useEffect(() => {
    const hasError = Boolean(realtimeError || remoteTtsError);
    void window.electron?.manyVoice?.overlayResize?.(hasError ? 140 : 80);
  }, [realtimeError, remoteTtsError]);

  // ── Overlay visibility ────────────────────────────────
  const hudOpen =
    isRealtimeActive ||
    realtimeStatus === 'error' ||
    Boolean(realtimeError) ||
    phase !== 'idle' ||
    followManyVoice ||
    Boolean(remoteTtsError) ||
    remoteManyStatus === 'speaking' ||
    remoteManyStatus === 'thinking';

  useEffect(() => {
    if (!window.electron?.manyVoice?.overlaySetVisible) return;
    void window.electron.manyVoice.overlaySetVisible(hudOpen);
  }, [hudOpen]);

  if (!hudOpen) return null;

  // ── Derived display state ─────────────────────────────
  const isRealtime = isRealtimeActive || realtimeStatus === 'error' || Boolean(realtimeError);
  const isSpeaking = isRealtime ? realtimeStatus === 'speaking' : remoteManyStatus === 'speaking';
  const isThinking = isRealtime
    ? realtimeStatus === 'processing'
    : remoteManyStatus === 'thinking' || followManyVoice;
  const isRecording = isRealtime ? realtimeStatus === 'recording' : phase === 'recording';
  const isProcessing = !isRealtime && phase === 'processing';
  const isConnecting = realtimeStatus === 'connecting';

  const barsActive = isRecording || remoteManyStatus === 'listening' || realtimeStatus === 'recording';
  const barsBusy = isProcessing || isThinking || isSpeaking || isConnecting;

  const displayError = realtimeError || remoteTtsError;

  const realtimeStatusLabel = (): string | null => {
    switch (realtimeStatus) {
      case 'connecting': return t('manyVoice.realtime_connecting');
      case 'ready': return t('manyVoice.realtime_ready');
      case 'recording': return t('manyVoice.realtime_recording');
      case 'processing': return t('manyVoice.realtime_processing');
      case 'speaking': return t('manyVoice.realtime_speaking');
      case 'error': return t('manyVoice.realtime_error');
      default: return null;
    }
  };

  const statusLabel = (): string => {
    if (isRealtime) return realtimeStatusLabel() ?? '';
    if (isProcessing) return t('manyVoice.processing');
    if (isRecording) return t('manyVoice.recording');
    if (isSpeaking) return t('many.speaking');
    if (isThinking) return t('many.thinking');
    return t('manyVoice.starting');
  };

  return (
    <div className="relative z-10 w-full flex justify-center pointer-events-none" aria-live="polite">
      <div
        className="pointer-events-auto w-full max-w-[min(96vw,420px)] rounded-3xl shadow-xl border overflow-hidden"
        style={{
          background: 'color-mix(in srgb, var(--dome-bg, #fff) 94%, transparent)',
          borderColor: 'color-mix(in srgb, var(--dome-border, #ddd) 50%, transparent)',
          boxShadow: isSpeaking
            ? '0 0 0 1.5px color-mix(in srgb, var(--dome-accent, #7b76d0) 35%, transparent), 0 8px 32px color-mix(in srgb, black 14%, transparent)'
            : '0 8px 32px color-mix(in srgb, black 14%, transparent)',
          transition: 'box-shadow 0.3s ease',
        }}
      >
        {/* Main pill row */}
        <div className="flex items-center gap-2.5 px-4 py-3 min-h-[52px]">
          {/* Waveform indicator */}
          <div className="flex items-end justify-center gap-[2px] h-6 shrink-0 w-7">
            {BAR_BASE.map((h, i) => {
              const wobble =
                barsActive || barsBusy
                  ? Math.sin((barPhase + i * 3.5) * 0.38) * (barsActive ? 6 : 4)
                  : 0;
              return (
                <div
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{
                    height: Math.max(2, h + wobble),
                    background: barsActive
                      ? 'var(--dome-accent, #7b76d0)'
                      : barsBusy
                        ? 'color-mix(in srgb, var(--dome-accent, #7b76d0) 55%, var(--dome-text-muted, #999))'
                        : 'var(--dome-text-muted, #999)',
                    opacity: barsActive || barsBusy ? 1 : 0.3,
                    transition: 'height 80ms ease',
                  }}
                />
              );
            })}
          </div>

          {/* Status + live transcript */}
          <div className="flex-1 min-w-0">
            {isSpeaking && (realtimeTranscript || currentSentence) ? (
              <p
                className="text-[12px] leading-snug truncate font-normal"
                style={{ color: 'var(--dome-text, #111)' }}
                title={realtimeTranscript || currentSentence || undefined}
              >
                {realtimeTranscript || currentSentence}
              </p>
            ) : (
              <div className="flex items-center gap-1.5">
                {(isProcessing || isConnecting) && (
                  <Loader2
                    className="h-3 w-3 animate-spin shrink-0 opacity-70"
                    style={{ color: 'var(--dome-accent, #7b76d0)' }}
                    aria-hidden
                  />
                )}
                {isRecording && (
                  <Mic
                    className="h-3 w-3 shrink-0"
                    style={{ color: 'var(--dome-accent, #7b76d0)' }}
                    aria-hidden
                  />
                )}
                {isRealtime && realtimeStatus === 'ready' && (
                  <Radio
                    className="h-3 w-3 shrink-0 opacity-70"
                    style={{ color: 'var(--dome-accent, #7b76d0)' }}
                    aria-hidden
                  />
                )}
                <span
                  className="text-[12px] font-medium leading-tight truncate"
                  style={{ color: 'var(--dome-text, #111)', opacity: 0.75 }}
                >
                  {statusLabel()}
                </span>
              </div>
            )}
          </div>

          {/* Cancel button */}
          {(isRecording || isRealtimeActive || isConnecting) ? (
            <button
              type="button"
              onClick={cancelAll}
              className="shrink-0 rounded-full w-6 h-6 flex items-center justify-center transition-opacity hover:opacity-70"
              style={{
                background: 'color-mix(in srgb, var(--dome-text-muted, #999) 15%, transparent)',
                color: 'var(--dome-text-muted, #999)',
              }}
              title={t('media.dock_cancel')}
              aria-label={t('media.dock_cancel')}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* Error banner */}
        {displayError ? (
          <div
            className="flex items-start gap-2 px-4 py-2.5 text-[11px] leading-snug border-t"
            style={{
              background: 'color-mix(in srgb, var(--dome-error, #ef4444) 8%, transparent)',
              borderColor: 'color-mix(in srgb, var(--dome-error, #ef4444) 20%, transparent)',
              color: 'var(--dome-text, #111)',
            }}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-80" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-medium opacity-90">
                {realtimeError ? t('manyVoice.realtime_error') : t('manyVoice.tts_error_playback')}
              </div>
              <div className="opacity-70 mt-0.5 break-words">{displayError}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setRealtimeError(null);
                clearMainTts();
              }}
              className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: 'var(--dome-accent, #7b76d0)',
                color: 'var(--dome-on-accent, #fff)',
              }}
            >
              OK
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
