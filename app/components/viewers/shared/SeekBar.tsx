
import React from 'react';

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  formatTime?: (seconds: number) => string;
  showTimestamps?: boolean;
  variant?: 'audio' | 'video';
}

const defaultFormatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function SeekBarComponent({
  currentTime,
  duration,
  onSeek,
  formatTime = defaultFormatTime,
  showTimestamps = true,
  variant = 'audio',
}: SeekBarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full">
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${progress}%, var(--border) ${progress}%, var(--border) 100%)`,
        }}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
      />
      {showTimestamps && (
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>
            {formatTime(currentTime)}
          </span>
          <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>
            {formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}

export default React.memo(SeekBarComponent);
