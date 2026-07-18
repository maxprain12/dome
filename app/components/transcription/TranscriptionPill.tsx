import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Alert02Icon, ArrowDown01Icon, Cancel01Icon, Mic01Icon, PauseIcon, PlayIcon, StopIcon } from '@hugeicons/core-free-icons';
import { useTranscriptionStore } from '@/lib/transcription/useTranscriptionStore';
import { useTabStore } from '@/lib/store/useTabStore';
import StartTranscriptionPopover from './StartTranscriptionPopover';
import LivePreviewPanel from './LivePreviewPanel';
import InlineLevelMeter from './InlineLevelMeter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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

  const openTranscriptionsTab = useTabStore((s) => s.openTranscriptionsTab);
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
        className="flex h-full items-center"
        onContextMenu={handleContextMenu}
      >
        {phase === 'idle' && !showError && (
          <Button
            type="button"
            variant={isStartPopoverOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            onClick={handleIdleClick}
            aria-label={t('transcriptions.pill_idle', 'Start transcription')}
            title={t('transcriptions.pill_idle', 'Start transcription')}
            className="h-full rounded-none"
          >
            <HugeiconsIcon icon={Mic01Icon} aria-hidden />
          </Button>
        )}

        {(isActive || isBusy) && (
          <Badge variant={phase === 'paused' ? 'secondary' : 'outline'} className="h-7 gap-1.5 px-2">
            {phase === 'recording' && (
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            )}
            {phase === 'paused' && <HugeiconsIcon icon={PauseIcon} />}
            {phase === 'transcribing' && <Spinner />}

            <span className="min-w-8 tabular-nums">
              {phase === 'transcribing' ? t('transcriptions.pill_transcribing', 'Transcribing…') : formatSeconds(seconds)}
            </span>

            {isActive && (
              <InlineLevelMeter stream={micStream} active={phase === 'recording'} />
            )}

            {isActive && (
              <>
                <PillIconButton
                  icon={phase === 'recording' ? PauseIcon : PlayIcon}
                  label={phase === 'recording' ? t('transcriptions.control_pause', 'Pause') : t('transcriptions.control_resume', 'Resume')}
                  onClick={handlePauseResume}
                />
                <PillIconButton
                  icon={StopIcon}
                  label={t('transcriptions.control_stop', 'Stop')}
                  onClick={handleStop}
                />
                {livePreview && (
                  <PillIconButton
                    icon={ArrowDown01Icon}
                    iconClassName={cn('transition-transform motion-reduce:transition-none', isLivePanelOpen && 'rotate-180')}
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
                icon={Cancel01Icon}
                label={t('transcriptions.control_cancel', 'Cancel')}
                onClick={() => void cancel()}
              />
            )}
          </Badge>
        )}

        {showError && (
          <Badge variant="destructive" className="h-7 gap-1.5 px-2" title={error || ''}>
            <HugeiconsIcon icon={Alert02Icon} />
            <span>{t('transcriptions.pill_error', 'Error')}</span>
            <PillIconButton
              icon={Cancel01Icon}
              label={t('common.dismiss', 'Dismiss')}
              onClick={() => {
                setErrorVisible(false);
                useTranscriptionStore.setState({ phase: 'idle', error: null });
              }}
            />
          </Badge>
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
  icon, label, onClick, iconClassName,
}: { icon: IconSvgElement; label: string; onClick: () => void | Promise<void>; iconClassName?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={() => void onClick()}
      aria-label={label}
      title={label}
      className="text-current hover:text-current"
    >
      <HugeiconsIcon icon={icon} className={iconClassName} />
    </Button>
  );
}
