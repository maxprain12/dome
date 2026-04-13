import React from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import DomeButton from '@/components/ui/DomeButton';
import DomeSlider from '@/components/ui/DomeSlider';

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
  const isCompact = variant === 'compact';

  return (
    <div className="flex items-center gap-2">
      <DomeButton
        type="button"
        variant="primary"
        size={isCompact ? 'md' : 'lg'}
        iconOnly
        onClick={onPlayPause}
        className={`rounded-full hover:brightness-110 ${isCompact ? '!p-2 min-w-[44px] min-h-[44px]' : '!p-4'}`}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause size={isCompact ? 20 : 28} />
        ) : (
          <Play size={isCompact ? 20 : 28} className="ml-0.5" />
        )}
      </DomeButton>

      <div className="flex items-center gap-2">
        <DomeButton
          type="button"
          variant="ghost"
          size="md"
          iconOnly
          onClick={onToggleMute}
          className="min-w-[44px] min-h-[44px] !text-[var(--secondary-text)] hover:bg-[var(--bg-tertiary)]"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </DomeButton>

        {!isCompact && (
          <DomeSlider
            min={0}
            max={1}
            step={0.1}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-24 h-1.5"
            trackClassName="h-1.5"
            aria-label="Volume"
          />
        )}
      </div>
    </div>
  );
}

export default React.memo(MediaControlsComponent);
