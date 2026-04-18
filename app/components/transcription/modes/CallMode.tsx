import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, X, Loader2, Pause, Play, RefreshCw, ImageOff, Phone } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useDualRecorder } from '@/lib/transcription/useDualRecorder';
import { WaveformMeter } from '@/components/transcription/WaveformMeter';
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
  isActive?: boolean;
};

export default function CallMode({ isActive = true }: Props) {
  const { t } = useTranslation();
  const hubUi = useHubUi();
  const hubMinimized = hubUi?.hubMinimized ?? false;
  const currentProject = useAppStore((s) => s.currentProject);

  const [visible, setVisible] = useState(false);
  const [saveAudioCopy, setSaveAudioCopy] = useState(true);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[] | null>(null);
  const [pickedSourceId, setPickedSourceId] = useState('');
  const [loadingSources, setLoadingSources] = useState(false);
  const [screenPermStatus, setScreenPermStatus] = useState<
    'unknown' | 'granted' | 'denied' | 'not-determined' | 'restricted'
  >('unknown');
  const [liveText, setLiveText] = useState('');
  const [showLiveTranscript, setShowLiveTranscript] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [chunkMs, setChunkMs] = useState(30000);
  const chunkMsRef = useRef(30000);

  const sessionRef = useRef<{ id: string; wallStart: number } | null>(null);
  const micSeqRef = useRef(0);
  const sysSeqRef = useRef(0);
  const desktopCancelRef = useRef(false);
  const hubContentRef = useRef<HTMLDivElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewGenRef = useRef(0);
  const [previewLiveOk, setPreviewLiveOk] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);
  const livePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endCallSessionRef = useRef<(cancel: boolean) => Promise<void>>(async () => {});
  const dualOpRef = useRef<{ cancelBoth: () => void; stopBoth: () => void }>({
    cancelBoth: () => {},
    stopBoth: () => {},
  });

  useEffect(() => {
    chunkMsRef.current = chunkMs;
  }, [chunkMs]);

  useEffect(() => {
    void (async () => {
      const res = await window.electron?.transcription?.getSettings?.();
      if (!res?.success || !res.data) return;
      const d = res.data as typeof res.data & { callShowLiveTranscriptDefault?: boolean };
      if (d.callChunkSec != null) {
        const ms = Math.min(60000, Math.max(20000, Number(d.callChunkSec) * 1000));
        setChunkMs(ms);
      }
      if (typeof d.callShowLiveTranscriptDefault === 'boolean') {
        setShowLiveTranscript(d.callShowLiveTranscriptDefault);
      }
    })();
  }, []);

  const flushMicChunk = useCallback(
    async (blob: Blob, mimeType: string) => {
      const s = sessionRef.current;
      if (!s?.id || !window.electron?.calls?.appendChunk) return;
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'webm';
      const endWall = Date.now();
      const startMs = Math.max(0, endWall - s.wallStart - chunkMsRef.current);
      try {
        const buf = await blob.arrayBuffer();
        const res = await window.electron.calls.appendChunk({
          sessionId: s.id,
          track: 'mic',
          buffer: buf,
          seq: micSeqRef.current++,
          startMs,
          extension: ext,
        });
        if (res && !res.success && res.error) {
          console.warn('[CallMode] mic chunk:', res.error);
        }
      } catch (e) {
        console.warn('[CallMode] mic chunk', e);
      }
    },
    [],
  );

  const flushSysChunk = useCallback(async (blob: Blob, mimeType: string) => {
    const s = sessionRef.current;
    if (!s?.id || !window.electron?.calls?.appendChunk) return;
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    const endWall = Date.now();
    const startMs = Math.max(0, endWall - s.wallStart - chunkMsRef.current);
    try {
      const buf = await blob.arrayBuffer();
      const res = await window.electron.calls.appendChunk({
        sessionId: s.id,
        track: 'system',
        buffer: buf,
        seq: sysSeqRef.current++,
        startMs,
        extension: ext,
      });
      if (res && !res.success && res.error) {
        console.warn('[CallMode] system chunk:', res.error);
      }
    } catch (e) {
      console.warn('[CallMode] system chunk', e);
    }
  }, []);

  const stopDesktopPreview = useCallback(() => {
    const v = previewVideoRef.current;
    if (v) v.srcObject = null;
    const s = previewStreamRef.current;
    if (s) {
      for (const tr of s.getTracks()) {
        tr.onended = null;
        tr.stop();
      }
      previewStreamRef.current = null;
    }
  }, []);

  const endCallSession = useCallback(
    async (cancel: boolean) => {
      if (livePollRef.current) {
        clearInterval(livePollRef.current);
        livePollRef.current = null;
      }
      if (cancel) {
        dualOpRef.current.cancelBoth();
      } else {
        dualOpRef.current.stopBoth();
      }
      stopDesktopPreview();
      const sid = sessionRef.current?.id;
      sessionRef.current = null;
      micSeqRef.current = 0;
      sysSeqRef.current = 0;
      if (sid && window.electron?.calls) {
        if (cancel) {
          await window.electron.calls.cancel({ sessionId: sid });
        } else {
          setStopping(true);
          try {
            await new Promise((r) => setTimeout(r, 600));
            const res = await window.electron.calls.stop({ sessionId: sid });
            if (res.success && res.note) {
              notifications.show({
                title: t('media.dock_note_created'),
                message: res.note.title,
                color: 'green',
              });
              void window.electron?.transcriptionOverlay?.openNoteInMain?.({
                noteId: res.note.id,
                title: res.note.title || t('media.transcription_note_tab'),
              });
            } else {
              notifications.show({
                title: t('media.dock_transcription_failed'),
                message: res.error || t('media.transcription_unknown_error'),
                color: 'red',
              });
            }
          } finally {
            setStopping(false);
          }
        }
      }
      setVisible(false);
      setLiveText('');
    },
    [stopDesktopPreview, t],
  );

  const dual = useDualRecorder({
    chunkIntervalMs: chunkMs,
    onMicChunk: flushMicChunk,
    onSystemChunk: flushSysChunk,
    onMicError: (msg) => {
      notifications.show({ title: t('media.dock_mic_permission'), message: msg, color: 'red' });
      void endCallSessionRef.current(true);
    },
  });
  dualOpRef.current = { cancelBoth: dual.cancelBoth, stopBoth: dual.stopBoth };
  const micRec = dual.mic;
  const sysRec = dual.system;

  endCallSessionRef.current = endCallSession;

  const startCall = useCallback(async () => {
    if (!pickedSourceId || !window.electron?.calls?.start) {
      notifications.show({
        title: t('media.dock_pick_source'),
        message: t('media.dock_system_hint'),
        color: 'yellow',
      });
      return;
    }
    const projectId = currentProject?.id ?? 'default';
    setStarting(true);
    desktopCancelRef.current = false;
    try {
      const startRes = await window.electron.calls.start({
        projectId,
        callPlatform: 'unknown',
        saveRecordingAsAudio: saveAudioCopy,
      });
      if (!startRes.success || !startRes.sessionId) {
        notifications.show({
          title: t('call.start_failed'),
          message: startRes.error || '',
          color: 'red',
        });
        return;
      }
      const wallStart = Date.now();
      sessionRef.current = { id: startRes.sessionId, wallStart };

      await micRec.startMicRecording();
      if (desktopCancelRef.current) {
        await endCallSession(true);
        return;
      }

      await window.electron.transcription.setDisplayMediaSource(pickedSourceId);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (desktopCancelRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        await endCallSession(true);
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
        await endCallSession(true);
        return;
      }
      sysRec.startFromStream(new MediaStream(audioTracks));
    } catch (err) {
      notifications.show({
        title: t('call.start_failed'),
        message: err instanceof Error ? err.message : String(err),
        color: 'red',
      });
      await endCallSession(true);
    } finally {
      setStarting(false);
    }
  }, [currentProject?.id, endCallSession, micRec, pickedSourceId, saveAudioCopy, sysRec, t]);

  const requestStopCall = useCallback(async () => {
    if (stopping) return;
    await endCallSession(false);
  }, [endCallSession, stopping]);

  const requestCancel = useCallback(async () => {
    if (stopping) return;
    desktopCancelRef.current = true;
    await endCallSession(true);
  }, [endCallSession, stopping]);

  const toggleDockRef = useRef<() => void>(() => {});
  toggleDockRef.current = () => {
    if (starting || stopping) return;
    const rec = micRec.phase === 'recording' || micRec.phase === 'paused';
    const sysOn = sysRec.phase === 'recording' || sysRec.phase === 'paused';
    if (rec || sysOn) {
      void requestStopCall();
      return;
    }
    if (visible) {
      void requestCancel();
      return;
    }
    setVisible(true);
    setDesktopSources(null);
    setPickedSourceId('');
    setLiveText('');
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

  useEffect(() => {
    if (!visible) return;
    if (screenPermStatus === 'denied') return;
    void loadDesktopSources();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!window.electron?.transcriptionOverlay?.setState) return undefined;
    const rec = micRec.phase === 'recording' || micRec.phase === 'paused';
    const sysOn = sysRec.phase === 'recording' || sysRec.phase === 'paused';
    const live = rec || sysOn;
    let reportPhase = 'idle';
    if (stopping) reportPhase = 'processing';
    else if (live) reportPhase = micRec.phase;
    else if (starting) reportPhase = 'recording';

    void window.electron.transcriptionOverlay.setState({
      mode: 'call',
      phase: reportPhase,
      seconds: micRec.seconds,
      hubVisible: visible,
      captureKind: 'call',
      canPause: live && micRec.canPause,
    });
    return undefined;
  }, [micRec.phase, micRec.seconds, micRec.canPause, starting, stopping, sysRec.phase, visible]);

  useEffect(() => {
    if (!visible) {
      setTranscriptionTrayHandlers(null);
      return undefined;
    }
    const recOn = micRec.phase === 'recording' || micRec.phase === 'paused';
    const sysOn = sysRec.phase === 'recording' || sysRec.phase === 'paused';
    const live = recOn || sysOn;
    if (!live && !starting && !stopping) {
      setTranscriptionTrayHandlers(null);
      return undefined;
    }
    const bothPaused = micRec.phase === 'paused' && sysRec.phase === 'paused';
    setTranscriptionTrayHandlers({
      onStop: () => {
        if (stopping) return;
        if (starting) void requestCancel();
        else void requestStopCall();
      },
      onCancel: () => {
        if (stopping) return;
        void requestCancel();
      },
      onPauseResume: () => {
        if (bothPaused) {
          dual.resumeBoth();
          const sid = sessionRef.current?.id;
          if (sid) void window.electron?.calls?.resume({ sessionId: sid });
        } else {
          dual.pauseBoth();
          const sid = sessionRef.current?.id;
          if (sid) void window.electron?.calls?.pause({ sessionId: sid });
        }
      },
    });
    return () => setTranscriptionTrayHandlers(null);
  }, [
    visible,
    micRec.phase,
    sysRec.phase,
    starting,
    stopping,
    dual,
    requestCancel,
    requestStopCall,
  ]);

  useEffect(() => {
    if (!window.electron?.transcriptionOverlay?.overlaySetVisible) return undefined;
    void window.electron.transcriptionOverlay.overlaySetVisible(visible);
    return undefined;
  }, [visible]);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const el = hubContentRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      const padded = Math.min(820, Math.max(80, h + 24));
      void window.electron?.transcriptionOverlay?.overlayResize?.(padded);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, micRec.phase, sysRec.phase, showLiveTranscript, hubMinimized]);

  useEffect(() => {
    if (!showLiveTranscript || !window.electron?.calls?.getLive) {
      if (livePollRef.current) clearInterval(livePollRef.current);
      livePollRef.current = null;
      return undefined;
    }
    const sessionActive =
      micRec.phase === 'recording' ||
      micRec.phase === 'paused' ||
      sysRec.phase === 'recording' ||
      sysRec.phase === 'paused';
    if (!sessionActive) {
      if (livePollRef.current) clearInterval(livePollRef.current);
      livePollRef.current = null;
      return undefined;
    }
    const poll = async () => {
      const id = sessionRef.current?.id;
      if (!id) return;
      try {
        const res = await window.electron.calls.getLive({ sessionId: id });
        if (res.success && typeof res.plainText === 'string') {
          setLiveText(res.plainText);
        }
      } catch {
        /* */
      }
    };
    void poll();
    livePollRef.current = setInterval(() => void poll(), 2500);
    return () => {
      if (livePollRef.current) clearInterval(livePollRef.current);
      livePollRef.current = null;
    };
  }, [showLiveTranscript, micRec.phase, sysRec.phase]);

  useEffect(() => {
    if (!visible || micRec.phase !== 'idle' || starting || !pickedSourceId || screenPermStatus === 'denied') {
      setPreviewLiveOk(false);
      stopDesktopPreview();
      return undefined;
    }
    if (!window.electron?.transcription?.setDisplayMediaSource) return undefined;
    let cancelled = false;
    const gen = ++previewGenRef.current;
    setPreviewLiveOk(false);
    void (async () => {
      try {
        const setRes = await window.electron.transcription.setDisplayMediaSource(pickedSourceId);
        if (!setRes.success || cancelled || gen !== previewGenRef.current) return;
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        if (cancelled || gen !== previewGenRef.current) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream.getAudioTracks().forEach((tr) => tr.stop());
        stopDesktopPreview();
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState === 'ended') {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        const previewOnly = new MediaStream([videoTrack]);
        previewStreamRef.current = previewOnly;
        videoTrack.onended = () => {
          if (gen !== previewGenRef.current) return;
          setPreviewLiveOk(false);
          stopDesktopPreview();
        };
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
  }, [visible, micRec.phase, pickedSourceId, screenPermStatus, stopDesktopPreview, previewTick, starting]);

  const selectedDesktopSource = useMemo(
    () => desktopSources?.find((s) => s.id === pickedSourceId) ?? null,
    [desktopSources, pickedSourceId],
  );

  if (!visible) return null;

  const isRecording = micRec.phase === 'recording' || sysRec.phase === 'recording';
  const isPaused = micRec.phase === 'paused' && sysRec.phase === 'paused';
  const isBusy = isRecording || isPaused || starting || stopping;

  const overlayOuter = 'relative z-10 flex max-h-full min-h-0 w-full justify-center pointer-events-none';
  const overlayWrapper =
    'relative z-10 flex max-h-full min-h-0 w-full max-w-[min(96vw,920px)] flex-col items-stretch gap-2 overflow-x-hidden overflow-y-auto rounded-2xl border px-3 py-2.5 shadow-xl sm:gap-2.5 sm:rounded-3xl sm:px-4 sm:py-3 pointer-events-auto';
  const overlayChrome = {
    background: 'color-mix(in srgb, var(--dome-bg, #fff) 94%, transparent)',
    borderColor: 'color-mix(in srgb, var(--dome-border, #ddd) 50%, transparent)',
    boxShadow: isRecording
      ? '0 0 0 1.5px color-mix(in srgb, var(--dome-accent, #7b76d0) 35%, transparent), 0 8px 32px color-mix(in srgb, black 14%, transparent)'
      : '0 8px 32px color-mix(in srgb, black 14%, transparent)',
    transition: 'box-shadow 0.3s ease',
  };

  const mm = Math.floor(micRec.seconds / 60);
  const ss = micRec.seconds % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;

  if (hubMinimized) {
    return (
      <div className={overlayOuter} aria-live="polite">
        <div ref={hubContentRef} className={overlayWrapper} style={overlayChrome}>
          <div className="flex flex-wrap items-center gap-2 min-h-[36px]" style={{ color: 'var(--dome-text)' }}>
            {stopping || starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                <span className="text-xs font-medium flex-1 truncate sm:text-sm">
                  {stopping ? t('call.finalizing') : t('call.starting')}
                </span>
              </>
            ) : isBusy ? (
              <>
                <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                <div className="flex min-w-0 w-full flex-col gap-1 sm:flex-1 sm:flex-row sm:gap-2">
                  <WaveformMeter
                    stream={micRec.streamRef.current}
                    active={micRec.phase === 'recording'}
                    label={t('call.track_mic')}
                    height={26}
                  />
                  <WaveformMeter
                    stream={sysRec.streamRef.current}
                    active={sysRec.phase === 'recording'}
                    label={t('call.track_system')}
                    height={26}
                  />
                </div>
                <span className="font-mono tabular-nums text-xs opacity-80 sm:text-sm">{timeStr}</span>
                {micRec.canPause && (
                  <button
                    type="button"
                    onClick={
                      isPaused
                        ? () => {
                            dual.resumeBoth();
                            const sid = sessionRef.current?.id;
                            if (sid) void window.electron?.calls?.resume({ sessionId: sid });
                          }
                        : () => {
                            dual.pauseBoth();
                            const sid = sessionRef.current?.id;
                            if (sid) void window.electron?.calls?.pause({ sessionId: sid });
                          }
                    }
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
                <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                <span className="text-xs font-medium flex-1 sm:text-sm">{t('call.setup_title')}</span>
              </>
            )}
          </div>

          {!isBusy ? (
            <p className="text-[10px] leading-snug sm:text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
              {t('hub.minimized_setup_hint')}
            </p>
          ) : null}

          {isBusy && showLiveTranscript && liveText ? (
            <div
              className="max-h-[52px] min-h-0 overflow-y-auto rounded-lg px-2 py-1 text-[10px] leading-snug sm:max-h-[72px] sm:text-[11px]"
              style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text-muted)' }}
            >
              {liveText}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void requestCancel()}
              disabled={stopping}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium sm:px-3 sm:text-xs"
              style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t('media.dock_cancel')}
            </button>
            {isBusy ? (
              <button
                type="button"
                onClick={() => void requestStopCall()}
                disabled={stopping}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-45 sm:px-3 sm:text-xs"
                style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
              >
                <Square className="h-3.5 w-3.5" aria-hidden />
                {t('call.stop_button')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayOuter} aria-live="polite">
      <div ref={hubContentRef} className={overlayWrapper} style={overlayChrome}>
        <div className="flex items-center gap-2 min-h-[36px]" style={{ color: 'var(--dome-text)' }}>
          {stopping || starting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              <span className="text-sm font-medium flex-1 truncate">
                {stopping ? t('call.finalizing') : t('call.starting')}
              </span>
            </>
          ) : isBusy ? (
            <>
              <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              <div className="flex min-w-0 w-full flex-1 flex-col gap-2 sm:flex-row sm:gap-2">
                <WaveformMeter stream={micRec.streamRef.current} active={micRec.phase === 'recording'} label={t('call.track_mic')} height={32} />
                <WaveformMeter stream={sysRec.streamRef.current} active={sysRec.phase === 'recording'} label={t('call.track_system')} height={32} />
              </div>
              <span className="font-mono tabular-nums text-sm opacity-80">{timeStr}</span>
              {micRec.canPause && (
                <button
                  type="button"
                  onClick={
                    isPaused
                      ? () => {
                          dual.resumeBoth();
                          const sid = sessionRef.current?.id;
                          if (sid) void window.electron?.calls?.resume({ sessionId: sid });
                        }
                      : () => {
                          dual.pauseBoth();
                          const sid = sessionRef.current?.id;
                          if (sid) void window.electron?.calls?.pause({ sessionId: sid });
                        }
                  }
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
              <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              <span className="text-sm font-medium flex-1">{t('call.setup_title')}</span>
            </>
          )}
        </div>

        {!isBusy && (
          <>
            <p className="text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
              {t('call.setup_hint')}
            </p>
            <div className="flex h-[min(38vh,320px)] max-h-[min(38vh,320px)] min-h-0 w-full shrink-0 flex-col gap-3 overflow-hidden sm:h-[min(320px,calc(100vh-260px))] sm:max-h-[min(320px,calc(100vh-260px))] sm:flex-row">
              <div className="flex h-[min(180px,35vh)] min-h-0 w-full shrink-0 flex-col overflow-hidden sm:h-full sm:w-[240px] sm:min-w-[180px] sm:max-w-[260px]">
                <div className="flex shrink-0 items-center justify-between gap-2 min-h-[28px] mb-1">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--dome-text)' }}>
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
                <div
                  className="min-h-0 h-full max-h-full overflow-y-auto overflow-x-hidden rounded-xl overscroll-contain pr-0.5 [scrollbar-gutter:stable] [scrollbar-width:thin]"
                  style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-surface)' }}
                  role="listbox"
                >
                  {loadingSources && (!desktopSources || desktopSources.length === 0) ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-6 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                      <span>{t('media.dock_loading_sources')}</span>
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
                        className="flex w-full items-center gap-2 border-b px-2 py-2 text-left transition-colors last:border-b-0"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--dome-border) 55%, transparent)',
                          background: selected ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)' : 'transparent',
                        }}
                      >
                        {s.thumbnailDataUrl ? (
                          <img
                            src={s.thumbnailDataUrl}
                            alt=""
                            className="h-9 w-14 shrink-0 rounded object-cover"
                            style={{ border: '1px solid var(--dome-border)' }}
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-[10px] font-medium" style={{ color: 'var(--dome-text)' }}>
                          {s.name}
                        </span>
                        <span className="shrink-0 rounded px-1 py-0.5 text-[9px]" style={{ color: 'var(--dome-text-muted)', background: 'var(--dome-bg-hover)' }}>
                          {kindLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl" style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-bg-hover)' }}>
                <div className="relative h-full min-h-[160px] w-full">
                  {selectedDesktopSource?.thumbnailDataUrl ? (
                    <img
                      src={selectedDesktopSource.thumbnailDataUrl}
                      alt=""
                      className={`absolute inset-0 h-full w-full object-contain transition-opacity ${previewLiveOk ? 'opacity-0' : 'opacity-100'}`}
                      decoding="async"
                      aria-hidden={previewLiveOk}
                    />
                  ) : null}
                  <video
                    ref={previewVideoRef}
                    className={`absolute inset-0 h-full w-full object-contain transition-opacity ${previewLiveOk ? 'z-[1] opacity-100' : 'pointer-events-none opacity-0'}`}
                    muted
                    playsInline
                    autoPlay
                  />
                  {!selectedDesktopSource?.thumbnailDataUrl && !previewLiveOk ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center" style={{ color: 'var(--dome-text-muted)' }}>
                      <ImageOff className="h-5 w-5 opacity-50" aria-hidden />
                      <span className="text-[10px]">{t('media.dock_preview_placeholder')}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void startCall()}
              disabled={!pickedSourceId || starting}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-white disabled:opacity-45"
              style={{ background: 'var(--dome-accent)' }}
            >
              <Mic className="h-4 w-4 shrink-0" aria-hidden />
              {t('call.start_button')}
            </button>
          </>
        )}

        {isBusy && showLiveTranscript && liveText ? (
          <div
            className="max-h-[120px] min-h-0 overflow-y-auto rounded-xl px-2 py-1.5 text-[11px] leading-snug"
            style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text-muted)' }}
          >
            {liveText}
          </div>
        ) : null}

        <label className="flex cursor-pointer items-center gap-2 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
          <input
            type="checkbox"
            checked={showLiveTranscript}
            onChange={(e) => setShowLiveTranscript(e.target.checked)}
            disabled={isBusy}
            className="cursor-pointer"
          />
          {t('call.show_live_transcript')}
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          <input
            type="checkbox"
            checked={saveAudioCopy}
            onChange={(e) => setSaveAudioCopy(e.target.checked)}
            disabled={isBusy}
            className="cursor-pointer"
          />
          {t('media.dock_save_audio_copy')}
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void requestCancel()}
            disabled={stopping}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t('media.dock_cancel')}
          </button>
          {isBusy ? (
            <button
              type="button"
              onClick={() => void requestStopCall()}
              disabled={stopping}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-45"
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              {t('call.stop_button')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
