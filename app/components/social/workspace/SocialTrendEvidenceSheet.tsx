import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SocialEvidenceCard } from '@/components/social/cards/SocialEvidenceCard';
import { publicCardToModelSafe } from '@/components/social/cards/socialCardModel';
import type { RadarCluster } from '@/lib/social/radarTypes';
import { radarClusterLabel, radarFitBand } from '@/lib/social/radarTypes';

export function SocialTrendEvidenceSheet({
  cluster,
  open,
  onOpenChange,
  onCreate,
  onExplore,
}: {
  cluster: RadarCluster | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onExplore: (theme: string) => void;
}) {
  const { t } = useTranslation();
  const title = radarClusterLabel(cluster, t('social.trends.untitled'));
  const band = cluster ? radarFitBand(cluster) : 'low';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {cluster ? t(cluster.source === 'local' && cluster.phase !== 'observed' ? 'social.trends.local_phase_explanation' : `social.trends.phase_why_${cluster.phase}`) : t('social.trends.evidence_hint')}
          </SheetDescription>
        </SheetHeader>
        {cluster ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <p className="text-sm text-muted-foreground">
              {t('social.trends.evidence_sample', { shown: cluster.evidence?.length ?? 0, total: cluster.postCount ?? cluster.evidence?.length ?? 0 })}
              {' '}{cluster.source === 'local' ? t('social.trends.local_scope') : t('social.trends.shared_sample')}
            </p>
            {cluster.evidenceStats ? <p className="text-sm text-muted-foreground">{t('social.trends.measurement_basis', { days: cluster.evidenceStats.windowDays, measured: cluster.evidenceStats.measuredPostCount, tracked: cluster.evidenceStats.trackedPostCount })}</p> : null}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{t(`social.trends.phase_${cluster.phase}`)}</Badge>
              {(cluster.topics || []).slice(0, 6).map((topic) => (
                <Badge key={topic} variant="outline">{topic}</Badge>
              ))}
            </div>
            {band !== 'low' ? (
              <p className="text-sm text-muted-foreground">{t(`social.trends.fit_${band}`)}</p>
            ) : null}
            <Button type="button" onClick={onCreate}>{t('social.trends.create_from')}</Button>
            {cluster.topicKey && cluster.topicKey !== 'untagged' ? (
              <Button type="button" variant="outline" onClick={() => onExplore(cluster.title)}>
                {t('social.trends.explore_theme')}
              </Button>
            ) : null}
            <div className="flex flex-col gap-3">
              {(cluster.evidence || []).map((item) => {
                const model = publicCardToModelSafe({
                  provider: item.provider || undefined,
                  kind: 'post',
                  format: item.format,
                  url: item.url,
                  title: item.title,
                  body: item.body || item.title,
                  author: item.author,
                  media: item.media,
                  metrics: item.metrics,
                  publishedAt: item.publishedAt,
                });
                if (!model) {
                  return (
                    <p key={item.id} className="text-sm">
                      {item.title}
                    </p>
                  );
                }
                return <SocialEvidenceCard key={item.id} model={model} />;
              })}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
