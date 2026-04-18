import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Mic, Monitor, Square, X, Loader2, Pause, Play, RefreshCw, ImageOff, ChevronDown, ChevronUp } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useMediaRecorder } from '@/lib/transcription/useMediaRecorder';
import { AudioLevelMeter } from '@/components/ui/AudioLevelMeter';
import { useHubUi } from '@/lib/transcription/hubUiContext';
import { setTranscriptionTrayHandlers } from '@/lib/transcription/hubTrayHandlers';

type DesktopSource = {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnailDataUrl: string;
  iconDataUrl?: string;
};

type Props = {
  /** Reported to main for AppShell indicator (dictation / call / streaming). */
  hubMode?: 'dictation' | 'call' | 'streaming';
  /** When false, global shortcut does not toggle this mode (another hub mode is active). */
  isActive?: boolean;
};

export default function DictationMode({ hubMode = 'dictation', isActive = true }: Props) {
  const { t } = useTranslation();
  const hubUi = useHubUi();
  const hubMinimized = hubUi?.hubMinimized ?? false;
  const currentProject = useAppStore((s) => s.currentProject);

  // Dock visibility (separate from recording phase)
  const [visible, setVisible] = useState(false);
  const [saveAudioCopy, setSaveAudioCopy] = useState(true);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[] | null>(null);
  const [pickedSourceId, setPickedSourceId] = useState('');
  const [loadingSources, setLoadingSources] = useState(false);
  const [recordingInputKind, setRecordingInputKind] = useState<'microphone' | 'system' | 'both'>('microphone');
  const [screenPermStatus, setScreenPermStatus] = useState<'unknown' | 'granted' | 'denied' | 'not-determined' | 'restricted'>('unknown');
  /** True while getDisplayMedia / setup runs so the overlay stays open and Cancel does not unmount early. */
  const [systemCaptureStarting, setSystemCaptureStarting] = useState(false);

  const captureKindRef = useRef<'microphone' | 'system' | 'mic_and_system'>('microphone');
  const dualAudioResourcesRef = useRef<{
    mic: MediaStream;
    system: MediaStream;
    ctx: AudioContext;
  } | null>(null);

  function cleanupDualAudioResources() {
    const d = dualAudioResourcesRef.current;
    if (!d) return;
    dualAudioResourcesRef.current = null;
    d.mic.getTracks().forEach((tr) => tr.stop());
    d.system.getTracks().forEach((tr) => tr.stop());
    void d.ctx.close();
  }
  const systemCaptureStartingRef = useRef(false);
  const hubContentRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the mic setup was cancelled before getUserMedia resolved
  const desktopCancelRef = useRef(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewGenRef = useRef(0);
  const [previewLiveOk, setPreviewLiveOk] = useState(false);
  /** Bumps when a capture attempt ends so live preview can restart if still idle. */
  const [previewTick, setPreviewTick] = useState(0);

  useLayoutEffect(() => {
    systemCaptureStartingRef.current = systemCaptureStarting;
  }, [systemCaptureStarting]);

  // ── Note opening helper ────────────────────────────────────────────────────

  const openCreatedNote = useCallback((noteId: string, title: string) => {
    void window.electron?.transcriptionOverlay?.openNoteInMain?.({
      noteId,
      title: title || t('media.transcription_note_tab'),
    });
  }, [t]);

  // ── Shared MediaRecorder hook ──────────────────────────────────────────────

  const recorder = useMediaRecorder({
    onBlob: async (blob, mimeType) => {
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'webm';
      const projectId = currentProject?.id ?? 'default';
      const kind = captureKindRef.current;
      try {
        const buf = await blob.arrayBuffer();
        const result = await window.electron!.transcription.bufferToNote({
          buffer: buf,
          extension: ext,
          projectId,
          saveRecordingAsAudio: saveAudioCopy,
          captureKind: kind,
          callPlatform: 'unknown',
        });
        if (result.success && result.note) {
          notifications.show({
            title: t('media.dock_note_created'),
            message: result.note.title,
            color: 'green',
          });
          openCreatedNote(result.note.id, result.note.title || t('media.transcription_note_tab'));
        } else {
          notifications.show({
            title: t('media.dock_transcription_failed'),
            message: result.error || t('media.transcription_unknown_error'),
            color: 'red',
          });
        }
      } catch (err) {
        notifications.show({
          title: t('media.dock_transcription_failed'),
          message: err instanceof Error ? err.message : t('media.transcription_unknown_error'),
          color: 'red',
        });
      } finally {
        cleanupDualAudioResources();
        setVisible(false);
      }
    },
    onEmpty: () => {
      cleanupDualAudioResources();
      notifications.show({
        title: t('media.dock_empty_recording'),
        message: t('media.dock_no_audio_captured'),
        color: 'yellow',
      });
      setVisible(false);
    },
    onError: (msg) => {
      cleanupDualAudioResources();
      notifications.show({
        title: t('media.dock_mic_permission'),
        message: msg,
        color: 'red',
      });
      setVisible(false);
    },
  });

  const { phase, seconds, streamRef, canPause } = recorder;

  // ── Desktop sources ────────────────────────────────────────────────────────

  const loadDesktopSources = useCallback(async () => {
    if (!window.electron?.transcription?.listDesktopCaptureSources) return;
    setLoadingSources(true);
    try {
      const res = await window.electron.transcription.listDesktopCaptureSources();
      if (res.success && res.sources?.length) {
        setDesktopSources(res.sources.slice(0, 80));
        setPickedSourceId((prev) => prev || res.sources![0].id);
      } else {
        setDesktopSources([]);
        notifications.show({
          title: t('media.dock_sources_failed'),
          message: res.error || '',
          color: 'red',
        });
      }
    } catch (e) {
      notifications.show({
        title: t('media.dock_sources_failed'),
        message: e instanceof Error ? e.message : '',
        color: 'red',
      });
    } finally {
      setLoadingSources(false);
    }
  }, [t]);

  const stopDesktopPreview = useCallback(() => {
    const v = previewVideoRef.current;
    if (v) {
      v.srcObject = null;
    }
    const s = previewStreamRef.current;
    if (s) {
      for (const t of s.getTracks()) {
        t.onended = null;
        t.stop();
      }
      previewStreamRef.current = null;
    }
  }, []);

  // ── Recording: microphone ──────────────────────────────────────────────────

  const startRecordingMic = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !window.electron?.transcription) {
      notifications.show({
        title: t('media.dock_recording_unavailable'),
        message: t('media.dock_no_mediarecorder'),
        color: 'red',
      });
      setVisible(false);
      return;
    }
    desktopCancelRef.current = false;
    cleanupDualAudioResources();
    previewGenRef.current += 1;
    stopDesktopPreview();
    setPreviewLiveOk(false);
    captureKindRef.current = 'microphone';
    setRecordingInputKind('microphone');
    try {
      await recorder.startMicRecording();
    } finally {
      setPreviewTick((n) => n + 1);
    }
  }, [recorder, stopDesktopPreview, t]);

  // ── Recording: desktop/system audio ───────────────────────────────────────

  const startRecordingDesktop = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !window.electron?.transcription) {
      notifications.show({
        title: t('media.dock_recording_unavailable'),
        message: t('media.dock_no_mediarecorder'),
        color: 'red',
      });
      setVisible(false);
      return;
    }
    if (!pickedSourceId) {
      notifications.show({
        title: t('media.dock_pick_source'),
        message: t('media.dock_system_hint'),
        color: 'yellow',
      });
      return;
    }

    desktopCancelRef.current = false;
    cleanupDualAudioResources();
    captureKindRef.current = 'system';
    setRecordingInputKind('system');

    previewGenRef.current += 1;
    stopDesktopPreview();
    setPreviewLiveOk(false);
    setSystemCaptureStarting(true);

    try {
      // Tell the main process which source to use before calling getDisplayMedia.
      // The setDisplayMediaRequestHandler in main.cjs reads this and bypasses
      // Chromium's own picker, selecting the correct source directly.
      await window.electron.transcription.setDisplayMediaSource(pickedSourceId);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      if (desktopCancelRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        setVisible(false);
        return;
      }

      const audioTracks = stream.getAudioTracks();
      stream.getVideoTracks().forEach((tr) => tr.stop());

      if (!audioTracks.length) {
        stream.getTracks().forEach((tr) => tr.stop());
        notifications.show({
          title: t('media.dock_empty_recording'),
          message: window.electron?.isMac ? t('media.dock_no_system_audio_track') : t('media.dock_system_hint'),
          color: 'yellow',
        });
        setVisible(false);
        return;
      }

      // Brief silence check: if the audio track appears completely silent right
      // after capture, warn the user — this typically means Screen Recording
      // permission is granted but the OS is providing a muted/empty track.
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const maxLevel = data.reduce((a, b) => Math.max(a, b), 0);
        void ctx.close();
        if (maxLevel === 0) {
          notifications.show({
            title: t('media.dock_recording_unavailable'),
            message: t('media.dock_silent_audio_warning'),
            color: 'yellow',
          });
          audioTracks.forEach((tr) => tr.stop());
          setVisible(false);
          return;
        }
      } catch {
        // If AudioContext check fails for any reason, proceed anyway
      }

      recorder.startFromStream(new MediaStream(audioTracks));
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const msg = err instanceof Error ? err.message : String(err);

      // Update local screen permission state on denial
      if (name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
        setScreenPermStatus('denied');
      }

      let message = msg;
      if (name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
        message = window.electron?.isMac ? t('media.dock_screen_denied_mac') : t('media.dock_system_hint');
      } else if (/audio|track/i.test(msg) && !/video/i.test(msg)) {
        message = t('media.dock_no_system_audio_track');
      }
      notifications.show({ title: t('media.dock_recording_unavailable'), message, color: 'red' });
      setVisible(false);
    } finally {
      setSystemCaptureStarting(false);
      setPreviewTick((n) => n + 1);
    }
  }, [pickedSourceId, recorder, stopDesktopPreview, t]);

  // ── Recording: microphone + system (mixed) ────────────────────────────────

  const startRecordingMicAndSystem = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !window.electron?.transcription) {
      notifications.show({
        title: t('media.dock_recording_unavailable'),
        message: t('media.dock_no_mediarecorder'),
        color: 'red',
      });
      setVisible(false);
      return;
    }
    if (!pickedSourceId) {
      notifications.show({
        title: t('media.dock_pick_source'),
        message: t('media.dock_mic_system_explain'),
        color: 'yellow',
      });
      return;
    }

    desktopCancelRef.current = false;
    cleanupDualAudioResources();
    captureKindRef.current = 'mic_and_system';
    setRecordingInputKind('both');

    previewGenRef.current += 1;
    stopDesktopPreview();
    setPreviewLiveOk(false);
    setSystemCaptureStarting(true);

    let systemStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;

    try {
      if (window.electron?.isMac) {
        const perm = await window.electron.transcription?.requestMicrophoneAccess?.();
        if (perm?.success === false || perm?.granted === false) {
          notifications.show({
            title: t('media.dock_mic_permission'),
            message: perm?.error?.trim() ? perm.error : t('media.dock_mic_denied'),
            color: 'red',
          });
          setVisible(false);
          return;
        }
      }

      if (desktopCancelRef.current) return;

      await window.electron.transcription.setDisplayMediaSource(pickedSourceId);

      if (desktopCancelRef.current) return;

      systemStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      if (desktopCancelRef.current) {
        systemStream.getTracks().forEach((tr) => tr.stop());
        return;
      }

      const audioTracks = systemStream.getAudioTracks();
      systemStream.getVideoTracks().forEach((tr) => tr.stop());

      if (!audioTracks.length) {
        systemStream.getTracks().forEach((tr) => tr.stop());
        notifications.show({
          title: t('media.dock_empty_recording'),
          message: window.electron?.isMac ? t('media.dock_no_system_audio_track') : t('media.dock_system_hint'),
          color: 'yellow',
        });
        setVisible(false);
        return;
      }

      try {
        const ctxProbe = new AudioContext();
        const source = ctxProbe.createMediaStreamSource(new MediaStream(audioTracks));
        const analyser = ctxProbe.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const maxLevel = data.reduce((a, b) => Math.max(a, b), 0);
        void ctxProbe.close();
        if (maxLevel === 0) {
          notifications.show({
            title: t('media.dock_recording_unavailable'),
            message: t('media.dock_silent_audio_warning'),
            color: 'yellow',
          });
          audioTracks.forEach((tr) => tr.stop());
          setVisible(false);
          return;
        }
      } catch {
        // proceed if probe fails
      }

      if (desktopCancelRef.current) {
        audioTracks.forEach((tr) => tr.stop());
        return;
      }

      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (desktopCancelRef.current) {
        micStream.getTracks().forEach((tr) => tr.stop());
        audioTracks.forEach((tr) => tr.stop());
        return;
      }

      const systemAudioStream = new MediaStream(audioTracks);
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const gainMic = ctx.createGain();
      const gainSys = ctx.createGain();
      gainMic.gain.value = 1;
      gainSys.gain.value = 1;
      ctx.createMediaStreamSource(micStream).connect(gainMic).connect(dest);
      ctx.createMediaStreamSource(systemAudioStream).connect(gainSys).connect(dest);
      await ctx.resume();

      dualAudioResourcesRef.current = { mic: micStream, system: systemAudioStream, ctx };
      micStream = null;

      recorder.startFromStream(dest.stream);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const msg = err instanceof Error ? err.message : String(err);

      if (name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
        setScreenPermStatus('denied');
      }

      let message = msg;
      if (name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
        message = window.electron?.isMac ? t('media.dock_screen_denied_mac') : t('media.dock_system_hint');
      } else if (/audio|track/i.test(msg) && !/video/i.test(msg)) {
        message = t('media.dock_no_system_audio_track');
      }
      notifications.show({ title: t('media.dock_recording_unavailable'), message, color: 'red' });
      setVisible(false);

      if (micStream) micStream.getTracks().forEach((tr) => tr.stop());
      if (systemStream) systemStream.getTracks().forEach((tr) => tr.stop());
      cleanupDualAudioResources();
    } finally {
      setSystemCaptureStarting(false);
      setPreviewTick((n) => n + 1);
    }
  }, [pickedSourceId, recorder, stopDesktopPreview, t]);

  // ── Stop / Cancel ──────────────────────────────────────────────────────────

  const requestStopAndTranscribe = useCallback(() => {
    if (phase === 'idle') {
      setVisible(false);
      return;
    }
    recorder.stopRecording();
  }, [phase, recorder]);

  const requestCancel = useCallback(() => {
    if (phase === 'processing') return;
    desktopCancelRef.current = true;
    if (systemCaptureStarting) {
      // Wait for getDisplayMedia to finish; startRecordingDesktop will close or continue.
      return;
    }
    recorder.cancelRecording();
    cleanupDualAudioResources();
    setVisible(false);
  }, [phase, recorder, systemCaptureStarting]);

  useEffect(() => {
    if (!isActive || !visible) {
      setTranscriptionTrayHandlers(null);
      return undefined;
    }
    const live = phase === 'recording' || phase === 'paused';
    if (!live) {
      setTranscriptionTrayHandlers(null);
      return undefined;
    }
    setTranscriptionTrayHandlers({
      onStop: () => requestStopAndTranscribe(),
      onCancel: () => requestCancel(),
      onPauseResume: () => {
        if (phase === 'paused') recorder.resumeRecording();
        else if (phase === 'recording') recorder.pauseRecording();
      },
    });
    return () => setTranscriptionTrayHandlers(null);
  }, [isActive, visible, phase, recorder, requestStopAndTranscribe, requestCancel]);

  // ── Toggle handler (IPC shortcut + DOM event) ──────────────────────────────

  const toggleDockRef = useRef<() => void>(() => {});
  toggleDockRef.current = () => {
    if (phase === 'processing') return;
    if (systemCaptureStartingRef.current) {
      desktopCancelRef.current = true;
      return;
    }
    if (phase === 'recording' || phase === 'paused') {
      requestStopAndTranscribe();
      return;
    }
    if (visible && phase === 'idle') {
      requestCancel();
      return;
    }
    setVisible(true);
    setDesktopSources(null);
    setPickedSourceId('');
    // Fetch permission status and sources eagerly when dock opens
    void (async () => {
      if (window.electron?.transcription?.getPermissionsStatus) {
        const perm = await window.electron.transcription.getPermissionsStatus();
        if (perm.success && perm.screen) {
          setScreenPermStatus(perm.screen as typeof screenPermStatus);
        }
      }
    })();
  };

  useEffect(() => {
    if (!isActive) return undefined;
    if (!window.electron?.transcription?.onToggleRecording) return undefined;
    return window.electron.transcription.onToggleRecording(() => {
      toggleDockRef.current();
    });
  }, [isActive]);

  // Auto-load desktop sources when dock opens (skip if permission explicitly denied)
  useEffect(() => {
    if (!visible) return;
    if (screenPermStatus === 'denied') return;
    void loadDesktopSources();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Broadcast hub state to main (AppShell mic indicator, cross-window) ───

  useEffect(() => {
    if (!window.electron?.transcriptionOverlay?.setState) return undefined;
    void window.electron.transcriptionOverlay.setState({
      mode: hubMode,
      phase,
      seconds,
      hubVisible: visible,
      captureKind: recordingInputKind === 'both' ? 'mic_and_system' : recordingInputKind,
      canPause,
    });
    return undefined;
  }, [hubMode, phase, seconds, visible, recordingInputKind, canPause]);

  // ── Overlay window sync ────────────────────────────────────────────────────

  useEffect(() => {
    if (!window.electron?.transcriptionOverlay?.overlaySetVisible) return undefined;
    void window.electron.transcriptionOverlay.overlaySetVisible(visible);
    return undefined;
  }, [visible]);

  // Live desktop/window preview (getDisplayMedia video only) while idle + source picked.
  useEffect(() => {
    if (!visible || phase !== 'idle' || !pickedSourceId || screenPermStatus === 'denied' || systemCaptureStarting) {
      setPreviewLiveOk(false);
      stopDesktopPreview();
      return undefined;
    }
    if (!window.electron?.transcription?.setDisplayMediaSource) {
      return undefined;
    }

    let cancelled = false;
    const gen = ++previewGenRef.current;
    setPreviewLiveOk(false);

    void (async () => {
      try {
        const setRes = await window.electron.transcription.setDisplayMediaSource(pickedSourceId);
        if (!setRes.success || cancelled || gen !== previewGenRef.current) return;

        // Video-only: avoids starting macOS system-audio loopback for preview (see main setDisplayMediaRequestHandler).
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        if (cancelled || gen !== previewGenRef.current) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        stream.getAudioTracks().forEach((tr) => tr.stop());

        stopDesktopPreview();

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState === 'ended') {
          stream.getTracks().forEach((tr) => tr.stop());
          if (gen === previewGenRef.current) setPreviewLiveOk(false);
          return;
        }

        const previewOnly = new MediaStream([videoTrack]);
        previewStreamRef.current = previewOnly;

        const onEnded = () => {
          if (gen !== previewGenRef.current) return;
          setPreviewLiveOk(false);
          stopDesktopPreview();
        };
        videoTrack.onended = onEnded;

        const el = previewVideoRef.current;
        if (el) {
          el.srcObject = previewOnly;
          void el.play().catch(() => {});
        }
        if (gen === previewGenRef.current) setPreviewLiveOk(true);
      } catch {
        if (!cancelled && gen === previewGenRef.current) {
          setPreviewLiveOk(false);
          stopDesktopPreview();
        }
      }
    })();

    return () => {
      cancelled = true;
      setPreviewLiveOk(false);
      stopDesktopPreview();
    };
  }, [visible, phase, pickedSourceId, screenPermStatus, stopDesktopPreview, previewTick, systemCaptureStarting]);

  const selectedDesktopSource = useMemo(
    () => desktopSources?.find((s) => s.id === pickedSourceId) ?? null,
    [desktopSources, pickedSourceId],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!visible) return null;

  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;

  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';
  const isProcessing = phase === 'processing';
  const isReady = phase === 'idle';
  const showSetupChrome = isReady && !systemCaptureStarting;

  const overlayChrome = {
    background: 'color-mix(in srgb, var(--dome-bg, #fff) 94%, transparent)',
    borderColor: 'color-mix(in srgb, var(--dome-border, #ddd) 50%, transparent)',
    boxShadow: isRecording
      ? '0 0 0 1.5px color-mix(in srgb, var(--dome-accent, #7b76d0) 35%, transparent), 0 8px 32px color-mix(in srgb, black 14%, transparent)'
      : '0 8px 32px color-mix(in srgb, black 14%, transparent)',
    transition: 'box-shadow 0.3s ease',
  };

  const overlayOuter = 'relative z-10 flex max-h-full min-h-0 w-full justify-center pointer-events-none';

  const overlayWrapper =
    'relative z-10 flex max-h-full min-h-0 w-full max-w-[min(96vw,560px)] flex-col items-stretch gap-1.5 overflow-x-hidden overflow-y-auto rounded-2xl border px-3 py-2 shadow-xl sm:max-w-[min(96vw,900px)] sm:gap-2 sm:rounded-2xl sm:px-3.5 sm:py-2.5';

  const iconBtnBase =
    'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors';

  if (hubMinimized) {
    return (
      <div className={overlayOuter} aria-live="polite">
        <div
          ref={hubContentRef}
          className={`${overlayWrapper} pointer-events-auto`}
          style={overlayChrome}
        >
          <div className="flex flex-wrap items-center gap-2 min-h-[36px]" style={{ color: 'var(--dome-text)' }}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                <span className="text-xs font-medium flex-1 min-w-[120px] truncate sm:text-sm">{t('media.dock_transcribing')}</span>
              </>
            ) : systemCaptureStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                <span className="text-xs font-medium flex-1 min-w-[120px] truncate sm:text-sm">{t('media.dock_connecting_system')}</span>
              </>
            ) : isRecording || isPaused ? (
              <>
                <AudioLevelMeter
                  stream={isRecording || isPaused ? streamRef.current : null}
                  active={isRecording || isPaused}
                  height={18}
                />
                {(recordingInputKind === 'system' || recordingInputKind === 'both') && (
                  <Monitor className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                )}
                <span className="text-xs font-medium min-w-0 flex-1 sm:text-sm">
                  <span className="font-mono tabular-nums opacity-80">{timeStr}</span>
                </span>
                {canPause && (
                  <button
                    type="button"
                    onClick={isPaused ? recorder.resumeRecording : recorder.pauseRecording}
                    className="shrink-0 rounded-md flex items-center justify-center transition-colors"
                    style={{
                      width: 28,
                      height: 28,
                      background: 'var(--dome-bg-hover)',
                      color: 'var(--dome-text)',
                      border: '1px solid var(--dome-border)',
                    }}
                    title={isPaused ? t('media.dock_resume') : t('media.dock_pause')}
                  >
                    {isPaused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                )}
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                <span className="text-xs font-medium flex-1 sm:text-sm">{t('media.dock_choose_input')}</span>
              </>
            )}
          </div>

          {showSetupChrome ? (
            <p className="text-[10px] leading-snug sm:text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
              {t('hub.minimized_setup_hint')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {hubUi ? (
              <button
                type="button"
                onClick={() => hubUi.expandHub()}
                className={`${iconBtnBase} mr-auto h-8 w-8`}
                style={{
                  color: 'var(--dome-accent)',
                  background: 'color-mix(in srgb, var(--dome-accent) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--dome-accent) 28%, transparent)',
                }}
                title={t('hub.expand_panel')}
                aria-label={t('hub.expand_panel')}
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={requestCancel}
              disabled={isProcessing}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium sm:px-3 sm:text-xs"
              style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t('media.dock_cancel')}
            </button>
            <button
              type="button"
              onClick={requestStopAndTranscribe}
              disabled={isProcessing || !(isRecording || isPaused)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-45 sm:px-3 sm:text-xs"
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              {t('media.dock_stop_transcribe')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayOuter} aria-live="polite">
      <div
        ref={hubContentRef}
        className={`${overlayWrapper} pointer-events-auto`}
        style={overlayChrome}
      >
        {/* ── Top bar: estado compacto + minimizar ── */}
        {isProcessing ? (
          <div className="flex min-h-[40px] items-center gap-2" style={{ color: 'var(--dome-text)' }}>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--dome-accent)' }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">{t('media.dock_transcribing')}</span>
            {hubUi ? (
              <button
                type="button"
                onClick={() => hubUi.toggleHubMinimized()}
                className={`${iconBtnBase} h-8 w-8`}
                style={{
                  color: 'var(--dome-text-muted)',
                  background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
                }}
                title={t('hub.minimize_panel')}
                aria-label={t('hub.minimize_panel')}
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : systemCaptureStarting ? (
          <div className="flex min-h-[40px] flex-col gap-1">
            <div className="flex items-center gap-2" style={{ color: 'var(--dome-text)' }}>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">{t('media.dock_connecting_system')}</span>
              {hubUi ? (
                <button
                  type="button"
                  onClick={() => hubUi.toggleHubMinimized()}
                  className={`${iconBtnBase} h-8 w-8`}
                  style={{
                    color: 'var(--dome-text-muted)',
                    background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
                  }}
                  title={t('hub.minimize_panel')}
                  aria-label={t('hub.minimize_panel')}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <p className="text-[10px] leading-snug sm:text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
              {t('media.dock_connecting_system_hint')}
            </p>
          </div>
        ) : isRecording || isPaused ? (
          <>
            <div className="flex min-h-[44px] flex-wrap items-center gap-x-2 gap-y-2">
              <div className="flex min-w-[min(100%,200px)] min-h-0 flex-1 items-center gap-2">
                <AudioLevelMeter
                  stream={streamRef.current}
                  active={isRecording || isPaused}
                  height={18}
                />
                {(recordingInputKind === 'system' || recordingInputKind === 'both') && (
                  <Monitor className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                )}
                <span
                  className="min-w-0 flex-1 text-[11px] font-medium leading-snug sm:text-xs"
                  style={{ color: 'var(--dome-text)' }}
                >
                  <span className="opacity-90">{isPaused ? t('media.dock_paused') : t('media.dock_recording')}</span>
                  <span className="mx-1 opacity-35" aria-hidden>
                    ·
                  </span>
                  <span className="font-normal opacity-80">
                    {recordingInputKind === 'system'
                      ? t('media.dock_recording_system_line')
                      : recordingInputKind === 'both'
                        ? t('media.dock_recording_both_line')
                        : t('media.dock_recording_mic_line')}
                  </span>
                  <span className="ml-1.5 font-mono tabular-nums text-[11px] opacity-75">{timeStr}</span>
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:ml-auto">
                {canPause ? (
                  <button
                    type="button"
                    onClick={isPaused ? recorder.resumeRecording : recorder.pauseRecording}
                    className={`${iconBtnBase} h-8 w-8`}
                    style={{
                      background: 'var(--dome-bg-hover)',
                      color: 'var(--dome-text)',
                      border: '1px solid var(--dome-border)',
                    }}
                    title={isPaused ? t('media.dock_resume') : t('media.dock_pause')}
                  >
                    {isPaused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                ) : null}
                {hubUi ? (
                  <button
                    type="button"
                    onClick={() => hubUi.toggleHubMinimized()}
                    className={`${iconBtnBase} h-8 w-8`}
                    style={{
                      color: 'var(--dome-text-muted)',
                      background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
                    }}
                    title={t('hub.minimize_panel')}
                    aria-label={t('hub.minimize_panel')}
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={requestCancel}
                  className={`${iconBtnBase} gap-1 px-2.5 py-1.5 text-[11px] font-medium sm:h-8 sm:px-3 sm:text-xs`}
                  style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
                >
                  <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t('media.dock_cancel')}
                </button>
                <button
                  type="button"
                  onClick={requestStopAndTranscribe}
                  className={`${iconBtnBase} gap-1 px-2.5 py-1.5 text-[11px] font-medium sm:h-8 sm:px-3 sm:text-xs`}
                  style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
                >
                  <Square className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t('media.dock_stop_transcribe')}
                </button>
              </div>
            </div>
            <label
              className="flex cursor-default items-center gap-2 text-[10px] leading-snug sm:text-[11px]"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <input type="checkbox" checked={saveAudioCopy} disabled className="cursor-not-allowed opacity-70" />
              {t('media.dock_save_audio_copy')}
            </label>
          </>
        ) : (
          <div className="flex min-h-[40px] items-center justify-between gap-2" style={{ color: 'var(--dome-text)' }}>
            <div className="flex min-w-0 items-center gap-2">
              <Mic className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              <span className="truncate text-sm font-semibold tracking-tight">{t('media.dock_choose_input')}</span>
            </div>
            {hubUi ? (
              <button
                type="button"
                onClick={() => hubUi.toggleHubMinimized()}
                className={`${iconBtnBase} h-8 w-8`}
                style={{
                  color: 'var(--dome-text-muted)',
                  background: 'color-mix(in srgb, var(--dome-bg-hover) 85%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--dome-border) 55%, transparent)',
                }}
                title={t('hub.minimize_panel')}
                aria-label={t('hub.minimize_panel')}
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        )}

        {/* ── Source selector (only when ready, not while connecting) ── */}
        {showSetupChrome ? (
          <>
            <div
              className="rounded-xl p-2 sm:p-2.5"
              style={{
                border: '1px solid var(--dome-border)',
                background: 'color-mix(in srgb, var(--dome-surface) 88%, transparent)',
              }}
            >
              <p
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                {t('hub.dock_section_mic')}
              </p>
              <button
                type="button"
                onClick={() => void startRecordingMic()}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white"
                style={{ background: 'var(--dome-accent)' }}
              >
                <Mic className="h-4 w-4 shrink-0" aria-hidden />
                {t('media.dock_record_mic')}
              </button>
              <p
                className="mt-1 line-clamp-2 text-[10px] leading-snug sm:line-clamp-none"
                style={{ color: 'var(--dome-text-muted)' }}
                title={t('media.dock_mic_only_explain')}
              >
                {t('media.dock_mic_only_explain')}
              </p>
            </div>

            <div
              className="flex flex-col gap-1.5 rounded-xl p-2 sm:p-2.5"
              style={{
                border: '1px solid var(--dome-border)',
                background: 'color-mix(in srgb, var(--dome-surface) 88%, transparent)',
              }}
              title={t('media.dock_system_hint')}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                {t('hub.dock_section_screen')}
              </p>
              <p className="line-clamp-2 text-[10px] leading-snug sm:line-clamp-3" style={{ color: 'var(--dome-text-muted)' }}>
                {t('media.dock_system_capture_explain')}
              </p>
              <div className="flex shrink-0 items-center justify-between gap-2 min-h-[28px]">
                <span className="text-[11px] font-medium tracking-tight" style={{ color: 'var(--dome-text)' }}>
                  {t('media.dock_mode_system')}
                </span>
                <button
                  type="button"
                  onClick={() => void loadDesktopSources()}
                  disabled={loadingSources || screenPermStatus === 'denied'}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-opacity disabled:opacity-40"
                  style={{
                    color: 'var(--dome-accent)',
                    background: 'color-mix(in srgb, var(--dome-accent) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--dome-border) 70%, transparent)',
                  }}
                  title={t('media.dock_refresh_sources')}
                  aria-label={t('media.dock_refresh_sources')}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingSources ? 'animate-spin' : ''}`} aria-hidden />
                </button>
              </div>

              {screenPermStatus === 'denied' && window.electron?.isMac && (
                <div
                  className="shrink-0 rounded-lg px-2.5 py-2 text-[11px] leading-snug"
                  style={{ background: 'color-mix(in srgb, var(--dome-error, #ef4444) 12%, transparent)', color: 'var(--dome-error, #ef4444)' }}
                >
                  <p className="mb-1">{t('media.dock_perm_screen_denied')}</p>
                  <button
                    type="button"
                    className="underline text-[11px]"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dome-error, #ef4444)' }}
                    onClick={() => window.electron?.invoke?.('open-external-url', 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture').catch((err) => { console.error('[DictationMode] Failed to open system preferences:', err); })}
                  >
                    {t('media.dock_perm_screen_open_prefs')}
                  </button>
                </div>
              )}

              <div className="flex h-[min(26vh,200px)] max-h-[min(28vh,220px)] min-h-[112px] w-full shrink-0 flex-col gap-2 overflow-hidden sm:h-[min(248px,calc(100vh-320px))] sm:max-h-[min(280px,calc(100vh-280px))] sm:flex-row">
                <div className="flex h-[min(112px,24vh)] min-h-[96px] w-full shrink-0 flex-col overflow-hidden sm:h-full sm:w-[220px] sm:min-w-[180px] sm:max-w-[240px]">
                  <div
                    className="min-h-0 h-full max-h-full overflow-y-auto overflow-x-hidden rounded-xl overscroll-contain pr-0.5 [scrollbar-gutter:stable] [scrollbar-width:thin]"
                    style={{
                      border: '1px solid var(--dome-border)',
                      background: 'var(--dome-surface)',
                    }}
                    role="listbox"
                    aria-label={t('media.dock_mode_system')}
                  >
                    {loadingSources && (!desktopSources || desktopSources.length === 0) ? (
                      <div className="flex items-center justify-center gap-2 px-3 py-6 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                        <span>{t('media.dock_loading_sources')}</span>
                      </div>
                    ) : null}
                    {!loadingSources &&
                    desktopSources &&
                    desktopSources.length === 0 &&
                    screenPermStatus !== 'denied' ? (
                      <div className="px-3 py-5 text-center text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                        {t('media.dock_no_capture_sources')}
                      </div>
                    ) : null}
                    {desktopSources?.map((s) => {
                      const selected = s.id === pickedSourceId;
                      const kindLabel =
                        s.kind === 'screen' ? t('media.dock_source_kind_screen') : t('media.dock_source_kind_window');
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => setPickedSourceId(s.id)}
                          className="flex w-full items-center gap-1.5 border-b px-1.5 py-1.5 text-left transition-colors last:border-b-0 sm:gap-2 sm:px-2 sm:py-2"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--dome-border) 55%, transparent)',
                            background: selected
                              ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)'
                              : 'transparent',
                          }}
                        >
                          {s.thumbnailDataUrl ? (
                            <img
                              src={s.thumbnailDataUrl}
                              alt=""
                              className="h-8 w-14 shrink-0 rounded object-cover sm:h-9 sm:w-[60px]"
                              style={{ border: '1px solid var(--dome-border)' }}
                            />
                          ) : (
                            <div
                              className="flex h-8 w-14 shrink-0 items-center justify-center rounded text-[10px] sm:h-9 sm:w-[60px]"
                              style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
                            >
                              —
                            </div>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium" style={{ color: 'var(--dome-text)' }} title={s.name}>
                            {s.name}
                          </span>
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                            style={{
                              color: 'var(--dome-text-muted)',
                              background: 'var(--dome-bg-hover)',
                            }}
                          >
                            {kindLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <div
                    className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-xl"
                    style={{
                      background: 'var(--dome-bg-hover)',
                      border: '1px solid var(--dome-border)',
                    }}
                  >
                    <div className="relative h-full min-h-[96px] w-full sm:min-h-[120px]">
                      {selectedDesktopSource?.thumbnailDataUrl ? (
                        <img
                          src={selectedDesktopSource.thumbnailDataUrl}
                          alt=""
                          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
                            previewLiveOk ? 'opacity-0' : 'opacity-100'
                          }`}
                          style={{ background: 'var(--dome-bg-hover)' }}
                          decoding="async"
                          aria-hidden={previewLiveOk}
                        />
                      ) : null}
                      <video
                        ref={previewVideoRef}
                        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
                          previewLiveOk ? 'z-[1] opacity-100' : 'pointer-events-none opacity-0'
                        }`}
                        style={{ background: 'var(--dome-bg-hover)' }}
                        muted
                        playsInline
                        autoPlay
                      />
                      {!selectedDesktopSource?.thumbnailDataUrl && !previewLiveOk ? (
                        <div
                          className="flex h-full min-h-[96px] w-full flex-col items-center justify-center gap-1 px-2 text-center sm:min-h-[120px] sm:px-3"
                          style={{ color: 'var(--dome-text-muted)' }}
                        >
                          <ImageOff className="h-6 w-6 opacity-50" aria-hidden />
                          <span className="text-[11px] leading-tight">
                            {desktopSources && desktopSources.length === 0
                              ? t('media.dock_pick_source')
                              : t('media.dock_preview_placeholder')}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void startRecordingDesktop()}
                disabled={!pickedSourceId || !desktopSources?.length || screenPermStatus === 'denied'}
                className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-45 sm:rounded-xl sm:py-2.5"
                style={{
                  borderColor: 'var(--dome-border)',
                  color: 'var(--dome-text)',
                  background: 'var(--dome-surface)',
                }}
              >
                <Monitor className="h-4 w-4 shrink-0" aria-hidden />
                {t('media.dock_start_system_capture')}
              </button>

              <p className="line-clamp-2 text-[10px] leading-snug sm:line-clamp-none" style={{ color: 'var(--dome-text-muted)' }}>
                {t('media.dock_mic_system_explain')}
              </p>
              <button
                type="button"
                onClick={() => void startRecordingMicAndSystem()}
                disabled={!pickedSourceId || !desktopSources?.length || screenPermStatus === 'denied'}
                className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-45 sm:rounded-xl sm:py-2.5"
                style={{
                  borderColor: 'color-mix(in srgb, var(--dome-accent) 35%, var(--dome-border))',
                  color: 'var(--dome-text)',
                  background: 'color-mix(in srgb, var(--dome-accent) 10%, var(--dome-surface))',
                }}
              >
                <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden>
                  <Mic className="h-3.5 w-3.5" />
                  <Monitor className="h-3.5 w-3.5" />
                </span>
                {t('media.dock_record_mic_and_system')}
              </button>
            </div>
          </>
        ) : null}

        {showSetupChrome ? (
          <label className="flex cursor-pointer items-center gap-2 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
            <input
              type="checkbox"
              checked={saveAudioCopy}
              onChange={(e) => setSaveAudioCopy(e.target.checked)}
              className="cursor-pointer"
            />
            {t('media.dock_save_audio_copy')}
          </label>
        ) : null}

        {!isRecording && !isPaused && !isProcessing ? (
          <div className="flex items-center justify-end gap-2 border-t pt-2" style={{ borderColor: 'var(--dome-border)' }}>
            <button
              type="button"
              onClick={requestCancel}
              className={`${iconBtnBase} gap-1 px-3 py-1.5 text-xs font-medium`}
              style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t('media.dock_cancel')}
            </button>
            <button
              type="button"
              onClick={requestStopAndTranscribe}
              disabled
              className={`${iconBtnBase} gap-1 px-3 py-1.5 text-xs font-medium opacity-40`}
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              {t('media.dock_stop_transcribe')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
