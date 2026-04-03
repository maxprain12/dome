import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, Monitor, Square, X, Loader2 } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';

function pickRecordMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  return undefined;
}

type DesktopSource = { id: string; name: string };

type VoiceRecordingDockVariant = 'shell' | 'overlay';

type Props = {
  /** `overlay`: ventana flotante dedicada (hub). `shell`: dentro de AppShell (legado). */
  variant?: VoiceRecordingDockVariant;
};

export default function VoiceRecordingDock({ variant = 'shell' }: Props) {
  const { t } = useTranslation();
  const isOverlay = variant === 'overlay';
  const currentProject = useAppStore((s) => s.currentProject);
  const [visible, setVisible] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'recording' | 'processing'>('ready');
  const [saveAudioCopy, setSaveAudioCopy] = useState(true);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[] | null>(null);
  const [pickedSourceId, setPickedSourceId] = useState('');
  const [loadingSources, setLoadingSources] = useState(false);
  const [recordingInputKind, setRecordingInputKind] = useState<'microphone' | 'system'>('microphone');

  const processAfterStopRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledDuringSetupRef = useRef(false);
  const captureKindRef = useRef<'microphone' | 'system'>('microphone');
  const hubContentRef = useRef<HTMLDivElement | null>(null);

  const openCreatedNote = useCallback(
    (noteId: string, title: string) => {
      if (isOverlay) {
        void window.electron?.transcriptionOverlay?.openNoteInMain?.({
          noteId,
          title: title || t('media.transcription_note_tab'),
        });
      } else {
        useTabStore.getState().openNoteTab(noteId, title || t('media.transcription_note_tab'));
      }
    },
    [isOverlay, t],
  );

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const fullReset = useCallback(() => {
    stopTick();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
    setPhase('ready');
  }, [stopTick]);

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

  const beginRecordingFromStream = useCallback(
    (stream: MediaStream, captureKind: 'microphone' | 'system') => {
      captureKindRef.current = captureKind;
      setRecordingInputKind(captureKind);
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = pickRecordMime();
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
            fullReset();
            setVisible(false);
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
            fullReset();
            setVisible(false);
            return;
          }

          setPhase('processing');
          try {
            const buf = await blob.arrayBuffer();
            const ext = outMime.includes('webm') ? 'webm' : outMime.includes('mp4') ? 'm4a' : 'webm';
            const projectId = currentProject?.id ?? 'default';
            const kind = captureKindRef.current;
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
            fullReset();
            setVisible(false);
          }
        })();
      };

      mr.start(200);
      setPhase('recording');
      setSeconds(0);
      stopTick();
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    },
    [cleanupStream, currentProject?.id, fullReset, openCreatedNote, saveAudioCopy, stopTick, t],
  );

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

    cancelledDuringSetupRef.current = false;

    try {
      if (window.electron.isMac) {
        const perm = await window.electron.transcription.requestMicrophoneAccess();
        if (perm.success === false || perm.granted === false) {
          notifications.show({
            title: t('media.dock_mic_permission'),
            message: perm.error || t('media.dock_mic_denied'),
            color: 'red',
          });
          setVisible(false);
          return;
        }
      }

      if (cancelledDuringSetupRef.current) {
        setVisible(false);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledDuringSetupRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        setVisible(false);
        return;
      }

      beginRecordingFromStream(stream, 'microphone');
    } catch (err) {
      cleanupStream();
      notifications.show({
        title: t('media.dock_mic_permission'),
        message: err instanceof Error ? err.message : t('media.dock_mic_access_error'),
        color: 'red',
      });
      fullReset();
      setVisible(false);
    }
  }, [beginRecordingFromStream, cleanupStream, fullReset, t]);

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

    cancelledDuringSetupRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: pickedSourceId,
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: pickedSourceId,
          },
        },
      } as MediaStreamConstraints);
      if (cancelledDuringSetupRef.current) {
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
        fullReset();
        setVisible(false);
        return;
      }

      const audioOnly = new MediaStream(audioTracks);
      beginRecordingFromStream(audioOnly, 'system');
    } catch (err) {
      cleanupStream();
      const name = err instanceof Error ? err.name : '';
      const msg = err instanceof Error ? err.message : String(err);
      let message = msg;
      if (name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
        message = window.electron?.isMac ? t('media.dock_screen_denied_mac') : t('media.dock_system_hint');
      } else if (/audio|track/i.test(msg) && !/video/i.test(msg)) {
        message = t('media.dock_no_system_audio_track');
      }
      notifications.show({
        title: t('media.dock_recording_unavailable'),
        message,
        color: 'red',
      });
      fullReset();
      setVisible(false);
    }
  }, [beginRecordingFromStream, cleanupStream, fullReset, pickedSourceId, t]);

  const requestStopAndTranscribe = useCallback(() => {
    processAfterStopRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    else if (phase === 'ready') {
      setVisible(false);
      fullReset();
    }
    stopTick();
  }, [fullReset, phase, stopTick]);

  const requestCancel = useCallback(() => {
    if (phase === 'ready' && !mediaRecorderRef.current) {
      cancelledDuringSetupRef.current = true;
      setVisible(false);
      fullReset();
      return;
    }
    processAfterStopRef.current = false;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    else {
      cleanupStream();
      fullReset();
      setVisible(false);
    }
    stopTick();
  }, [cleanupStream, fullReset, phase, stopTick]);

  const toggleDockRef = useRef<() => void>(() => {});
  toggleDockRef.current = () => {
    if (phase === 'processing') return;
    if (phase === 'recording') {
      requestStopAndTranscribe();
      return;
    }
    if (visible && phase === 'ready') {
      cancelledDuringSetupRef.current = true;
      requestCancel();
      return;
    }
    setVisible(true);
    setDesktopSources(null);
    setPickedSourceId('');
  };

  useEffect(() => {
    if (!window.electron?.transcription?.onToggleRecording) return undefined;
    return window.electron.transcription.onToggleRecording(() => {
      toggleDockRef.current();
    });
  }, []);

  useEffect(() => {
    if (isOverlay) return undefined;
    const onUiToggle = () => toggleDockRef.current();
    window.addEventListener('dome:toggle-transcription-dock', onUiToggle);
    return () => window.removeEventListener('dome:toggle-transcription-dock', onUiToggle);
  }, [isOverlay]);

  useEffect(() => {
    if (!isOverlay || !window.electron?.transcriptionOverlay?.overlaySetVisible) return undefined;
    void window.electron.transcriptionOverlay.overlaySetVisible(visible);
    return undefined;
  }, [visible, isOverlay]);

  useLayoutEffect(() => {
    if (!isOverlay || typeof ResizeObserver === 'undefined') return undefined;
    const el = hubContentRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      const padded = Math.min(640, Math.max(280, h + 48));
      void window.electron?.transcriptionOverlay?.overlayResize?.(padded);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [isOverlay, visible, phase]);

  useEffect(
    () => () => {
      stopTick();
      cleanupStream();
    },
    [cleanupStream, stopTick],
  );

  if (!visible) return null;

  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;

  const shellWrapper =
    'fixed bottom-6 left-1/2 z-[200] flex max-h-[85vh] max-w-[min(420px,92vw)] -translate-x-1/2 flex-col items-stretch gap-3 overflow-y-auto rounded-xl px-4 py-3 shadow-lg';
  const hubWrapper =
    'relative z-10 w-full max-w-[min(96vw,420px)] flex flex-col items-stretch gap-3 overflow-y-auto overflow-x-hidden rounded-3xl px-4 py-3 shadow-xl border max-h-[min(72vh,520px)]';
  const hubChrome = isOverlay
    ? {
        background: 'color-mix(in srgb, var(--dome-bg, #fff) 94%, transparent)',
        borderColor: 'color-mix(in srgb, var(--dome-border, #ddd) 50%, transparent)',
        boxShadow: '0 8px 32px color-mix(in srgb, black 14%, transparent)',
      }
    : {
        background: 'var(--dome-surface)',
        border: '1px solid var(--dome-border)',
      };

  return (
    <div className={isOverlay ? 'relative z-10 w-full flex justify-center pointer-events-none' : ''} aria-live="polite">
      <div
        ref={hubContentRef}
        className={isOverlay ? `${hubWrapper} pointer-events-auto` : shellWrapper}
        style={
          isOverlay
            ? hubChrome
            : {
                background: 'var(--dome-surface)',
                border: '1px solid var(--dome-border)',
                minWidth: 280,
              }
        }
      >
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
          <Mic className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
          {phase === 'processing' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('media.dock_transcribing')}
            </>
          ) : phase === 'recording' ? (
            <>
              {recordingInputKind === 'system' ? <Monitor className="h-4 w-4" aria-hidden /> : null}
              {t('media.dock_recording')} {timeStr}
            </>
          ) : (
            <>{t('media.dock_choose_input')}</>
          )}
        </div>

        {phase === 'ready' ? (
          <>
            <p className="text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
              {t('media.dock_system_hint')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void startRecordingMic()}
                className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white"
                style={{ background: 'var(--dome-accent)' }}
              >
                <Mic className="h-4 w-4" aria-hidden />
                {t('media.dock_record_mic')}
              </button>
              <div
                className="rounded-lg border p-2"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg-hover)' }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                    {t('media.dock_mode_system')}
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadDesktopSources()}
                    disabled={loadingSources}
                    className="text-[11px] underline"
                    style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {loadingSources ? '…' : t('media.dock_load_sources')}
                  </button>
                </div>
                {desktopSources && desktopSources.length > 0 ? (
                  <select
                    value={pickedSourceId}
                    onChange={(e) => setPickedSourceId(e.target.value)}
                    className="mb-2 w-full rounded border px-2 py-1.5 text-xs outline-none"
                    style={{
                      borderColor: 'var(--dome-border)',
                      background: 'var(--dome-surface)',
                      color: 'var(--dome-text)',
                    }}
                  >
                    {desktopSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  onClick={() => void startRecordingDesktop()}
                  disabled={!pickedSourceId || !desktopSources?.length}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-45"
                  style={{
                    borderColor: 'var(--dome-border)',
                    color: 'var(--dome-text)',
                    background: 'var(--dome-surface)',
                  }}
                >
                  <Monitor className="h-4 w-4" aria-hidden />
                  {t('media.dock_start_system_capture')}
                </button>
              </div>
            </div>
          </>
        ) : null}

        <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          <input
            type="checkbox"
            checked={saveAudioCopy}
            onChange={(e) => setSaveAudioCopy(e.target.checked)}
            disabled={phase !== 'ready'}
            className="cursor-pointer"
          />
          {t('media.dock_save_audio_copy')}
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={requestCancel}
            disabled={phase === 'processing'}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t('media.dock_cancel')}
          </button>
          <button
            type="button"
            onClick={requestStopAndTranscribe}
            disabled={phase === 'processing' || phase !== 'recording'}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-45"
            style={{
              background: 'var(--dome-accent)',
              color: 'var(--dome-on-accent, #fff)',
            }}
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
            {t('media.dock_stop_transcribe')}
          </button>
        </div>
      </div>
    </div>
  );
}
