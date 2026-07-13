import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Backward01Icon, FastForwardIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { notifications } from '@/lib/notifications';
import { type Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';
import { useSafeMediaSource } from '@/lib/hooks/useSafeMediaSource';
import ListState from '@/components/shared/ListState';
import MediaControls from './shared/MediaControls';
import SeekBar from './shared/SeekBar';
import AnnotationInput from './shared/AnnotationInput';
import StructuredTranscriptWorkspace from './shared/StructuredTranscriptWorkspace';
import { useMediaPlaybackStore } from '@/lib/store/useMediaPlaybackStore';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';
interface AudioPlayerProps {
  resource: Resource;
}

function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  const prevSourceErrorRef = useRef(sourceError);
  if (sourceError !== prevSourceErrorRef.current) {
    prevSourceErrorRef.current = sourceError;
    setError(sourceError);
  }

  const sourceReady = !sourceLoading && Boolean(audioUrl || sourceError);
  const prevSourceReadyRef = useRef(sourceReady);
  if (sourceReady !== prevSourceReadyRef.current) {
    prevSourceReadyRef.current = sourceReady;
    if (sourceReady) setIsLoading(false);
  }

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

  useEffect(() => {
    return () => {
      persistPlayback();
    };
  }, [persistPlayback]);

  if (error || sourceError) {
    return <ListState variant="error" errorMessage={error || sourceError || t('media.playback_failed_generic')} fullHeight />;
  }

  const mainLoading = isLoading || sourceLoading;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
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
        <div className="flex shrink-0 flex-col gap-2 border-t bg-card px-4 py-3">
          {audioUrl && (
            // User-imported audio has no caption tracks; Dome offers
            // transcription as the accessible alternative.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              aria-label={t('media.audio_player', 'Audio player')}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onDurationChange={handleDurationChange}
              onError={handleMediaError}
            />
          )}
          {mainLoading && !audioUrl ? (
            <ListState variant="loading" loadingLabel={t('media.loading_audio')} fullHeight />
          ) : (
            <>
              <SeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                formatTime={formatMediaTime}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Select value={String(playbackRate) ?? null} onValueChange={(next) => { if (next != null) ((v) => handlePlaybackRateChange(parseFloat(v)))(next); }} items={[
                    { value: '0.5', label: '0.5x' },
                    { value: '0.75', label: '0.75x' },
                    { value: '1', label: '1x' },
                    { value: '1.25', label: '1.25x' },
                    { value: '1.5', label: '1.5x' },
                    { value: '2', label: '2x' },
                  ]}><SelectTrigger className="w-fit" aria-label="Playback speed"><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{([
                    { value: '0.5', label: '0.5x' },
                    { value: '0.75', label: '0.75x' },
                    { value: '1', label: '1x' },
                    { value: '1.25', label: '1.25x' },
                    { value: '1.5', label: '1.5x' },
                    { value: '2', label: '2x' },
                  ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select>
                <div className="flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSkip(-10)}
                    aria-label={t('media.rewind_seconds', { defaultValue: 'Rewind 10 seconds', count: 10 })}
                  >
                    <HugeiconsIcon icon={Backward01Icon} />
                  </Button>
                  <MediaControls
                    isPlaying={isPlaying}
                    isMuted={isMuted}
                    volume={volume}
                    onPlayPause={() => void handlePlayPause()}
                    onToggleMute={handleToggleMute}
                    onVolumeChange={handleVolumeChange}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSkip(10)}
                    aria-label={t('media.forward_seconds', { defaultValue: 'Forward 10 seconds', count: 10 })}
                  >
                    <HugeiconsIcon icon={FastForwardIcon} />
                  </Button>
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
              <p className="text-center text-[10px] text-muted-foreground">
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
