
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  VolumeOffIcon,
  Loading03Icon,
  Mic01Icon,
  PreviousIcon,
  NextIcon,
} from '@hugeicons/core-free-icons';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { lazyRef } from '@/lib/utils/lazyRef';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

export interface AudioTranscript {
  format: 'podcast' | 'briefing' | 'debate';
  lines: Array<{
    speaker: string; // 'Host 1' or 'Host 2'
    text: string;
    startTime?: number; // seconds
  }>;
}

interface AudioOverviewProps {
  audioUrl?: string;
  transcript: AudioTranscript;
  title?: string;
  onClose?: () => void;
  isGenerating?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function getFormatLabel(format: AudioTranscript['format']): string {
  switch (format) {
    case 'podcast':
      return 'Podcast';
    case 'briefing':
      return 'Briefing';
    case 'debate':
      return 'Debate';
    default:
      return 'Audio';
  }
}

function getSpeakerColor(speaker: string): string {
  if (speaker.toLowerCase().includes('1') || speaker.toLowerCase() === 'host a') {
    return 'var(--primary)';
  }
  return 'var(--muted-foreground)';
}

function computeProgress(currentTime: number, duration: number): number {
  return duration > 0 ? (currentTime / duration) * 100 : 0;
}

// =============================================================================
// Sub-components
// =============================================================================

interface AudioHeaderProps {
  title?: string;
  formatLabel: string;
  onClose?: () => void;
  closeLabel: string;
}

function AudioHeader({ title, formatLabel, onClose, closeLabel }: AudioHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 border-border">
      <div className="flex items-center gap-2 min-w-0">
        <HugeiconsIcon icon={Mic01Icon} size={16} className="text-primary" />
        <h3 className="text-sm font-semibold truncate text-foreground">
          {title || 'Audio Overview'}
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full shrink-0"
          style={{
            background: 'var(--muted)',
            color: 'var(--muted-foreground)',
          }}
        >
          {formatLabel}
        </span>
      </div>
      {onClose && (
        <Button
          type="button"
          onClick={onClose}
          variant="ghost"
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={closeLabel}
          title={closeLabel}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </Button>
      )}
    </div>
  );
}

function GeneratingIndicator() {
  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-6 border-b shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <HugeiconsIcon icon={Loading03Icon} size={20} className="animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Generating audio...</span>
    </div>
  );
}

function NoAudioIndicator() {
  return (
    <div
      className="flex items-center justify-center gap-2 p-4 border-b shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <HugeiconsIcon icon={Mic01Icon} size={16} className="text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        No audio generated yet. Transcript only.
      </span>
    </div>
  );
}

interface ProgressBarProps {
  progress: number;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel: string;
  inputRef: React.RefObject<HTMLInputElement>;
}

function ProgressBar({ progress, onSeek, onSeekKeyDown, ariaLabel, inputRef }: ProgressBarProps) {
  return (
    <input
      ref={inputRef}
      type="range"
      min={0}
      max={100}
      step={0.1}
      value={progress}
      aria-label={ariaLabel}
      className="w-full h-1.5 rounded-full cursor-pointer mb-3 accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 bg-muted"
      onChange={onSeek}
      onKeyDown={onSeekKeyDown}
    />
  );
}

interface PlayPauseButtonProps {
  isPlaying: boolean;
  onClick: () => void;
}

function PlayPauseButton({ isPlaying, onClick }: PlayPauseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center size-9 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
      }}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      title={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? (
        <HugeiconsIcon icon={PauseIcon} size={18} />
      ) : (
        <HugeiconsIcon icon={PlayIcon} size={18} className="ml-0.5" />
      )}
    </button>
  );
}

interface SkipButtonProps {
  direction: 'forward' | 'backward';
  onClick: () => void;
}

function SkipButton({ direction, onClick }: SkipButtonProps) {
  const isForward = direction === 'forward';
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={isForward ? 'Forward 15 seconds' : 'Rewind 15 seconds'}
      title={isForward ? 'Forward 15s' : 'Rewind 15s'}
    >
      <HugeiconsIcon
        icon={isForward ? NextIcon : PreviousIcon}
        size={16}
        className="text-muted-foreground"
      />
    </Button>
  );
}

interface MuteButtonProps {
  isMuted: boolean;
  onClick: () => void;
}

function MuteButton({ isMuted, onClick }: MuteButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={isMuted ? 'Unmute' : 'Mute'}
      title={isMuted ? 'Unmute' : 'Mute'}
    >
      <HugeiconsIcon
        icon={isMuted ? VolumeOffIcon : VolumeHighIcon}
        size={14}
        className="text-muted-foreground"
      />
    </Button>
  );
}

