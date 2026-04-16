import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, Monitor, Square, X, Loader2, Pause, Play } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useMediaRecorder } from '@/lib/transcription/useMediaRecorder';
import { AudioLevelMeter } from '@/components/ui/AudioLevelMeter';

type DesktopSource = { id: string; name: string };

type VoiceRecordingDockVariant = 'shell' | 'overlay';

type Props = {
  /** `overlay`: ventana flotante dedicada. `shell`: dentro de AppShell. */
  variant?: VoiceRecordingDockVariant;
};

export default function VoiceRecordingDock({ variant = 'shell' }: Props) {
  const { t } = useTranslation();
  const isOverlay = variant === 'overlay';
  const currentProject = useAppStore((s) => s.currentProject);

  // Dock visibility (separate from recording phase)
  const [visible, setVisible] = useState(false);
  const [saveAudioCopy, setSaveAudioCopy] = useState(true);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[] | null>(null);
  const [pickedSourceId, setPickedSourceId] = useState('');
  const [loadingSources, setLoadingSources] = useState(false);
  const [recordingInputKind, setRecordingInputKind] = useState<'microphone' | 'system'>('microphone');
  const [screenPermStatus, setScreenPermStatus] = useState<'unknown' | 'granted' | 'denied' | 'not-determined' | 'restricted'>('unknown');

  const captureKindRef = useRef<'microphone' | 'system'>('microphone');
  const hubContentRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the mic setup was cancelled before getUserMedia resolved
  const desktopCancelRef = useRef(false);

  // ── Note opening helper ────────────────────────────────────────────────────

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
        setVisible(false);
      }
    },
    onEmpty: () => {
      notifications.show({
        title: t('media.dock_empty_recording'),
        message: t('media.dock_no_audio_captured'),
        color: 'yellow',
      });
      setVisible(false);
    },
    onError: (msg) => {
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
    captureKindRef.current = 'microphone';
    setRecordingInputKind('microphone');
    await recorder.startMicRecording();
  }, [recorder, t]);

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
    captureKindRef.current = 'system';
    setRecordingInputKind('system');

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
    }
  }, [pickedSourceId, recorder, t]);

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
    recorder.cancelRecording();
    setVisible(false);
  }, [phase, recorder]);

  // ── Toggle handler (IPC shortcut + DOM event) ──────────────────────────────

  const toggleDockRef = useRef<() => void>(() => {});
  toggleDockRef.current = () => {
    if (phase === 'processing') return;
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
    if (!window.electron?.transcription?.onToggleRecording) return undefined;
    return window.electron.transcription.onToggleRecording(() => {
      toggleDockRef.current();
    });
  }, []);

  // Auto-load desktop sources when dock opens (skip if permission explicitly denied)
  useEffect(() => {
    if (!visible) return;
    if (screenPermStatus === 'denied') return;
    void loadDesktopSources();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (isOverlay) return undefined;
    const onUiToggle = () => toggleDockRef.current();
    window.addEventListener('dome:toggle-transcription-dock', onUiToggle);
    return () => window.removeEventListener('dome:toggle-transcription-dock', onUiToggle);
  }, [isOverlay]);

  // ── Notify AppShell top-bar indicators ───────────────────────────────────

  useEffect(() => {
    if (phase === 'recording' || phase === 'paused') {
      window.dispatchEvent(new CustomEvent('dome:dictation-started'));
    } else {
      window.dispatchEvent(new CustomEvent('dome:dictation-stopped'));
    }
  }, [phase]);

  // ── Overlay window sync ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOverlay || !window.electron?.transcriptionOverlay?.overlaySetVisible) return undefined;
    void window.electron.transcriptionOverlay.overlaySetVisible(visible);
    return undefined;
  }, [visible, isOverlay]);

  // Auto-resize overlay window to content height
  useLayoutEffect(() => {
    if (!isOverlay || typeof ResizeObserver === 'undefined') return undefined;
    const el = hubContentRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      const padded = Math.min(480, Math.max(80, h + 24));
      void window.electron?.transcriptionOverlay?.overlayResize?.(padded);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOverlay, visible, phase]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!visible) return null;

  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;

  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';
  const isProcessing = phase === 'processing';
  const isReady = phase === 'idle';

  // ── Shell variant (floating pill within app window) ──────────────────────

  const shellWrapper =
    'fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-fixed,300)] flex max-h-[85vh] max-w-[min(420px,92vw)] -translate-x-1/2 flex-col items-stretch gap-3 overflow-y-auto rounded-xl px-4 py-3 shadow-lg';

  // ── Overlay variant (compact pill in dedicated BrowserWindow) ────────────

  const overlayWrapper =
    'relative z-10 w-full max-w-[min(96vw,420px)] flex flex-col items-stretch gap-2.5 overflow-hidden rounded-3xl px-4 py-3 shadow-xl border';

  const overlayChrome = {
    background: 'color-mix(in srgb, var(--dome-bg, #fff) 94%, transparent)',
    borderColor: 'color-mix(in srgb, var(--dome-border, #ddd) 50%, transparent)',
    boxShadow: isRecording
      ? '0 0 0 1.5px color-mix(in srgb, var(--dome-accent, #7b76d0) 35%, transparent), 0 8px 32px color-mix(in srgb, black 14%, transparent)'
      : '0 8px 32px color-mix(in srgb, black 14%, transparent)',
    transition: 'box-shadow 0.3s ease',
  };

  return (
    <div
      className={isOverlay ? 'relative z-10 w-full flex justify-center pointer-events-none' : ''}
      aria-live="polite"
    >
      <div
        ref={hubContentRef}
        className={isOverlay ? `${overlayWrapper} pointer-events-auto` : shellWrapper}
        style={
          isOverlay
            ? overlayChrome
            : { background: 'var(--dome-surface)', border: '1px solid var(--dome-border)', minWidth: 280 }
        }
      >
        {/* ── Header row ── */}
        <div className="flex items-center gap-2 min-h-[36px]" style={{ color: 'var(--dome-text)' }}>
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              <span className="text-sm font-medium flex-1 truncate">{t('media.dock_transcribing')}</span>
            </>
          ) : isRecording || isPaused ? (
            <>
              {/* Live audio level meter */}
              <AudioLevelMeter
                stream={isRecording ? streamRef.current : null}
                active={isRecording}
                height={20}
              />
              {recordingInputKind === 'system' && (
                <Monitor className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
              )}
              <span className="text-sm font-medium flex-1">
                {isPaused ? t('media.dock_paused') : t('media.dock_recording')}
                {' '}
                <span className="font-mono tabular-nums opacity-70">{timeStr}</span>
              </span>
              {/* Pause / Resume */}
              {canPause && (
                <button
                  type="button"
                  onClick={isPaused ? recorder.resumeRecording : recorder.pauseRecording}
                  className="shrink-0 rounded-md flex items-center justify-center transition-colors"
                  style={{
                    width: 28, height: 28,
                    background: 'var(--dome-bg-hover)',
                    color: 'var(--dome-text)',
                    border: '1px solid var(--dome-border)',
                  }}
                  title={isPaused ? t('media.dock_resume') : t('media.dock_pause')}
                >
                  {isPaused
                    ? <Play className="h-3.5 w-3.5" aria-hidden />
                    : <Pause className="h-3.5 w-3.5" aria-hidden />
                  }
                </button>
              )}
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              <span className="text-sm font-medium flex-1">{t('media.dock_choose_input')}</span>
            </>
          )}
        </div>

        {/* ── Source selector (only when ready) ── */}
        {isReady && (
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
                    {loadingSources ? '…' : t('media.dock_refresh_sources')}
                  </button>
                </div>

                {/* Permission denied banner (macOS only) */}
                {screenPermStatus === 'denied' && window.electron?.isMac && (
                  <div
                    className="mb-2 rounded-md px-2 py-1.5 text-[11px] leading-snug"
                    style={{ background: 'color-mix(in srgb, var(--dome-error, #ef4444) 12%, transparent)', color: 'var(--dome-error, #ef4444)' }}
                  >
                    <p className="mb-1">{t('media.dock_perm_screen_denied')}</p>
                    <button
                      type="button"
                      className="underline text-[11px]"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dome-error, #ef4444)' }}
                      onClick={() => void window.electron?.invoke?.('open-external-url', 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')}
                    >
                      {t('media.dock_perm_screen_open_prefs')}
                    </button>
                  </div>
                )}

                {desktopSources && desktopSources.length > 0 && (
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
                )}
                <button
                  type="button"
                  onClick={() => void startRecordingDesktop()}
                  disabled={!pickedSourceId || !desktopSources?.length || screenPermStatus === 'denied'}
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
        )}

        {/* ── Save audio copy checkbox ── */}
        <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          <input
            type="checkbox"
            checked={saveAudioCopy}
            onChange={(e) => setSaveAudioCopy(e.target.checked)}
            disabled={!isReady}
            className="cursor-pointer"
          />
          {t('media.dock_save_audio_copy')}
        </label>

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={requestCancel}
            disabled={isProcessing}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t('media.dock_cancel')}
          </button>
          <button
            type="button"
            onClick={requestStopAndTranscribe}
            disabled={isProcessing || isReady}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-45"
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
