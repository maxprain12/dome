/**
 * useMediaRecorder
 * Shared hook for microphone recording across ManyVoiceHud (legacy), ManyChatInput, and VoiceRecordingDock.
 *
 * Handles:
 *   - macOS microphone permission via IPC
 *   - getUserMedia (microphone)
 *   - MediaRecorder lifecycle (start / stop / cancel / pause / resume)
 *   - Chunk collection → Blob assembly
 *   - Minimum blob size validation
 *   - Timer (seconds counter)
 *   - Calls onBlob(blob, mimeType) on successful stop
 *
 * Desktop/system audio capture is NOT handled here — VoiceRecordingDock manages that separately
 * because it needs a source picker UI.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type RecordingPhase = 'idle' | 'recording' | 'paused' | 'processing';

export interface UseMediaRecorderOptions {
  /** Called with the final Blob and its MIME type after a successful recording. */
  onBlob: (blob: Blob, mimeType: string) => Promise<void>;
  /**
   * Minimum blob size in bytes before calling onBlob.
   * Recordings smaller than this are silently discarded.
   * @default 256
   */
  minBlobSize?: number;
  /**
   * Called when a recording is too short / empty so the caller can show a notification.
   */
  onEmpty?: () => void;
  /**
   * Called with error messages (mic permission denied, getUserMedia failure, etc.)
   */
  onError?: (message: string) => void;
}

export interface UseMediaRecorderReturn {
  phase: RecordingPhase;
  /** Elapsed recording seconds (paused time is excluded from counting). */
  seconds: number;
  /** Ref to the active MediaStream — useful for AudioLevelMeter. Null when not recording. */
  streamRef: RefObject<MediaStream | null>;
  /** Start microphone recording: requests permission on macOS, then opens getUserMedia. */
  startMicRecording: () => Promise<void>;
  /**
   * Start recording from an already-acquired MediaStream (e.g. desktop audio).
   * The hook takes ownership of the stream and will stop its tracks on cleanup.
   */
  startFromStream: (stream: MediaStream) => void;
  /** Stop recording and trigger transcription / onBlob. */
  stopRecording: () => void;
  /**
   * Cancel the current recording without processing the audio.
   * Also aborts the setup flow if called while mic is being acquired.
   */
  cancelRecording: () => void;
  /** Pause the current recording (MediaRecorder.pause). No-op if paused/idle. */
  pauseRecording: () => void;
  /** Resume a paused recording. No-op if not paused. */
  resumeRecording: () => void;
  /** Whether pause/resume is supported in this environment. */
  canPause: boolean;
}

/** Pick the best supported MIME type for MediaRecorder. */
export function pickRecordMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  return undefined;
}

export function useMediaRecorder({
  onBlob,
  minBlobSize = 256,
  onEmpty,
  onError,
}: UseMediaRecorderOptions): UseMediaRecorderReturn {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [seconds, setSeconds] = useState(0);

  // Keep callback refs always current so onstop (async) never calls a stale closure
  const onBlobRef = useRef(onBlob);
  const onEmptyRef = useRef(onEmpty);
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onBlobRef.current = onBlob;
    onEmptyRef.current = onEmpty;
    onErrorRef.current = onError;
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** When false, onstop will skip processing (used for cancel). */
  const processAfterStopRef = useRef(true);
  /** Set to true when the caller cancels mid-setup (between requestMicPermission and getUserMedia). */
  const cancelledDuringSetupRef = useRef(false);

  const canPause =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function';

  // ── Timer helpers ──────────────────────────────────────────────────────────

  const stopTick = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, [stopTick]);

  // ── Stream cleanup ─────────────────────────────────────────────────────────

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  // ── Full reset to idle ─────────────────────────────────────────────────────

  const resetToIdle = useCallback(() => {
    stopTick();
    setSeconds(0);
    setPhase('idle');
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, [stopTick]);

  // ── Core: attach event handlers and start a given MediaStream ─────────────

  const startFromStream = useCallback(
    (stream: MediaStream) => {
      streamRef.current = stream;
      chunksRef.current = [];
      processAfterStopRef.current = true;

      const mime = pickRecordMimeType();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onpause = () => {
        setPhase('paused');
        stopTick();
      };

      mr.onresume = () => {
        setPhase('recording');
        startTick();
      };

      mr.onstop = () => {
        void (async () => {
          cleanupStream();
          const shouldProcess = processAfterStopRef.current;
          processAfterStopRef.current = true;

          if (!shouldProcess) {
            resetToIdle();
            return;
          }

          const outMime = mr.mimeType || mime || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: outMime });
          chunksRef.current = [];

          if (blob.size < minBlobSize) {
            onEmptyRef.current?.();
            resetToIdle();
            return;
          }

          setPhase('processing');
          stopTick();
          setSeconds(0);
          mediaRecorderRef.current = null;

          try {
            await onBlobRef.current(blob, outMime);
          } finally {
            setPhase('idle');
          }
        })();
      };

      mr.start(200);
      setPhase('recording');
      setSeconds(0);
      startTick();
    },
    [cleanupStream, minBlobSize, resetToIdle, startTick, stopTick],
  );

  // ── Microphone recording (with optional macOS permission check) ────────────

  const startMicRecording = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined') {
      onErrorRef.current?.('MediaRecorder not available');
      return;
    }

    cancelledDuringSetupRef.current = false;

    try {
      // macOS requires explicit permission via IPC before getUserMedia works reliably
      if (typeof window !== 'undefined' && window.electron?.isMac) {
        const perm = await window.electron.transcription?.requestMicrophoneAccess?.();
        if (perm?.success === false || perm?.granted === false) {
          onErrorRef.current?.(perm?.error ?? 'Microphone access denied');
          return;
        }
      }

      if (cancelledDuringSetupRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (cancelledDuringSetupRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }

      startFromStream(stream);
    } catch (err) {
      cleanupStream();
      resetToIdle();
      onErrorRef.current?.(err instanceof Error ? err.message : String(err));
    }
  }, [cleanupStream, resetToIdle, startFromStream]);

  // ── Stop (process the audio) ───────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    processAfterStopRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      if (mr.state === 'paused') mr.resume(); // must resume before stop
      mr.stop();
    } else {
      resetToIdle();
    }
    stopTick();
  }, [resetToIdle, stopTick]);

  // ── Cancel (discard the audio) ─────────────────────────────────────────────

  const cancelRecording = useCallback(() => {
    // If still setting up (between perm check and getUserMedia), mark cancelled
    cancelledDuringSetupRef.current = true;
    processAfterStopRef.current = false;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      if (mr.state === 'paused') mr.resume();
      mr.stop();
    } else {
      cleanupStream();
      resetToIdle();
    }
    stopTick();
  }, [cleanupStream, resetToIdle, stopTick]);

  // ── Pause / Resume ─────────────────────────────────────────────────────────

  const pauseRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') {
      mr.pause();
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'paused') {
      mr.resume();
    }
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopTick();
      cleanupStream();
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        processAfterStopRef.current = false;
        try { mr.stop(); } catch { /* ignore */ }
      }
    };
  }, [cleanupStream, stopTick]);

  return {
    phase,
    seconds,
    streamRef,
    startMicRecording,
    startFromStream,
    stopRecording,
    cancelRecording,
    pauseRecording,
    resumeRecording,
    canPause,
  };
}
