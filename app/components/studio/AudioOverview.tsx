
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Loader2,
  Mic,
  SkipBack,
  SkipForward,
} from 'lucide-react';

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
    return 'var(--accent)';
  }
  return 'var(--secondary)';
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
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);

  // Transcript state
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Progress bar ref for click-to-seek
  const progressBarRef = useRef<HTMLDivElement>(null);

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
  // Active line tracking (synced to audio)
  // -------------------------------------------------------

  useEffect(() => {
    if (!audioUrl || !isAudioLoaded) return;

    const linesWithTime = transcript.lines.filter((l) => l.startTime !== undefined);
    if (linesWithTime.length === 0) return;

    // Find the current active line based on currentTime
    let activeIdx = -1;
    for (let i = linesWithTime.length - 1; i >= 0; i--) {
      const line = linesWithTime[i];
      if (line && currentTime >= (line.startTime ?? 0)) {
        // Map back to original index
        activeIdx = transcript.lines.indexOf(line);
        break;
      }
    }

    if (activeIdx !== activeLineIndex) {
      setActiveLineIndex(activeIdx);

      // Auto-scroll to active line
      const lineEl = lineRefs.current.get(activeIdx);
      if (lineEl && transcriptRef.current) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentTime, audioUrl, isAudioLoaded, transcript.lines, activeLineIndex]);

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
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || !audioRef.current || !isAudioLoaded) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = fraction * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration, isAudioLoaded]
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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasAudio = !!audioUrl && isAudioLoaded;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Mic size={16} style={{ color: 'var(--accent)' }} />
          <h3
            className="text-sm font-semibold truncate"
            style={{ color: 'var(--primary-text)' }}
          >
            {title || 'Audio Overview'}
          </h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full shrink-0"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--secondary-text)',
            }}
          >
            {getFormatLabel(transcript.format)}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost p-1.5">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Audio Player */}
      {isGenerating ? (
        <div
          className="flex items-center justify-center gap-3 px-4 py-6 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
        >
          <Loader2
            size={20}
            className="animate-spin"
            style={{ color: 'var(--accent)' }}
          />
          <span className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            Generating audio...
          </span>
        </div>
      ) : hasAudio ? (
        <div
          className="px-4 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
        >
          {/* Progress bar */}
          <div
            ref={progressBarRef}
            className="w-full h-1.5 rounded-full cursor-pointer mb-3 group"
            style={{ background: 'var(--bg-tertiary)' }}
            onClick={handleSeek}
          >
            <div
              className="h-full rounded-full relative transition-all"
              style={{
                width: `${progress}%`,
                background: 'var(--accent)',
              }}
            >
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background: 'var(--accent)',
                  boxShadow: '0 0 4px rgba(0,0,0,0.2)',
                }}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            {/* Time */}
            <span
              className="text-xs font-mono tabular-nums w-20"
              style={{ color: 'var(--secondary-text)' }}
            >
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Center controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={skipBackward}
                className="btn btn-ghost p-1.5"
                title="Rewind 15s"
              >
                <SkipBack size={16} style={{ color: 'var(--secondary-text)' }} />
              </button>
              <button
                onClick={togglePlay}
                className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--base-text)',
                }}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>
              <button
                onClick={skipForward}
                className="btn btn-ghost p-1.5"
                title="Forward 15s"
              >
                <SkipForward size={16} style={{ color: 'var(--secondary-text)' }} />
              </button>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2 w-20 justify-end">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="btn btn-ghost p-1"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX size={14} style={{ color: 'var(--tertiary-text)' }} />
                ) : (
                  <Volume2 size={14} style={{ color: 'var(--secondary-text)' }} />
                )}
              </button>
              <button
                onClick={cyclePlaybackSpeed}
                className="text-xs font-semibold px-1.5 py-0.5 rounded transition-colors"
                style={{
                  color: 'var(--secondary-text)',
                  background: 'var(--bg-tertiary)',
                }}
                title="Playback speed"
              >
                {playbackSpeed}x
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* No audio available - show message */
        <div
          className="flex items-center justify-center gap-2 px-4 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
        >
          <Mic size={16} style={{ color: 'var(--tertiary-text)' }} />
          <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
            No audio generated yet. Transcript only.
          </span>
        </div>
      )}

      {/* Transcript */}
      <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {transcript.lines.map((line, index) => {
            const isActive = index === activeLineIndex;
            const speakerColor = getSpeakerColor(line.speaker);

            return (
              <div
                key={index}
                ref={(el) => {
                  if (el) lineRefs.current.set(index, el);
                  else lineRefs.current.delete(index);
                }}
                className="flex gap-3 p-3 rounded-lg transition-colors cursor-pointer group"
                style={{
                  background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  borderLeft: isActive
                    ? `3px solid ${speakerColor}`
                    : '3px solid transparent',
                }}
                onClick={() => handleLineClick(index)}
              >
                {/* Speaker label */}
                <div className="shrink-0 pt-0.5">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{
                      background: isActive
                        ? speakerColor
                        : 'var(--bg-tertiary)',
                      color: isActive
                        ? 'var(--base-text)'
                        : speakerColor,
                    }}
                  >
                    {line.speaker}
                  </span>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      color: isActive
                        ? 'var(--primary-text)'
                        : 'var(--secondary-text)',
                    }}
                  >
                    {line.text}
                  </p>
                  {line.startTime !== undefined && (
                    <span
                      className="text-xs mt-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--tertiary-text)' }}
                    >
                      {formatTime(line.startTime)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
