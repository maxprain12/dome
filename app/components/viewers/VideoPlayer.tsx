'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, Play, Pause, Volume2, VolumeX, Maximize, Bookmark } from 'lucide-react';
import { type Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';

interface VideoPlayerProps {
  resource: Resource;
}

export default function VideoPlayer({ resource }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
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
    async function loadVideo() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // Get the file path to use as source
        const result = await window.electron.resource.getFilePath(resource.id);

        if (result.success && result.data) {
          // For video, we use the file path directly with file:// protocol
          setVideoUrl(`file://${result.data}`);
        } else {
          setError(result.error || 'Failed to load video');
        }
      } catch (err) {
        console.error('Error loading video:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    loadVideo();
  }, [resource.id]);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const vol = parseFloat(e.target.value);
    videoRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!videoRef.current) return;

    if (isMuted) {
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const handleFullscreen = useCallback(() => {
    if (!videoRef.current) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  }, []);

  const handleCreateAnnotation = useCallback(async () => {
    if (!annotationContent.trim()) return;

    await addInteraction('annotation', annotationContent.trim(), {
      type: 'video_timestamp',
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
        <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--error)' }} />
        <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>
      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center relative">
        {isLoading && !videoUrl ? (
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        ) : videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="max-w-full max-h-full"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onClick={handlePlayPause}
          />
        ) : null}
      </div>

      {/* Controls */}
      <div
        className="px-4 py-3 space-y-2"
        style={{ background: 'rgba(0, 0, 0, 0.9)' }}
      >
        {/* Progress Bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/70 min-w-[40px]">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--brand-primary) 0%, var(--brand-primary) ${
                (currentTime / duration) * 100
              }%, rgba(255,255,255,0.3) ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) 100%)`,
            }}
          />
          <span className="text-xs text-white/70 min-w-[40px] text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              className="p-2 rounded-md transition-colors text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            {/* Volume */}
            <button
              onClick={handleToggleMute}
              className="p-2 rounded-md transition-colors text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, white 0%, white ${
                  (isMuted ? 0 : volume) * 100
                }%, rgba(255,255,255,0.3) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) 100%)`,
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Annotation */}
            {showAnnotationInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={annotationContent}
                  onChange={(e) => setAnnotationContent(e.target.value)}
                  placeholder="Add note at this timestamp..."
                  className="px-2 py-1 text-sm rounded bg-white/10 text-white border border-white/20 w-48"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateAnnotation();
                    if (e.key === 'Escape') setShowAnnotationInput(false);
                  }}
                />
                <button
                  onClick={handleCreateAnnotation}
                  className="px-2 py-1 text-sm rounded bg-white/20 text-white hover:bg-white/30"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAnnotationInput(true)}
                className="p-2 rounded-md transition-colors text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                title="Add annotation at current time"
                aria-label="Agregar anotación en tiempo actual"
              >
                <Bookmark size={20} />
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={handleFullscreen}
              className="p-2 rounded-md transition-colors text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              aria-label="Pantalla completa"
            >
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
