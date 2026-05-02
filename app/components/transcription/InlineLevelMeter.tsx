import { useMemo } from 'react';
import { useAudioLevel } from '@/lib/transcription/useAudioLevel';

interface Props {
  stream: MediaStream | null;
  bars?: number;
  active?: boolean;
}

export default function InlineLevelMeter({ stream, bars = 6, active = true }: Props) {
  const level = useAudioLevel(stream);

  const heights = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < bars; i++) {
      const distance = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
      const center = 1 - distance * 0.6;
      const value = Math.min(1, level * (1.2 + Math.random() * 0.4) * center);
      arr.push(Math.max(0.15, value));
    }
    return arr;
  }, [level, bars]);

  return (
    <div className="flex items-end gap-[2px]" aria-hidden style={{ height: 14 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 2,
            borderRadius: 1,
            height: `${Math.round(h * 100)}%`,
            background: active ? 'var(--dome-accent, #7b76d0)' : 'var(--dome-text-muted, #858299)',
            transition: 'height 80ms linear',
          }}
        />
      ))}
    </div>
  );
}
