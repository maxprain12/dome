import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Rewind, FastForward } from 'lucide-react';
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

interface AudioPlayerProps {
  resource: Resource;
}

function AudioPlayerComponent({ resource }: AudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const { objectUrl: audioUrl, loading: sourceLoading, error: sourceError } = useSafeMediaSource(resource.id);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [miniPlayerCollapsed, setMiniPlayerCollapsed] = useState(false);

  const { addInteraction } = useInteractions(resource.id);
  const setPlaybackPartial = useMediaPlaybackStore((s) => s.setPartial);

  const persistPlayback = useCallback(() => {
    const el = audioRef.current;
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
    if (!sourceLoading && (audioUrl || sourceError)) {
      setIsLoading(false);
    }
  }, [sourceLoading, audioUrl, sourceError]);

  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;
    const el = audioRef.current;
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
  }, [audioUrl, resource.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const i = setInterval(() => persistPlayback(), 1000);
    return () => clearInterval(i);
  }, [isPlaying, persistPlayback]);

  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      persistPlayback();
    } else {
      try {
        await audioRef.current.play();
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
      if (!audioRef.current) return;
      const raw = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : duration;
      const upper = Number.isFinite(raw) && raw > 0 ? raw : Number.POSITIVE_INFINITY;
      const next = Math.max(0, Math.min(audioRef.current.currentTime + seconds, upper));
      audioRef.current.currentTime = next;
      setPlaybackPartial(resource.id, { currentTime: next });
    },
    [duration, resource.id, setPlaybackPartial],
  );

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    setDuration(Number.isFinite(d) ? d : 0);
  }, []);

  const handleDurationChange = useCallback(() => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    if (Number.isFinite(d)) setDuration(d);
  }, []);

  const handleMediaError = useCallback(() => {
    const el = audioRef.current;
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
      if (!audioRef.current) return;
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      setPlaybackPartial(resource.id, { currentTime: time });
    },
    [resource.id, setPlaybackPartial],
  );

  const handleVolumeChange = useCallback(
    (vol: number) => {
      if (!audioRef.current) return;
      audioRef.current.volume = vol;
      setVolume(vol);
      setIsMuted(vol === 0);
      setPlaybackPartial(resource.id, { volume: vol, isMuted: vol === 0 });
    },
    [resource.id, setPlaybackPartial],
  );

  const handleToggleMute = useCallback(() => {
    if (!audioRef.current) return;

    if (isMuted) {
      const v = volume || 0.5;
      audioRef.current.volume = v;
      setIsMuted(false);
      setPlaybackPartial(resource.id, { volume: v, isMuted: false });
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
      setPlaybackPartial(resource.id, { isMuted: true });
    }
  }, [isMuted, volume, resource.id, setPlaybackPartial]);

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
  }, [volume, handlePlayPause, handleSkip, handleVolumeChange, handleToggleMute]);

  const handleSaveAnnotation = useCallback(
    async (content: string) => {
      await addInteraction('annotation', content, {
        type: 'audio_timestamp',
        timestamp: currentTime,
      });
    },
    [currentTime, addInteraction],
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      if (!audioRef.current) return;
      audioRef.current.playbackRate = rate;
      setPlaybackRate(rate);
      setPlaybackPartial(resource.id, { playbackRate: rate });
    },
    [resource.id, setPlaybackPartial],
  );

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      persistPlayback();
    };
  }, [persistPlayback]);

  if (error || sourceError) {
    return <ErrorState error={error || sourceError || t('media.playback_failed_generic')} />;
  }

  const mainLoading = isLoading || sourceLoading;

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--dome-bg)' }}>
      <div className="min-h-0 flex-1 overflow-hidden">
        <StructuredTranscriptWorkspace
          resource={resource}
          mediaLabel="audio"
          currentTime={currentTime}
          onSeek={handleSeek}
          miniPlayerCollapsed={miniPlayerCollapsed}
          onToggleMiniPlayer={() => setMiniPlayerCollapsed((c) => !c)}
          isPlaying={isPlaying}
        />
      </div>

      {!miniPlayerCollapsed && (
        <div
          className="shrink-0 space-y-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
        >
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onDurationChange={handleDurationChange}
              onError={handleMediaError}
            />
          )}
          {mainLoading && !audioUrl ? (
            <LoadingState message={t('media.loading_audio')} />
          ) : (
            <>
              <SeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                formatTime={formatTime}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  value={playbackRate}
                  onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                  className="cursor-pointer rounded-lg px-2 py-1 text-xs"
                  style={{
                    background: 'var(--dome-bg-hover)',
                    border: '1px solid var(--dome-border)',
                    color: 'var(--dome-text)',
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
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSkip(-10)}
                    className="cursor-pointer rounded-full p-2 transition-colors"
                    style={{ color: 'var(--dome-text-muted)' }}
                    aria-label="Rewind 10 seconds"
                  >
                    <Rewind size={20} />
                  </button>
                  <MediaControls
                    isPlaying={isPlaying}
                    isMuted={isMuted}
                    volume={volume}
                    onPlayPause={() => void handlePlayPause()}
                    onToggleMute={handleToggleMute}
                    onVolumeChange={handleVolumeChange}
                  />
                  <button
                    type="button"
                    onClick={() => handleSkip(10)}
                    className="cursor-pointer rounded-full p-2 transition-colors"
                    style={{ color: 'var(--dome-text-muted)' }}
                    aria-label="Forward 10 seconds"
                  >
                    <FastForward size={20} />
                  </button>
                </div>
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
              <p className="text-center text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                {t('media.keyboard_hints_audio')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(AudioPlayerComponent);