interface PlaybackSpeedButtonProps {
  speed: number;
  onClick: () => void;
}

function PlaybackSpeedButton({ speed, onClick }: PlaybackSpeedButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold px-1.5 py-0.5 rounded transition-colors"
      style={{
        color: 'var(--muted-foreground)',
        background: 'var(--muted)',
      }}
      title="Playback speed"
    >
      {speed}x
    </button>
  );
}

interface PlayerControlsProps {
  progress: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  playbackSpeed: number;
  progressBarRef: React.RefObject<HTMLInputElement>;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTogglePlay: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onToggleMute: () => void;
  onCycleSpeed: () => void;
  seekAriaLabel: string;
}

function PlayerControls({
  progress,
  currentTime,
  duration,
  isPlaying,
  isMuted,
  playbackSpeed,
  progressBarRef,
  onSeek,
  onSeekKeyDown,
  onTogglePlay,
  onSkipForward,
  onSkipBackward,
  onToggleMute,
  onCycleSpeed,
  seekAriaLabel,
}: PlayerControlsProps) {
  return (
    <div className="p-4 border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <ProgressBar
        progress={progress}
        onSeek={onSeek}
        onSeekKeyDown={onSeekKeyDown}
        ariaLabel={seekAriaLabel}
        inputRef={progressBarRef}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono tabular-nums w-20 text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="flex items-center gap-2">
          <SkipButton direction="backward" onClick={onSkipBackward} />
          <PlayPauseButton isPlaying={isPlaying} onClick={onTogglePlay} />
          <SkipButton direction="forward" onClick={onSkipForward} />
        </div>
        <div className="flex items-center gap-2 w-20 justify-end">
          <MuteButton isMuted={isMuted} onClick={onToggleMute} />
          <PlaybackSpeedButton speed={playbackSpeed} onClick={onCycleSpeed} />
        </div>
      </div>
    </div>
  );
}

interface PlayerSectionProps extends PlayerControlsProps {
  isGenerating: boolean;
  hasAudio: boolean;
}

function PlayerSection({ isGenerating, hasAudio, ...controls }: PlayerSectionProps) {
  if (isGenerating) return <GeneratingIndicator />;
  if (!hasAudio) return <NoAudioIndicator />;
  return <PlayerControls {...controls} />;
}

interface TranscriptLineProps {
  line: AudioTranscript['lines'][number];
  isActive: boolean;
  speakerColor: string;
  onClick: () => void;
  refSetter: (el: HTMLDivElement | null) => void;
}

function TranscriptLine({
  line,
  isActive,
  speakerColor,
  onClick,
  refSetter,
}: TranscriptLineProps) {
  return (
    <button
      type="button"
      ref={refSetter as unknown as React.Ref<HTMLButtonElement>}
      className="flex gap-3 p-3 rounded-lg transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 w-full text-left border-0"
      style={{
        background: isActive ? 'var(--muted)' : 'transparent',
        borderLeft: isActive ? `3px solid ${speakerColor}` : '3px solid transparent',
      }}
      onClick={onClick}
    >
      <div className="shrink-0 pt-0.5">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{
            background: isActive ? speakerColor : 'var(--muted)',
            color: isActive ? 'var(--primary-foreground)' : speakerColor,
          }}
        >
          {line.speaker}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-relaxed"
          style={{
            color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
          }}
        >
          {line.text}
        </p>
        {line.startTime !== undefined && (
          <span className="text-xs mt-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
            {formatTime(line.startTime)}
          </span>
        )}
      </div>
    </button>
  );
}

interface TranscriptListProps {
  lines: AudioTranscript['lines'];
  activeLineIndex: number;
  transcriptRef: React.RefObject<HTMLDivElement>;
  onLineClick: (index: number) => void;
  onLineRef: (index: number, el: HTMLDivElement | null) => void;
}

