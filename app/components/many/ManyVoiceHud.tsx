import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Loader2, AlertCircle, Radio } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { ManyStatus } from '@/lib/store/useManyStore';
import { transcribeAudioBlob } from '@/lib/transcription/transcribeBlob';
import { useMediaRecorder } from '@/lib/transcription/useMediaRecorder';
import { AudioLevelMeter } from '@/components/ui/AudioLevelMeter';
import { RealtimeVoiceSession, type RealtimeStatus } from '@/lib/realtime/realtimeVoiceSession';


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

  const [followManyVoice, setFollowManyVoice] = useState(false);

  // User explicitly dismissed the overlay — overrides all computed visibility.
  // Cleared whenever new recording/session activity begins.
  const [userDismissed, setUserDismissed] = useState(false);

  // ── Legacy recording via shared hook ──────────────────
  const legacyRecorder = useMediaRecorder({
    onBlob: async (blob) => {
      const tr = await transcribeAudioBlob(blob);
      if (!tr.success) {
        notifications.show({ title: t('manyVoice.transcribe_failed'), message: tr.error, color: 'red' });
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
    },
    onEmpty: () => {
      notifications.show({ title: t('media.dock_empty_recording'), message: t('media.dock_no_audio_captured'), color: 'yellow' });
      setFollowManyVoice(false);
    },
    onError: (msg) => {
      notifications.show({ title: t('media.dock_mic_permission'), message: msg, color: 'red' });
    },
  });
  const phase = legacyRecorder.phase;
  const legacyStreamRef = legacyRecorder.streamRef;

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
        // If Many becomes active again after a user dismiss, clear the dismissed flag
        // so the overlay reappears for the new activity.
        if (payload.status === 'speaking' || payload.status === 'thinking') {
          setUserDismissed(false);
        }
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
    setUserDismissed(false);
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
  const clearMainTts = useCallback(() => {
    void window.electron?.manyVoice?.dismissTtsError?.();
    setRemoteTtsError(null);
    setCurrentSentence(null);
  }, []);

  const startLegacyMic = useCallback(async () => {
    setUserDismissed(false);
    clearMainTts();
    if (typeof MediaRecorder === 'undefined' || !window.electron?.transcription?.bufferToText) {
      notifications.show({
        title: t('manyVoice.unavailable'),
        message: t('manyVoice.no_mediarecorder'),
        color: 'red',
      });
      return;
    }
    await legacyRecorder.startMicRecording();
  }, [clearMainTts, legacyRecorder, t]);

  const cancelAll = useCallback(() => {
    legacyRecorder.cancelRecording();
    setFollowManyVoice(false);
    closeRealtimeSession();
    setRealtimeError(null);
  }, [closeRealtimeSession, legacyRecorder]);

  // Dismiss overlay completely — resets all local state and hides the window.
  const dismissOverlay = useCallback(() => {
    cancelAll();
    setRemoteManyStatus('idle');
    setRemoteTtsError(null);
    setCurrentSentence(null);
    setUserDismissed(true);
    void window.electron?.manyVoice?.dismissTtsError?.();
  }, [cancelAll]);

  // ── Toggle handler (press to start / press to stop) ──
  useEffect(() => {
    if (!window.electron?.manyVoice?.onToggle) return undefined;
    return window.electron.manyVoice.onToggle(() => {
      if (isRealtimeActive) { closeRealtimeSession(); return; }
      if (phase === 'processing') return;
      if (phase === 'recording') { legacyRecorder.stopRecording(); return; }
      clearMainTts();
      void checkRealtimeAvailable().then((available) => {
        if (available) void startRealtimeSession('server_vad');
        else void startLegacyMic();
      });
    });
  }, [cancelAll, checkRealtimeAvailable, clearMainTts, closeRealtimeSession, isRealtimeActive, legacyRecorder, phase, startLegacyMic, startRealtimeSession]);

  // ── PTT handlers ─────────────────────────────────────
  useEffect(() => {
    const start = window.electron?.manyVoice?.onPttStart;
    const end = window.electron?.manyVoice?.onPttEnd;
    if (!start || !end) return undefined;
    const unA = start(() => {
      if (phase === 'processing') return;
      clearMainTts();
      void checkRealtimeAvailable().then((available) => {
        if (available) void startRealtimeSession('ptt');
        else void startLegacyMic();
      });
    });
    const unB = end(() => {
      if (sessionRef.current && realtimeModeRef.current === 'ptt') {
        sessionRef.current.commitAudio();
        return;
      }
      if (phase === 'recording') legacyRecorder.stopRecording();
    });
    return () => { unA?.(); unB?.(); };
  }, [cancelAll, checkRealtimeAvailable, clearMainTts, legacyRecorder, phase, startLegacyMic, startRealtimeSession]);

  // ── Cleanup on unmount ────────────────────────────────
  useEffect(() => () => {
    legacyRecorder.cancelRecording();
    closeRealtimeSession();
    wakeWordRecogRef.current?.abort();
    wakeWordRecogRef.current = null;
  }, [closeRealtimeSession, legacyRecorder]);

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

    // User closed the HUD with X — do not keep Web Speech wake listener (it uses the mic).
    if (userDismissed) {
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
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
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

    // Delay the first start to avoid triggering the OS mic indicator on app load.
    // Subsequent restarts (after session ends) start immediately.
    startupTimer = setTimeout(start, 2500);

    return () => {
      stopped = true;
      if (startupTimer !== null) clearTimeout(startupTimer);
      recog?.abort();
      wakeWordRecogRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealtimeActive, userDismissed]);


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
    !userDismissed && (
      isRealtimeActive ||
      realtimeStatus === 'error' ||
      Boolean(realtimeError) ||
      phase !== 'idle' ||
      followManyVoice ||
      Boolean(remoteTtsError) ||
      remoteManyStatus === 'speaking' ||
      remoteManyStatus === 'thinking'
    );

  useEffect(() => {
    if (!window.electron?.manyVoice?.overlaySetVisible) return;
    void window.electron.manyVoice.overlaySetVisible(hudOpen);
  }, [hudOpen]);

  // ── Notify AppShell top-bar indicators ─────────────────────────────────
  useEffect(() => {
    const isActive = isRealtimeActive || phase === 'recording' || phase === 'paused' || phase === 'processing';
    window.dispatchEvent(new CustomEvent(isActive ? 'dome:many-voice-started' : 'dome:many-voice-stopped'));
  }, [isRealtimeActive, phase]);

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
          {/* Live audio level meter */}
          <AudioLevelMeter
            stream={isRecording && !isRealtime ? legacyStreamRef.current : null}
            active={barsActive || barsBusy}
            color={barsActive ? 'var(--dome-accent, #7b76d0)' : 'color-mix(in srgb, var(--dome-accent, #7b76d0) 55%, var(--dome-text-muted, #999))'}
            idleColor="var(--dome-text-muted, #999)"
            height={24}
          />

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

          {/* Dismiss button — always visible so the overlay can always be closed */}
          <button
            type="button"
            onClick={dismissOverlay}
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
                dismissOverlay();
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
