'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize } from 'lucide-react';
import { type Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';
import MediaControls from './shared/MediaControls';
import SeekBar from './shared/SeekBar';
import AnnotationInput from './shared/AnnotationInput';

interface VideoPlayerProps {
  resource: Resource;
}

function VideoPlayerComponent({ resource }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);

  const { addInteraction } = useInteractions(resource.id);

  // Load video file
  useEffect(() => {
    async function loadVideo() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.resource.getFilePath(resource.id);

        if (result.success && result.data) {
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
        case 'f':
          e.preventDefault();
          handleFullscreen();
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
        case ',':
          // Frame backward (0.04s = 1 frame at 25fps)
          e.preventDefault();
          handleSkip(-0.04);
          break;
        case '.':
          // Frame forward
          e.preventDefault();
          handleSkip(0.04);
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

  // Auto-hide controls
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      if (isPlaying) {
        timeout = setTimeout(() => setShowControls(false), 3000);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', () => {
        if (isPlaying) setShowControls(false);
      });
    }

    return () => {
      clearTimeout(timeout);
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [isPlaying]);

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

  const handleSeek = useCallback((time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration));
  }, [duration]);

  const handleVolumeChange = useCallback((vol: number) => {
    if (!videoRef.current) return;
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

  const handleSaveAnnotation = useCallback(async (content: string) => {
    await addInteraction('annotation', content, {
      type: 'video_timestamp',
      timestamp: currentTime,
    });
  }, [currentTime, addInteraction]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
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
    <div ref={containerRef} className="flex flex-col h-full" style={{ background: '#000' }}>
      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center relative">
        {isLoading && !videoUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <LoadingState message="Loading video..." />
          </div>
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
        className={`px-4 py-3 space-y-2 transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'rgba(0, 0, 0, 0.9)' }}
      >
        {/* Progress Bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/70 min-w-[40px]">
            {formatTime(currentTime)}
          </span>
          <div className="flex-1">
            <SeekBar
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              formatTime={formatTime}
              showTimestamps={false}
              variant="video"
            />
          </div>
          <span className="text-xs text-white/70 min-w-[40px] text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play/Pause & Volume */}
            <div style={{ filter: 'invert(1)' }}>
              <MediaControls
                isPlaying={isPlaying}
                isMuted={isMuted}
                volume={volume}
                onPlayPause={handlePlayPause}
                onToggleMute={handleToggleMute}
                onVolumeChange={handleVolumeChange}
                variant="compact"
              />
            </div>

            {/* Playback Speed */}
            <select
              value={playbackRate}
              onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
              className="px-2 py-1 text-sm rounded bg-white/10 text-white border border-white/20"
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

          <div className="flex items-center gap-2">
            {/* Annotation */}
            <div style={{ filter: 'invert(1)' }}>
              <AnnotationInput
                isOpen={showAnnotationInput}
                onClose={() => setShowAnnotationInput(!showAnnotationInput)}
                onSave={handleSaveAnnotation}
                currentTime={currentTime}
                placeholder="Add note at this timestamp..."
              />
            </div>

            {/* Fullscreen */}
            <button
              onClick={handleFullscreen}
              className="p-2 rounded-md transition-colors text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              title="Fullscreen (F)"
              aria-label="Fullscreen"
            >
              <Maximize size={20} />
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="text-center">
          <p className="text-xs text-white/50">
            Space: Play/Pause • F: Fullscreen • M: Mute • ←/→: Skip • ,/.: Frame
          </p>
        </div>
      </div>
    </div>
  );
}

export default React.memo(VideoPlayerComponent);
