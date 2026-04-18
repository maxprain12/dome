/**
 * Rolling frequency histogram for live audio (call / streaming hub).
 */

import { memo, useEffect, useRef, useState } from 'react';

type Props = {
  stream: MediaStream | null;
  active?: boolean;
  /** Number of bars (bins collapsed). */
  bars?: number;
  height?: number;
  label?: string;
};

export const WaveformMeter = memo(function WaveformMeter({
  stream,
  active = true,
  bars = 40,
  height = 36,
  label,
}: Props) {
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: bars }, () => 0));
  const animRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>(Array.from({ length: bars }, () => 0));

  useEffect(() => {
    if (!stream || !active) {
      historyRef.current = Array.from({ length: bars }, () => 0);
      setLevels(historyRef.current);
      return undefined;
    }

    const AudioContextClass =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return undefined;

    const ctx = new AudioContextClass();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.45;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const perBar = Math.floor(data.length / bars);
      const next: number[] = [];
      for (let b = 0; b < bars; b++) {
        let sum = 0;
        const from = b * perBar;
        const to = Math.min(from + perBar, data.length);
        for (let i = from; i < to; i++) sum += data[i];
        const avg = sum / ((to - from) * 255);
        const prev = historyRef.current[b] ?? 0;
        next.push(Math.min(1, prev * 0.82 + avg * 0.55));
      }
      historyRef.current = next;
      setLevels(next);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      try {
        source.disconnect();
      } catch {
        /* */
      }
      void ctx.close();
    };
  }, [stream, active, bars]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {label ? (
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
          {label}
        </span>
      ) : null}
      <div
        className="flex w-full min-w-0 items-end justify-center gap-px rounded-lg px-1"
        style={{ height, background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
        aria-hidden
      >
        {levels.map((lv, i) => (
          <div
            key={i}
            className="min-w-0 flex-1 rounded-sm transition-[height] duration-75"
            style={{
              height: `${Math.max(8, lv * (height - 8))}px`,
              background: 'color-mix(in srgb, var(--dome-accent) 75%, transparent)',
              maxHeight: height - 4,
            }}
          />
        ))}
      </div>
    </div>
  );
});
