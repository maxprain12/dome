import React from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { PauseIcon, PlayIcon, VolumeHighIcon, VolumeMute01Icon } from '@hugeicons/core-free-icons';
import { Slider } from '@/components/ui/slider';
import { useTranslation } from 'react-i18next';

interface MediaControlsProps {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  onPlayPause: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  variant?: 'compact' | 'full';
}

function MediaControlsComponent({
  isPlaying,
  isMuted,
  volume,
  onPlayPause,
  onToggleMute,
  onVolumeChange,
  variant = 'full',
}: MediaControlsProps) {
  const { t } = useTranslation();
  const isCompact = variant === 'compact';

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size={isCompact ? 'icon' : 'icon-lg'}
        onClick={onPlayPause}
        className="rounded-full"
        aria-label={isPlaying ? t('media.pause', { defaultValue: 'Pause' }) : t('media.play', { defaultValue: 'Play' })}
      >
        {isPlaying ? (
          <HugeiconsIcon icon={PauseIcon} />
        ) : (
          <HugeiconsIcon icon={PlayIcon} />
        )}
      </Button>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onToggleMute}
          aria-label={isMuted ? t('media.unmute', { defaultValue: 'Unmute' }) : t('media.mute', { defaultValue: 'Mute' })}
          size="icon"
        >
          <HugeiconsIcon icon={isMuted ? VolumeMute01Icon : VolumeHighIcon} />
        </Button>

        {!isCompact && (
          <Slider
            min={0}
            max={1}
            step={0.1}
            value={[isMuted ? 0 : volume]}
            onValueChange={(next) => {
              if (typeof next === 'number') onVolumeChange(next);
            }}
            className="w-24"
            aria-label={t('media.volume', { defaultValue: 'Volume' })}
          />
        )}
      </div>
    </div>
  );
}

export default React.memo(MediaControlsComponent);
