'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, Play, Pause, Volume2, VolumeX, Rewind, FastForward, Music, Bookmark } from 'lucide-react';
import { type Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';

interface AudioPlayerProps {
  resource: Resource;
}

export default function AudioPlayer({ resource }: AudioPlayerProps) {
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
  const [annotationContent, setAnnotationContent] = useState('');

  const { addInteraction } = useInteractions(resource.id);

  useEffect(() => {
    async function loadAudio() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // Get the file path to use as source
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

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration));
  }, [duration]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const vol = parseFloat(e.target.value);
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

  const handleCreateAnnotation = useCallback(async () => {
    if (!annotationContent.trim()) return;

    await addInteraction('annotation', annotationContent.trim(), {
      type: 'audio_timestamp',
      timestamp: currentTime,
    });

    setAnnotationContent('');
    setShowAnnotationInput(false);
  }, [annotationContent, currentTime, addInteraction]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
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
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--brand-primary)' }} />
          </div>
        ) : (
          <>
            {/* Album Art Placeholder */}
            <div
              className="aspect-square rounded-xl mb-8 flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)',
              }}
            >
              <Music className="w-24 h-24 text-white opacity-50" />
            </div>

            {/* Title */}
            <h2
              className="text-xl font-semibold text-center mb-2 truncate"
              style={{ color: 'var(--primary)' }}
            >
              {resource.title}
            </h2>
            <p className="text-sm text-center mb-6" style={{ color: 'var(--secondary)' }}>
              {resource.original_filename || 'Audio file'}
            </p>

            {/* Progress Bar */}
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--brand-primary) 0%, var(--brand-primary) ${
                    (currentTime / duration) * 100
                  }%, var(--border) ${(currentTime / duration) * 100}%, var(--border) 100%)`,
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: 'var(--secondary)' }}>
                  {formatTime(currentTime)}
                </span>
                <span className="text-xs" style={{ color: 'var(--secondary)' }}>
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <button
                onClick={() => handleSkip(-10)}
                className="p-3 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                style={{ color: 'var(--secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Rewind 10s"
                aria-label="Retroceder 10 segundos"
              >
                <Rewind size={24} />
              </button>

              <button
                onClick={handlePlayPause}
                className="p-4 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                style={{
                  background: 'var(--brand-primary)',
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'brightness(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'brightness(1)';
                }}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
              </button>

              <button
                onClick={() => handleSkip(10)}
                className="p-3 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                style={{ color: 'var(--secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Forward 10s"
                aria-label="Avanzar 10 segundos"
              >
                <FastForward size={24} />
              </button>
            </div>

            {/* Volume & Annotation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMute}
                  className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                  style={{ color: 'var(--secondary)' }}
                  aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--brand-primary) 0%, var(--brand-primary) ${
                      (isMuted ? 0 : volume) * 100
                    }%, var(--border) ${(isMuted ? 0 : volume) * 100}%, var(--border) 100%)`,
                  }}
                />
              </div>

              {showAnnotationInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={annotationContent}
                    onChange={(e) => setAnnotationContent(e.target.value)}
                    placeholder="Note at this timestamp..."
                    className="px-2 py-1 text-sm rounded"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--primary)',
                      width: '180px',
                    }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateAnnotation();
                      if (e.key === 'Escape') setShowAnnotationInput(false);
                    }}
                  />
                  <button
                    onClick={handleCreateAnnotation}
                    className="px-2 py-1 text-sm rounded"
                    style={{
                      background: 'var(--brand-primary)',
                      color: 'white',
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAnnotationInput(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                  style={{
                    color: 'var(--secondary)',
                    border: '1px solid var(--border)',
                  }}
                  aria-label="Agregar nota"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Add annotation at current time"
                >
                  <Bookmark size={14} />
                  Add Note
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
