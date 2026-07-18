import { useTranslation } from 'react-i18next';
import type { SocialMetric } from '@/components/social/socialTypes';
import { cn } from '@/lib/utils';

function fmt(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Intl.NumberFormat().format(n);
}

/** Compact engagement chips for a post (likes, comments, shares, saves, impressions). */
export function SocialPostMetrics({
  metrics,
  className,
  dense,
}: {
  metrics?: SocialMetric | null;
  className?: string;
  dense?: boolean;
}) {
  const { t } = useTranslation();
  if (!metrics) return null;

  const items = [
    { key: 'likes', value: fmt(metrics.likes), label: t('social.metrics.likes') },
    { key: 'comments', value: fmt(metrics.comments), label: t('social.metrics.comments') },
    { key: 'shares', value: fmt(metrics.shares), label: t('social.metrics.shares') },
    { key: 'saves', value: fmt(metrics.saves), label: t('social.metrics.saves') },
    { key: 'impressions', value: fmt(metrics.impressions), label: t('social.metrics.impressions') },
  ].filter((i) => i.value != null);

  if (items.length === 0) return null;

  return (
    <span
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums text-muted-foreground',
        dense ? 'text-[11px]' : 'text-xs',
        className,
      )}
    >
      {items.map((item) => (
        <span key={item.key} title={item.label}>
          <span className="text-foreground/80">{item.value}</span>
          <span className="ml-0.5">{item.label}</span>
        </span>
      ))}
    </span>
  );
}
