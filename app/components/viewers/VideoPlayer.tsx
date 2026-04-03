import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { type Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';
import { useSafeMediaSource } from '@/lib/hooks/useSafeMediaSource';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';
import MediaControls from './shared/MediaControls';
import SeekBar from './shared/SeekBar';
import AnnotationInput from './shared/AnnotationInput';
import StructuredTranscriptWorkspace from './shared/StructuredTranscriptWorkspace';
import { useMediaPlaybackStore } from '@/lib/store/useMediaPlaybackStore';

interface VideoPlayerProps {
  resource: Resource;
}

function VideoPlayerComponent({ resource }: VideoPlayerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { objectUrl: videoUrl, loading: sourceLoading, error: sourceError } = useSafeMediaSource(resource.id);
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
  const [miniPlayerCollapsed, setMiniPlayerCollapsed] = useState(false);

  const { addInteraction } = useInteractions(resource.id);
  const setPlaybackPartial = useMediaPlaybackStore((s) => s.setPartial);

  const persistPlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setPlaybackPartial(resource.id, {
      currentTime: el.currentTime,
      volume: el.volume,
      isMuted: el.volume === 0,
      playbackRate: el.playbackRate,
    });
  }, [resource.id, setPlaybackPartial]);

  useEffect(() => {
    setError(sourceError);
  }, [sourceError]);

  useEffect(() => {
    if (!sourceLoading && (videoUrl || sourceError)) {
      setIsLoading(false);
    }
  }, [sourceLoading, videoUrl, sourceError]);

  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    const el = videoRef.current;
    const snap = useMediaPlaybackStore.getState().getForResource(resource.id);

    const onMeta = () => {
      el.volume = snap.isMuted ? 0 : snap.volume;
      setVolume(snap.volume);
      setIsMuted(snap.isMuted);
      el.playbackRate = snap.playbackRate;
      setPlaybackRate(snap.playbackRate);
      if (snap.currentTime > 0.25 && Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = Math.min(snap.currentTime, el.duration - 0.1);
      }
      setCurrentTime(el.currentTime);
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    };

    el.addEventListener('loadedmetadata', onMeta);
    return () => el.removeEventListener('loadedmetadata', onMeta);
  }, [videoUrl, resource.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const i = setInterval(() => persistPlayback(), 1000);
    return () => clearInterval(i);
  }, [isPlaying, persistPlayback]);

  useEffect(() => {
    return () => {
      persistPlayback();
    };
  }, [persistPlayback]);

  const handlePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      persistPlayback();
    } else {
      try {
        await videoRef.current.play();
      } catch (e) {
        notifications.show({
          title: t('media.playback_failed_title'),
          message: e instanceof Error ? e.message : t('media.playback_failed_generic'),
          color: 'red',
        });
      }
    }
  }, [isPlaying, persistPlayback, t]);

  const handleSkip = useCallback(
    (seconds: number) => {
      if (!videoRef.current) return;
      const raw = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : duration;
      const upper = Number.isFinite(raw) && raw > 0 ? raw : Number.POSITIVE_INFINITY;
      const next = Math.max(0, Math.min(videoRef.current.currentTime + seconds, upper));
      videoRef.current.currentTime = next;
      setPlaybackPartial(resource.id, { currentTime: next });
    },
    [duration, resource.id, setPlaybackPartial],
  );

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    const d = videoRef.current.duration;
    setDuration(Number.isFinite(d) ? d : 0);
  }, []);

  const handleDurationChange = useCallback(() => {
    if (!videoRef.current) return;
    const d = videoRef.current.duration;
    if (Number.isFinite(d)) setDuration(d);
  }, []);

  const handleMediaError = useCallback(() => {
    const el = videoRef.current;
    const code = el?.error?.code;
    const msg =
      code === 1 ? t('media.playback_error_aborted')
      : code === 2 ? t('media.playback_error_network')
      : code === 3 ? t('media.playback_error_decode')
      : code === 4 ? t('media.playback_error_not_supported')
      : t('media.playback_failed_generic');
    setError(msg);
  }, [t]);

  const handleSeek = useCallback(
    (time: number) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      setPlaybackPartial(resource.id, { currentTime: time });
    },
    [resource.id, setPlaybackPartial],
  );

  const handleVolumeChange = useCallback(
    (vol: number) => {
      if (!videoRef.current) return;
      videoRef.current.volume = vol;
      setVolume(vol);
      setIsMuted(vol === 0);
      setPlaybackPartial(resource.id, { volume: vol, isMuted: vol === 0 });
    },
    [resource.id, setPlaybackPartial],
  );

  const handleToggleMute = useCallback(() => {
    if (!videoRef.current) return;

    if (isMuted) {
      const v = volume || 0.5;
      videoRef.current.volume = v;
      setIsMuted(false);
      setPlaybackPartial(resource.id, { volume: v, isMuted: false });
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
      setPlaybackPartial(resource.id, { isMuted: true });
    }
  }, [isMuted, volume, resource.id, setPlaybackPartial]);

  const handleFullscreen = useCallback(() => {
    if (!videoRef.current) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void videoRef.current.requestFullscreen();
    }
  }, []);

  const handleSaveAnnotation = useCallback(
    async (content: string) => {
      await addInteraction('annotation', content, {
        type: 'video_timestamp',
        timestamp: currentTime,
      });
    },
    [currentTime, addInteraction],
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      if (!videoRef.current) return;
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
      setPlaybackPartial(resource.id, { playbackRate: rate });
    },
    [resource.id, setPlaybackPartial],
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

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

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          void handlePlayPause();
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
          e.preventDefault();
          handleSkip(-0.04);
          break;
        case '.':
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
  }, [volume, handlePlayPause, handleSkip, handleVolumeChange, handleToggleMute, handleFullscreen]);

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error || sourceError) {
    return <ErrorState error={error || sourceError || t('media.playback_failed_generic')} />;
  }

  const mainLoading = isLoading || sourceLoading;

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col"
      style={{ background: 'var(--dome-bg)' }}
    >
      {!miniPlayerCollapsed && (
        <div className="relative flex min-h-[180px] max-h-[42vh] shrink-0 flex-col bg-black">
          <div className="relative flex min-h-[140px] flex-1 items-center justify-center">
            {mainLoading && !videoUrl ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingState message={t('media.loading_video')} />
              </div>
            ) : videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                preload="metadata"
                className="max-h-[38vh] max-w-full object-contain"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onDurationChange={handleDurationChange}
                onClick={() => void handlePlayPause()}
                onError={handleMediaError}
              />
            ) : null}
          </div>

          <div
            className={`shrink-0 space-y-2 px-3 py-2 transition-opacity duration-300 ${
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: 'rgba(0, 0, 0, 0.92)' }}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-[40px] text-xs text-white/70">{formatTime(currentTime)}</span>
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
              <span className="min-w-[40px] text-right text-xs text-white/70">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div style={{ filter: 'invert(1)' }}>
                  <MediaControls
                    isPlaying={isPlaying}
                    isMuted={isMuted}
                    volume={volume}
                    onPlayPause={() => void handlePlayPause()}
                    onToggleMute={handleToggleMute}
                    onVolumeChange={handleVolumeChange}
                    variant="compact"
                  />
                </div>

                <select
                  value={playbackRate}
                  onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                  className="cursor-pointer rounded px-2 py-1 text-sm text-white bg-white/10 border border-white/20"
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
                <div style={{ filter: 'invert(1)' }}>
                  <AnnotationInput
                    isOpen={showAnnotationInput}
                    onRequestOpen={() => setShowAnnotationInput(true)}
                    onClose={() => setShowAnnotationInput(false)}
                    onSave={handleSaveAnnotation}
                    currentTime={currentTime}
                    placeholder={t('media.annotation_placeholder')}
                    addNoteLabel={t('media.add_note')}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleFullscreen}
                  className="cursor-pointer rounded-md p-2 text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                  title="Fullscreen (F)"
                  aria-label="Fullscreen"
                >
                  <Maximize size={20} />
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] text-white/50">{t('media.keyboard_hints_video')}</p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <StructuredTranscriptWorkspace
          resource={resource}
          mediaLabel="video"
          currentTime={currentTime}
          onSeek={handleSeek}
          miniPlayerCollapsed={miniPlayerCollapsed}
          onToggleMiniPlayer={() => setMiniPlayerCollapsed((c) => !c)}
          isPlaying={isPlaying}
        />
      </div>
    </div>
  );
}

export default React.memo(VideoPlayerComponent);
