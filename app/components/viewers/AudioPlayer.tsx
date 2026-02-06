'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Rewind, FastForward, Music } from 'lucide-react';
import { type Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';
import MediaControls from './shared/MediaControls';
import SeekBar from './shared/SeekBar';
import AnnotationInput from './shared/AnnotationInput';

interface AudioPlayerProps {
  resource: Resource;
}

function AudioPlayerComponent({ resource }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const { addInteraction } = useInteractions(resource.id);

  // Load audio file
  useEffect(() => {
    async function loadAudio() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.resource.getFilePath(resource.id);

        if (result.success && result.data) {
          setAudioUrl(`file://${result.data}`);
        } else {
          setError(result.error || 'Failed to load audio');
        }
      } catch (err) {
        console.error('Error loading audio:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    loadAudio();
  }, [resource.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'm':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'arrowleft':
          e.preventDefault();
          handleSkip(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          handleSkip(10);
          break;
        case 'arrowup':
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.1));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [volume, isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration));
  }, [duration]);

  const handleVolumeChange = useCallback((vol: number) => {
    if (!audioRef.current) return;
    audioRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!audioRef.current) return;

    if (isMuted) {
      audioRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const handleSaveAnnotation = useCallback(async (content: string) => {
    await addInteraction('annotation', content, {
      type: 'audio_timestamp',
      timestamp: currentTime,
    });
  }, [currentTime, addInteraction]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />
      )}

      {/* Visual Container */}
      <div className="w-full max-w-md">
        {isLoading && !audioUrl ? (
          <LoadingState message="Loading audio..." />
        ) : (
          <>
            {/* Album Art Placeholder */}
            <div
              className="aspect-square rounded-xl mb-8 flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
              }}
            >
              <Music className="w-24 h-24 text-white opacity-50" />
            </div>

            {/* Title */}
            <h2
              className="text-xl font-semibold text-center mb-2 truncate"
              style={{ color: 'var(--primary-text)' }}
            >
              {resource.title}
            </h2>
            <p className="text-sm text-center mb-6" style={{ color: 'var(--secondary-text)' }}>
              {resource.original_filename || 'Audio file'}
            </p>

            {/* Progress Bar */}
            <div className="mb-4">
              <SeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                formatTime={formatTime}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <button
                onClick={() => handleSkip(-10)}
                className="p-3 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{ color: 'var(--secondary-text)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Rewind 10s (←)"
                aria-label="Rewind 10 seconds"
              >
                <Rewind size={24} />
              </button>

              <MediaControls
                isPlaying={isPlaying}
                isMuted={isMuted}
                volume={volume}
                onPlayPause={handlePlayPause}
                onToggleMute={handleToggleMute}
                onVolumeChange={handleVolumeChange}
              />

              <button
                onClick={() => handleSkip(10)}
                className="p-3 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{ color: 'var(--secondary-text)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Forward 10s (→)"
                aria-label="Forward 10 seconds"
              >
                <FastForward size={24} />
              </button>
            </div>

            {/* Playback Speed & Annotation */}
            <div className="flex items-center justify-between">
              {/* Playback Speed */}
              <div className="flex items-center gap-2">
                <select
                  value={playbackRate}
                  onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                  className="px-2 py-1 text-sm rounded"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary-text)',
                  }}
                  aria-label="Playback speed"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                </select>
              </div>

              {/* Annotation Input */}
              <AnnotationInput
                isOpen={showAnnotationInput}
                onClose={() => setShowAnnotationInput(!showAnnotationInput)}
                onSave={handleSaveAnnotation}
                currentTime={currentTime}
                placeholder="Note at this timestamp..."
              />
            </div>

            {/* Keyboard Shortcuts Hint */}
            <div className="mt-4 text-center">
              <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                Space: Play/Pause • M: Mute • ←/→: Skip • ↑/↓: Volume
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default React.memo(AudioPlayerComponent);
