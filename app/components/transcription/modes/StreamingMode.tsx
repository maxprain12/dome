import { useCallback, useEffect, useRef, useState } from 'react';
import { Radio, Square, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useMediaRecorder } from '@/lib/transcription/useMediaRecorder';
import { WaveformMeter } from '@/components/transcription/WaveformMeter';
import { useHubUi } from '@/lib/transcription/hubUiContext';
import { setTranscriptionTrayHandlers } from '@/lib/transcription/hubTrayHandlers';

const CHUNK_MS = 10000;

type Props = {
  isActive?: boolean;
};

export default function StreamingMode({ isActive = true }: Props) {
  const { t } = useTranslation();
  const hubUi = useHubUi();
  const hubMinimized = hubUi?.hubMinimized ?? false;
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const hubContentRef = useRef<HTMLDivElement | null>(null);

  const noopBlob = useCallback(async () => {}, []);

  const onChunk = useCallback(async (blob: Blob, mimeType: string) => {
    if (!window.electron?.transcription?.bufferToText) return;
    const ext = mimeType.includes('webm') ? 'webm' : 'webm';
    try {
      const buf = await blob.arrayBuffer();
      const res = await window.electron.transcription.bufferToText({
        buffer: buf,
        extension: ext,
      });
      const text = res.success ? res.text?.trim() : '';
      if (text) {
        setLines((prev) => [...prev, text]);
      }
    } catch (e) {
      console.warn('[StreamingMode] chunk', e);
    }
  }, []);

  const rec = useMediaRecorder({
    onBlob: noopBlob,
    chunksOnly: true,
    chunkIntervalMs: CHUNK_MS,
    onChunk,
    onError: (msg) => {
      notifications.show({ title: t('media.dock_mic_permission'), message: msg, color: 'red' });
      setVisible(false);
    },
  });

  const toggleDockRef = useRef<() => void>(() => {});
  toggleDockRef.current = () => {
    if (rec.phase === 'processing') return;
    if (rec.phase === 'recording' || rec.phase === 'paused') {
      rec.stopRecording();
      return;
    }
    if (visible && rec.phase === 'idle') {
      rec.cancelRecording();
      setVisible(false);
      setLines([]);
      return;
    }
    setVisible(true);
    setLines([]);
    void rec.startMicRecording();
  };

  useEffect(() => {
    if (!isActive) return undefined;
    if (!window.electron?.transcription?.onToggleRecording) return undefined;
    return window.electron.transcription.onToggleRecording(() => {
      toggleDockRef.current();
    });
  }, [isActive]);

  useEffect(() => {
    if (!window.electron?.transcriptionOverlay?.setState) return undefined;
    void window.electron.transcriptionOverlay.setState({
      mode: 'streaming',
      phase: rec.phase,
      seconds: rec.seconds,
      hubVisible: visible,
      captureKind: 'microphone',
      canPause: rec.canPause,
    });
    return undefined;
  }, [rec.phase, rec.seconds, rec.canPause, visible]);

  useEffect(() => {
    if (!visible) {
      setTranscriptionTrayHandlers(null);
      return undefined;
    }
    const live = rec.phase === 'recording' || rec.phase === 'paused';
    if (!live) {
      setTranscriptionTrayHandlers(null);
      return undefined;
    }
    setTranscriptionTrayHandlers({
      onStop: () => rec.stopRecording(),
      onCancel: () => {
        rec.cancelRecording();
        setVisible(false);
        setLines([]);
      },
      onPauseResume: () => {
        if (rec.phase === 'paused') rec.resumeRecording();
        else rec.pauseRecording();
      },
    });
    return () => setTranscriptionTrayHandlers(null);
  }, [visible, rec, rec.phase, rec.stopRecording, rec.cancelRecording, rec.pauseRecording, rec.resumeRecording]);

  if (!visible) return null;

  const _isRecording = rec.phase === 'recording';
  const isLiveSession = rec.phase === 'recording' || rec.phase === 'paused';

  const overlayOuter = 'relative z-10 flex max-h-full min-h-0 w-full justify-center pointer-events-none';
  const overlayWrapper =
    'relative z-10 flex max-h-full min-h-0 w-full max-w-[min(96vw,560px)] flex-col items-stretch gap-2 rounded-2xl border px-3 py-2.5 shadow-xl sm:gap-2 sm:rounded-3xl sm:px-4 sm:py-3 pointer-events-auto';
  const overlayChrome = {
    background: 'color-mix(in srgb, var(--dome-bg, #fff) 94%, transparent)',
    borderColor: 'color-mix(in srgb, var(--dome-border, #ddd) 50%, transparent)',
    boxShadow: isLiveSession
      ? '0 0 0 1.5px color-mix(in srgb, var(--dome-accent, #7b76d0) 35%, transparent), 0 8px 32px color-mix(in srgb, black 14%, transparent)'
      : '0 8px 32px color-mix(in srgb, black 14%, transparent)',
    transition: 'box-shadow 0.3s ease',
  };

  const mm = Math.floor(rec.seconds / 60);
  const ss = rec.seconds % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;

  if (hubMinimized) {
    return (
      <div className={overlayOuter} aria-live="polite">
        <div ref={hubContentRef} className={overlayWrapper} style={overlayChrome}>
          <div className="flex flex-wrap items-center gap-2" style={{ color: 'var(--dome-text)' }}>
            <Radio className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
            <span className="text-xs font-medium flex-1 sm:text-sm">{t('hub.mode.streaming')}</span>
            <span className="font-mono text-[11px] tabular-nums opacity-70 sm:text-xs">{timeStr}</span>
          </div>
          <WaveformMeter stream={rec.streamRef.current} active={isLiveSession} height={32} />
          <div
            className="max-h-[48px] min-h-[36px] overflow-y-auto rounded-lg px-2 py-1 text-[10px] leading-snug sm:max-h-[72px] sm:text-[11px]"
            style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)' }}
          >
            {lines.length === 0 ? (
              <span style={{ color: 'var(--dome-text-muted)' }}>{t('call.streaming_placeholder')}</span>
            ) : (
              lines.map((line, i) => (
                <p key={`${i}-${line.slice(0, 12)}`} className="mb-0.5 last:mb-0">
                  {line}
                </p>
              ))
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hubUi ? (
              <button
                type="button"
                onClick={() => hubUi.expandHub()}
                className="mr-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
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
              onClick={() => {
                rec.cancelRecording();
                setVisible(false);
                setLines([]);
              }}
              disabled={rec.phase === 'processing'}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium sm:px-3 sm:text-xs"
              style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t('media.dock_cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (rec.phase === 'recording' || rec.phase === 'paused') rec.stopRecording();
              }}
              disabled={rec.phase === 'idle' || rec.phase === 'processing'}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-45 sm:px-3 sm:text-xs"
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
            >
              {rec.phase === 'processing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Square className="h-3.5 w-3.5" aria-hidden />
              )}
              {t('media.dock_stop_transcribe')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayOuter} aria-live="polite">
      <div ref={hubContentRef} className={overlayWrapper} style={overlayChrome}>
        <div className="flex flex-wrap items-center gap-2" style={{ color: 'var(--dome-text)' }}>
          <Radio className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
          <span className="text-sm font-medium flex-1 min-w-0">{t('hub.mode.streaming')}</span>
          <span className="font-mono text-xs tabular-nums opacity-70">{timeStr}</span>
          {hubUi && !hubMinimized ? (
            <button
              type="button"
              onClick={() => hubUi.toggleHubMinimized()}
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
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
        <WaveformMeter stream={rec.streamRef.current} active={isLiveSession} height={40} />
        <div
          className="max-h-[min(28vh,160px)] min-h-[48px] overflow-y-auto rounded-xl px-2 py-1.5 text-[11px] leading-snug sm:max-h-[160px]"
          style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)' }}
        >
          {lines.length === 0 ? (
            <span style={{ color: 'var(--dome-text-muted)' }}>{t('call.streaming_placeholder')}</span>
          ) : (
            lines.map((line, i) => (
              <p key={`${i}-${line.slice(0, 12)}`} className="mb-1 last:mb-0">
                {line}
              </p>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              rec.cancelRecording();
              setVisible(false);
              setLines([]);
            }}
            disabled={rec.phase === 'processing'}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t('media.dock_cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (rec.phase === 'recording' || rec.phase === 'paused') rec.stopRecording();
            }}
            disabled={rec.phase === 'idle' || rec.phase === 'processing'}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-45"
            style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
          >
            {rec.phase === 'processing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Square className="h-3.5 w-3.5" aria-hidden />
            )}
            {t('media.dock_stop_transcribe')}
          </button>
        </div>
      </div>
    </div>
  );
}
