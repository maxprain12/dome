/**
 * AudioLevelMeter
 * Displays 5 animated bars that reflect a live audio level (0–1).
 * Uses useAudioLevel internally when a MediaStream is provided,
 * or accepts a pre-computed level via the `level` prop (for external control).
 *
 * Idle state: bars at minimal height, muted color.
 * Active state: bars animate with random wobble + level-driven height.
 */

import { memo, useEffect, useState } from 'react';
import { useAudioLevel } from '@/lib/transcription/useAudioLevel';

const BAR_HEIGHTS = [4, 8, 14, 8, 4]; // resting heights in px
const BAR_MAX_BOOST = 18; // max extra px from audio level

interface AudioLevelMeterProps {
  /** Live MediaStream — hook will compute the level automatically. */
  stream?: MediaStream | null;
  /**
   * Pre-computed normalized level (0–1).
   * Used when the stream is managed externally (e.g. WebRTC sessions).
   * Ignored if `stream` is provided.
   */
  level?: number;
  /** Whether the bars should animate (even without audio, e.g. "connecting"). */
  active?: boolean;
  /** Color for active bars. Defaults to var(--dome-accent). */
  color?: string;
  /** Color for idle/inactive bars. Defaults to var(--dome-text-muted). */
  idleColor?: string;
  /** Bar width in px. Defaults to 3. */
  barWidth?: number;
  /** Container height in px. Defaults to 24. */
  height?: number;
}

const PHASES = 24;

function getWobble(barIndex: number, time: number, level: number): number {
  const phase = (time + barIndex * 3.5) * 0.38;
  return Math.sin(phase) * (4 + level * BAR_MAX_BOOST);
}

export const AudioLevelMeter = memo(function AudioLevelMeter({
  stream,
  level: externalLevel,
  active = true,
  color = 'var(--dome-accent, #7b76d0)',
  idleColor = 'var(--dome-text-muted, #999)',
  barWidth = 3,
  height = 24,
}: AudioLevelMeterProps) {
  const streamLevel = useAudioLevel(stream ?? null);
  const level = stream != null ? streamLevel : (externalLevel ?? 0);

  // Tick state for animation when active but no stream provides re-renders.
  const [tick, setTick] = useState(0);
  const needsTick = active && stream == null && (externalLevel == null || externalLevel === 0);
  useEffect(() => {
    if (!needsTick) return;
    const id = setInterval(() => setTick((t) => (t + 1) % PHASES), 80);
    return () => clearInterval(id);
  }, [needsTick]);

  const now = stream != null
    ? Math.floor(Date.now() / 80) % PHASES  // driven by audio level re-renders
    : needsTick ? tick : Math.floor(Date.now() / 80) % PHASES;

  return (
    <div
      className="flex items-end justify-center shrink-0"
      style={{ gap: 2, height, width: BAR_HEIGHTS.length * (barWidth + 2) }}
      aria-hidden
    >
      {BAR_HEIGHTS.map((base, i) => {
        const wobble = active || level > 0.01 ? getWobble(i, now, level) : 0;
        const barH = Math.max(2, base + wobble);
        const isActive = active || level > 0.01;
        return (
          <div
            key={i}
            style={{
              width: barWidth,
              height: barH,
              borderRadius: 9999,
              background: isActive ? color : idleColor,
              opacity: isActive ? 1 : 0.3,
              transition: 'height 80ms ease, opacity 200ms ease',
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
});
