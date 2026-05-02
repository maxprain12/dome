import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Pause, Play, Square, ChevronDown, Loader2, AlertCircle, X } from 'lucide-react';
import { useTranscriptionStore } from '@/lib/transcription/useTranscriptionStore';
import { useTabStore } from '@/lib/store/useTabStore';
import StartTranscriptionPopover from './StartTranscriptionPopover';
import LivePreviewPanel from './LivePreviewPanel';
import InlineLevelMeter from './InlineLevelMeter';

function formatSeconds(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function TranscriptionPill() {
  const { t } = useTranslation();
  const phase = useTranscriptionStore((s) => s.phase);
  const seconds = useTranscriptionStore((s) => s.seconds);
  const livePreview = useTranscriptionStore((s) => s.livePreview);
  const error = useTranscriptionStore((s) => s.error);
  const isStartPopoverOpen = useTranscriptionStore((s) => s.isStartPopoverOpen);
  const isLivePanelOpen = useTranscriptionStore((s) => s.isLivePanelOpen);
  const openStartPopover = useTranscriptionStore((s) => s.openStartPopover);
  const closeStartPopover = useTranscriptionStore((s) => s.closeStartPopover);
  const toggleLivePanel = useTranscriptionStore((s) => s.toggleLivePanel);
  const setLivePanelOpen = useTranscriptionStore((s) => s.setLivePanelOpen);
  const pause = useTranscriptionStore((s) => s.pause);
  const resume = useTranscriptionStore((s) => s.resume);
  const stop = useTranscriptionStore((s) => s.stop);
  const cancel = useTranscriptionStore((s) => s.cancel);
  const controllerRef = useTranscriptionStore((s) => s._controller);

  const { openTranscriptionsTab } = useTabStore();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [errorVisible, setErrorVisible] = useState(false);

  useEffect(() => {
    if (phase === 'error') setErrorVisible(true);
  }, [phase]);

  // Toggle event from global shortcut / tray
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.transcription?.onToggleRecording) return undefined;
    return window.electron.transcription.onToggleRecording(() => {
      const state = useTranscriptionStore.getState();
      if (state.phase === 'idle') state.openStartPopover();
      else if (state.phase === 'recording' || state.phase === 'paused') void state.stop();
    });
  }, []);

  const isActive = phase === 'recording' || phase === 'paused';
  const isBusy = phase === 'transcribing';
  const showError = phase === 'error' && errorVisible;
  const micStream = controllerRef?.getMicStream() || controllerRef?.getSystemStream() || null;

  const handleIdleClick = () => {
    if (isStartPopoverOpen) closeStartPopover();
    else openStartPopover();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openTranscriptionsTab();
  };

  const handleStop = async () => {
    setLivePanelOpen(false);
    await stop();
  };

  const handlePauseResume = async () => {
    if (phase === 'recording') await pause();
    else if (phase === 'paused') await resume();
  };

  return (
    <>
      <div
        ref={anchorRef}
        className="flex items-center"
        style={{ height: '100%' }}
        onContextMenu={handleContextMenu}
      >
        {phase === 'idle' && !showError && (
          <button
            type="button"
            onClick={handleIdleClick}
            aria-label={t('transcriptions.pill_idle', 'Start transcription')}
            title={t('transcriptions.pill_idle', 'Start transcription')}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 34,
              height: '100%',
              background: isStartPopoverOpen ? 'var(--dome-bg-hover)' : 'transparent',
              color: 'var(--dome-text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isStartPopoverOpen) (e.currentTarget.style.background = 'var(--dome-bg-hover)');
              e.currentTarget.style.color = 'var(--dome-text)';
            }}
            onMouseLeave={(e) => {
              if (!isStartPopoverOpen) e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--dome-text-muted)';
            }}
          >
            <Mic size={15} aria-hidden />
          </button>
        )}

        {(isActive || isBusy) && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2"
            style={{
              height: 28,
              alignSelf: 'center',
              background: phase === 'paused'
                ? 'color-mix(in srgb, var(--dome-text-muted) 14%, transparent)'
                : 'color-mix(in srgb, var(--dome-accent) 14%, transparent)',
              border: `1px solid ${phase === 'paused' ? 'var(--dome-border)' : 'var(--dome-accent)'}`,
              color: phase === 'paused' ? 'var(--dome-text-muted)' : 'var(--dome-accent)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {phase === 'recording' && (
              <span
                aria-hidden
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--dome-accent)',
                  animation: 'pulse-dot 1.4s ease-in-out infinite',
                }}
              />
            )}
            {phase === 'paused' && <Pause size={11} />}
            {phase === 'transcribing' && <Loader2 size={11} className="animate-spin" />}

            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
              {phase === 'transcribing' ? t('transcriptions.pill_transcribing', 'Transcribing…') : formatSeconds(seconds)}
            </span>

            {isActive && (
              <InlineLevelMeter stream={micStream} active={phase === 'recording'} />
            )}

            {isActive && (
              <>
                <PillIconButton
                  icon={phase === 'recording' ? <Pause size={12} /> : <Play size={12} />}
                  label={phase === 'recording' ? t('transcriptions.control_pause', 'Pause') : t('transcriptions.control_resume', 'Resume')}
                  onClick={handlePauseResume}
                />
                <PillIconButton
                  icon={<Square size={12} />}
                  label={t('transcriptions.control_stop', 'Stop')}
                  onClick={handleStop}
                />
                {livePreview && (
                  <PillIconButton
                    icon={<ChevronDown size={12} className={isLivePanelOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />}
                    label={isLivePanelOpen
                      ? t('transcriptions.pill_close_panel', 'Hide live transcript')
                      : t('transcriptions.pill_open_panel', 'Show live transcript')}
                    onClick={toggleLivePanel}
                  />
                )}
              </>
            )}

            {isBusy && (
              <PillIconButton
                icon={<X size={12} />}
                label={t('transcriptions.control_cancel', 'Cancel')}
                onClick={() => void cancel()}
              />
            )}
          </div>
        )}

        {showError && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2"
            style={{
              height: 28,
              alignSelf: 'center',
              background: 'color-mix(in srgb, var(--dome-danger, #d23434) 12%, transparent)',
              border: '1px solid var(--dome-danger, #d23434)',
              color: 'var(--dome-danger, #d23434)',
              fontSize: 12,
              fontWeight: 600,
            }}
            title={error || ''}
          >
            <AlertCircle size={12} />
            <span>{t('transcriptions.pill_error', 'Error')}</span>
            <PillIconButton
              icon={<X size={12} />}
              label={t('common.dismiss', 'Dismiss')}
              onClick={() => {
                setErrorVisible(false);
                useTranscriptionStore.setState({ phase: 'idle', error: null });
              }}
            />
          </div>
        )}
      </div>

      {isStartPopoverOpen && (
        <StartTranscriptionPopover anchorRef={anchorRef} onClose={closeStartPopover} />
      )}
      {isLivePanelOpen && livePreview && isActive && (
        <LivePreviewPanel anchorRef={anchorRef} onClose={() => setLivePanelOpen(false)} />
      )}
    </>
  );
}

function PillIconButton({
  icon, label, onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void | Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-label={label}
      title={label}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: 18,
        height: 18,
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        opacity: 0.85,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
    </button>
  );
}