function TranscriptList({
  lines,
  activeLineIndex,
  transcriptRef,
  onLineClick,
  onLineRef,
}: TranscriptListProps) {
  return (
    <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-y-3">
        {lines.map((line, index) => (
          <TranscriptLine
            key={index}
            line={line}
            isActive={index === activeLineIndex}
            speakerColor={getSpeakerColor(line.speaker)}
            onClick={() => onLineClick(index)}
            refSetter={(el) => onLineRef(index, el)}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function AudioOverview({
  audioUrl,
  transcript,
  title,
  onClose,
  isGenerating = false,
}: AudioOverviewProps) {
  const { t } = useTranslation();
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);

  // Transcript state
  const transcriptRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const lineRefs = useRef<Map<number, HTMLDivElement> | null>(null);
  const lineRefMap = lazyRef(lineRefs, () => new Map());

  const lineIndexByRef = useMemo(
    () => new Map(transcript.lines.map((line, idx) => [line, idx])),
    [transcript.lines],
  );

  const activeLineIndex = useMemo(() => {
    if (!audioUrl || !isAudioLoaded) return -1;

    const linesWithTime = transcript.lines.filter((l) => l.startTime !== undefined);
    if (linesWithTime.length === 0) return -1;

    for (let i = linesWithTime.length - 1; i >= 0; i--) {
      const line = linesWithTime[i];
      if (line && currentTime >= (line.startTime ?? 0)) {
        return lineIndexByRef.get(line) ?? -1;
      }
    }
    return -1;
  }, [audioUrl, isAudioLoaded, currentTime, transcript.lines, lineIndexByRef]);

  useEffect(() => {
    if (activeLineIndex < 0) return;
    const lineEl = lineRefMap.get(activeLineIndex);
    if (lineEl && transcriptRef.current) {
      lineEl.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }
  }, [activeLineIndex, prefersReducedMotion, lineRefMap]);

  // Progress bar ref for click-to-seek
  const progressBarRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------
  // Audio event handlers
  // -------------------------------------------------------

  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsAudioLoaded(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      console.error('[AudioOverview] Audio loading error');
      setIsAudioLoaded(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  // Sync playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Sync mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // -------------------------------------------------------
  // Controls
  // -------------------------------------------------------

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {
        // Autoplay blocked
      });
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!audioRef.current || !isAudioLoaded) return;
      const fraction = Number(e.target.value) / 100;
      const newTime = fraction * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration, isAudioLoaded],
  );

  const seekToFraction = useCallback(
    (fraction: number) => {
      if (!audioRef.current || !isAudioLoaded || duration <= 0) return;
      const f = Math.max(0, Math.min(1, fraction));
      const newTime = f * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration, isAudioLoaded],
  );

  const handleSeekKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!audioRef.current || !isAudioLoaded || duration <= 0) return;
      const frac = currentTime / duration;
      const step = 0.05;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        seekToFraction(frac + step);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        seekToFraction(frac - step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        seekToFraction(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        seekToFraction(1);
      }
    },
    [currentTime, duration, isAudioLoaded, seekToFraction],
  );

  const skipForward = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 15, duration);
  }, [duration]);

  const skipBackward = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 15, 0);
  }, []);

  const cyclePlaybackSpeed = useCallback(() => {
    setPlaybackSpeed((prev) => {
      const currentIdx = PLAYBACK_SPEEDS.indexOf(prev);
      const nextIdx = (currentIdx + 1) % PLAYBACK_SPEEDS.length;
      return PLAYBACK_SPEEDS[nextIdx] ?? 1;
    });
  }, []);

  const handleLineClick = useCallback(
    (lineIndex: number) => {
      const line = transcript.lines[lineIndex];
      if (line && line.startTime !== undefined && audioRef.current && isAudioLoaded) {
        audioRef.current.currentTime = line.startTime;
        setCurrentTime(line.startTime);
        if (!isPlaying) {
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }
    },
    [transcript.lines, isAudioLoaded, isPlaying]
  );

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  const progress = computeProgress(currentTime, duration);
  const hasAudio = !!audioUrl && isAudioLoaded;

  return (
    <div className="flex flex-col h-full bg-background">
      <AudioHeader
        title={title}
        formatLabel={getFormatLabel(transcript.format)}
        onClose={onClose}
        closeLabel={t('studio.close_button')}
      />
      <PlayerSection
        isGenerating={isGenerating}
        hasAudio={hasAudio}
        progress={progress}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        isMuted={isMuted}
        playbackSpeed={playbackSpeed}
        progressBarRef={progressBarRef}
        onSeek={handleSeek}
        onSeekKeyDown={handleSeekKeyDown}
        onTogglePlay={togglePlay}
        onSkipForward={skipForward}
        onSkipBackward={skipBackward}
        onToggleMute={() => setIsMuted(!isMuted)}
        onCycleSpeed={cyclePlaybackSpeed}
        seekAriaLabel={t('studio.seek_audio', { defaultValue: 'Buscar posición en audio' })}
      />
      <TranscriptList
        lines={transcript.lines}
        activeLineIndex={activeLineIndex}
        transcriptRef={transcriptRef}
        onLineClick={handleLineClick}
        onLineRef={(index, el) => {
          if (el) lineRefMap.set(index, el);
          else lineRefMap.delete(index);
        }}
      />
    </div>
  );
}
