import type { AudiencePoint, EngagementMixSlice } from '@/components/social/insights/insightsMetrics';

function pathFor(values: Array<number | null>, width: number, height: number, pad: number): string {
  if (values.length === 0) return '';
  const max = Math.max(...values.map((value) => value ?? 0), 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  let connected = false;
  return values
    .map((value, index) => {
      if (value == null) { connected = false; return ''; }
      const command = connected ? 'L' : 'M';
      connected = true;
      const x = pad + (values.length === 1 ? innerW / 2 : (index / (values.length - 1)) * innerW);
      const y = pad + innerH - (value / max) * innerH;
      return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function AudienceGrowthChart({
  points,
  label,
  emptyLabel,
  locale = 'es',
}: {
  points: AudiencePoint[];
  label: string;
  emptyLabel: string;
  locale?: string;
}) {
  const width = 640;
  const height = 200;
  const pad = 8;
  const hasSignal = points.some(
    (point) => point.followers != null,
  );
  if (!hasSignal) {
    return (
      <p className="text-sm text-muted-foreground" role="img" aria-label={label}>
        {emptyLabel}
      </p>
    );
  }
  const known = points.filter((point) => point.followers != null);
  const last = known.at(-1)!;
  const lastIndex = points.indexOf(last);
  const max = Math.max(...known.map((point) => point.followers ?? 0), 1);
  const formatDate = (at: number) => new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label={label}>
        <title>{label}: {known[0].followers} → {known.at(-1)?.followers}</title>
        <path
          d={pathFor(points.map((point) => point.followers), width, height, pad)}
          fill="none" stroke="var(--foreground)" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
        />
        <circle
          cx={pad + (points.length === 1 ? (width - pad * 2) / 2 : lastIndex / (points.length - 1) * (width - pad * 2))}
          cy={pad + (height - pad * 2) * (1 - (last.followers ?? 0) / max)}
          r={3} fill="var(--foreground)"
        />
      </svg>
      <figcaption className="flex justify-between gap-3 text-xs tabular-nums text-muted-foreground">
        <span>{formatDate(known[0].t)} · {known[0].followers?.toLocaleString(locale)}</span>
        <span>{formatDate(known.at(-1)!.t)} · {known.at(-1)?.followers?.toLocaleString(locale)}</span>
      </figcaption>
    </figure>
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
