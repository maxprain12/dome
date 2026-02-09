
import React from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

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
      {/* Play/Pause Button */}
      <button
        onClick={onPlayPause}
        className={`${isCompact ? 'p-2' : 'p-4'} rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2`}
        style={{
          background: 'var(--accent)',
          color: 'white',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'brightness(1)';
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause size={isCompact ? 20 : 28} />
        ) : (
          <Play size={isCompact ? 20 : 28} className="ml-0.5" />
        )}
      </button>

      {/* Volume Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMute}
          className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{ color: 'var(--secondary-text)' }}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        {!isCompact && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-24 h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${
                (isMuted ? 0 : volume) * 100
              }%, var(--border) ${(isMuted ? 0 : volume) * 100}%, var(--border) 100%)`,
            }}
            aria-label="Volume"
          />
        )}
      </div>
    </div>
  );
}

export default React.memo(MediaControlsComponent);
