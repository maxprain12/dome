import type { AudiencePoint, EngagementMixSlice } from '@/components/social/insights/insightsMetrics';

const SERIES = [
  { key: 'followers' as const, color: 'var(--foreground)', width: 2, dashed: false },
  { key: 'impressions' as const, color: 'color-mix(in oklab, var(--foreground) 45%, transparent)', width: 1.5, dashed: true },
  { key: 'engagements' as const, color: 'var(--muted-foreground)', width: 1.5, dashed: true },
];

function pathFor(values: number[], width: number, height: number, pad: number): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return values
    .map((value, index) => {
      const x = pad + (values.length === 1 ? innerW / 2 : (index / (values.length - 1)) * innerW);
      const y = pad + innerH - (value / max) * innerH;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function AudienceGrowthChart({
  points,
  label,
  emptyLabel,
}: {
  points: AudiencePoint[];
  label: string;
  emptyLabel: string;
}) {
  const width = 640;
  const height = 200;
  const pad = 8;
  const hasSignal = points.some(
    (point) => point.followers > 0 || point.impressions > 0 || point.engagements > 0,
  );
  if (!hasSignal) {
    return (
      <p className="text-sm text-muted-foreground" role="img" aria-label={label}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-44 w-full"
      role="img"
      aria-label={label}
    >
      {SERIES.map((series) => (
        <path
          key={series.key}
          d={pathFor(points.map((point) => point[series.key]), width, height, pad)}
          fill="none"
          stroke={series.color}
          strokeWidth={series.width}
          strokeDasharray={series.dashed ? '5 4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function MixBar({
  slice,
  label,
}: {
  slice: EngagementMixSlice;
  label: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">
        {Math.round(slice.pct * 100)}%
      </span>
    </div>
  );
}
