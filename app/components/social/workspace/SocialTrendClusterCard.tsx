import { useTranslation } from 'react-i18next';
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
}: {
  cluster: RadarCluster;
  selected?: boolean;
  onOpen: () => void;
  onCreate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const title = radarClusterLabel(cluster, t('social.trends.untitled'));
  const covers = coversFromPosts(cluster.evidence || []);
  const format = dominantFormat(cluster.evidence || []);
  const signal = velocitySignal(cluster.velocity);
  const band = radarFitBand(cluster);
  const measuredExamples = (cluster.evidence || []).filter((item) => typeof item.metrics?.likes === 'number' && Number.isFinite(item.metrics.likes));
  const sampleLikes = measuredExamples.reduce((sum, item) => sum + (item.metrics?.likes ?? 0), 0);
  const meta = [
    cluster.phase !== 'observed' ? t(`social.trends.signal_${signal}`) : null,
    t('social.trends.posts_count', { count: cluster.postCount ?? cluster.evidence?.length ?? 0 }),
    cluster.authorCount != null ? t('social.trends.authors_count', { count: cluster.authorCount }) : null,
    format ? t(`social.native.format_${format}`, { defaultValue: format }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'isolate flex flex-col overflow-hidden rounded-2xl border bg-card',
        selected ? 'border-primary' : 'border-border',
      )}
    >
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]" onClick={onOpen}>
        {covers.length > 0 ? <SocialCoverMosaic covers={covers} /> : null}
        <div className="relative z-10 flex flex-col gap-1.5 bg-card px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{t(`social.trends.phase_${cluster.phase}`)}</Badge>
            {cluster.nativeTrend ? <Badge variant="outline">{t('social.trends.native_trend')}</Badge> : null}
          </div>
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{meta}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {cluster.evidenceStats
              ? t('social.trends.measurement_basis', { days: cluster.evidenceStats.windowDays, measured: cluster.evidenceStats.measuredPostCount, tracked: cluster.evidenceStats.trackedPostCount })
              : t(cluster.source === 'local' ? 'social.trends.local_scope' : 'social.trends.shared_sample')}
          </p>
          {measuredExamples.length > 0 ? <p className="text-xs text-muted-foreground">{t('social.trends.sample_likes', { likes: new Intl.NumberFormat(i18n.language).format(sampleLikes), posts: measuredExamples.length })}</p> : null}
          {cluster.phase === 'observed' ? <p className="text-xs leading-relaxed text-muted-foreground">{t('social.trends.phase_why_observed')}</p> : null}
          <span className="mt-1 text-xs font-medium text-primary">{t('social.trends.view_evidence')}</span>
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

      </div>
    </article>
  );
}
