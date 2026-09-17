import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RadarCluster, RadarEvidence } from '@/lib/social/radarTypes';
import { radarClusterLabel, radarFitBand } from '@/lib/social/radarTypes';
import { coversFromPosts } from './socialCoverSrc';
import { SocialCoverMosaic } from './SocialCoverMosaic';

function velocitySignal(velocity: number): 'rising' | 'stable' | 'cooling' {
  if (velocity > 0.25) return 'rising';
  if (velocity < -0.15) return 'cooling';
  return 'stable';
}

function dominantFormat(evidence: RadarEvidence[]): string | null {
  const counts = new Map<string, number>();
  for (const item of evidence) {
    const format = String(item.format || '').trim();
    if (!format || format === 'profile') continue;
    counts.set(format, (counts.get(format) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [format, count] of counts) {
    if (count > bestCount) {
      best = format;
      bestCount = count;
    }
  }
  return best;
}

export function SocialTrendClusterCard({
  cluster,
  selected,
  onOpen,
  onCreate,
  onDismiss,
}: {
  cluster: RadarCluster;
  selected?: boolean;
  onOpen: () => void;
  onCreate: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const title = radarClusterLabel(cluster, t('social.trends.untitled'));
  const covers = coversFromPosts(cluster.evidence || []);
  const format = dominantFormat(cluster.evidence || []);
  const signal = velocitySignal(cluster.velocity);
  const band = radarFitBand(cluster);
  const meta = [
    t(`social.trends.signal_${signal}`),
    t('social.trends.authors_count', { count: cluster.authorCount }),
    format ? t(`social.native.format_${format}`, { defaultValue: format }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'isolate flex flex-col overflow-hidden rounded-2xl border bg-card',
        selected ? 'border-primary' : 'border-border',
      )}
    >
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={onOpen}>
        <SocialCoverMosaic covers={covers} />
        <div className="relative z-10 flex flex-col gap-1.5 bg-card px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{t(`social.trends.phase_${cluster.phase}`)}</Badge>
            {cluster.nativeTrend ? <Badge variant="outline">{t('social.trends.native_trend')}</Badge> : null}
          </div>
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
          {band !== 'low' ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">{t(`social.trends.fit_${band}`)}</p>
          ) : null}
        </div>
      </button>
      <div className="relative z-10 flex items-center justify-between gap-2 border-t bg-card px-3.5 py-2">
        <Button
          type="button"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onCreate();
          }}
        >
          {t('social.trends.create_short')}
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t('social.trends.dismiss')}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </div>
    </article>
  );
}
