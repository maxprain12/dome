import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ArtifactCard from '@/components/chat/ArtifactCard';
import type { AnyArtifact, ChartArtifact, TableArtifact } from '@/components/chat/ArtifactCard';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { SocialAccountAvatar } from '@/components/social/cards/SocialAccountAvatar';
import { SocialEvidenceCard } from '@/components/social/cards/SocialEvidenceCard';
import { SocialProfileCard } from '@/components/social/cards/SocialProfileCard';
import { Badge } from '@/components/ui/badge';
import type { DashboardArtifactV } from '@/lib/chat/artifactSchemas';
import {
  asRenderableArtifact,
  cleanVisualLabel,
  collectSocialInsight,
  collectSocialReferenceCards,
  flattenToolDisplayCalls,
  isGenericVisualTitle,
  parseAssistantVisualSegments,
  type ManySocialInsight,
  type ManySocialInsightKpi,
  type ManySocialInsightMix,
  type VisualCardToolCall,
} from '@/lib/chat/manyVisualCards';
import type { ToolDisplayBlock } from '@/lib/chat/groupToolCalls';
import type { ManyMessageData } from '@/lib/many/types';
import { cn } from '@/lib/utils';

const KPI_LABEL: Record<ManySocialInsightKpi['label'], string> = {
  impressions: 'chat.visual_impressions',
  likes: 'chat.visual_likes',
  comments: 'chat.visual_comments',
  saves: 'chat.visual_saves',
  shares: 'chat.visual_shares',
  engagement: 'chat.visual_engagement',
};

const MIX_LABEL: Record<ManySocialInsightMix['label'], string> = {
  likes: 'chat.visual_likes',
  comments: 'chat.visual_comments',
  saves: 'chat.visual_saves',
};

const MIX_TONE = ['var(--foreground)', 'var(--muted-foreground)', 'var(--border)'] as const;

function mixBackground(mix: Array<{ percent: number }>): string {
  if (mix.length === 0) return 'var(--muted)';
  let cursor = 0;
  const stops: string[] = [];
  mix.forEach((part, index) => {
    const start = cursor / 2;
    cursor += part.percent;
    const end = cursor / 2;
    stops.push(`${MIX_TONE[index] ?? 'var(--border)'} ${start}% ${end}%`);
  });
  stops.push(`transparent ${cursor / 2}% 100%`);
  return `conic-gradient(from -90deg, ${stops.join(', ')})`;
}

function VisualPanel({
  title,
  children,
  className,
}: {
  title?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const heading = title ? cleanVisualLabel(title) : '';
  const showTitle = heading.length > 0 && !isGenericVisualTitle(heading);
  return (
    <article
      className={cn(
        'min-w-0 overflow-hidden rounded-2xl border bg-card p-4 text-card-foreground',
        className,
      )}
    >
      {showTitle ? (
        <p className="mb-3 text-xs font-medium text-muted-foreground">{heading}</p>
      ) : null}
      {children}
    </article>
  );
}

function VisualInset({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function VisualDonut({ slices }: { slices: Array<{ label: string; percent: number }> }) {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden
        className="size-16 shrink-0 rounded-full"
        style={{
          background: mixBackground(slices),
          maskImage: 'radial-gradient(farthest-side, transparent 58%, black 59%)',
          WebkitMaskImage: 'radial-gradient(farthest-side, transparent 58%, black 59%)',
        }}
      />
      <ul className="min-w-0 flex flex-1 flex-col gap-1 text-xs">
        {slices.map((part, index) => (
          <li key={part.label} className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: MIX_TONE[index] ?? 'var(--border)' }}
              />
              <span className="truncate">{part.label}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium">{part.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisualOverview({
  rows,
}: {
  rows: Array<{ key: string; label: string; value: string; hint?: string }>;
}) {
  return (
    <dl className="divide-y">
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
          <dt className="min-w-0 truncate text-xs text-muted-foreground">{row.label}</dt>
          <dd className="flex shrink-0 items-baseline gap-1.5">
            <span className="text-sm font-medium tabular-nums">{row.value}</span>
            {row.hint ? <span className="text-[11px] text-muted-foreground">{row.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VisualBars({
  rows,
}: {
  rows: Array<{ key: string; label: string; value: number; display?: string }>;
}) {
  const maxBar = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.key} className="min-w-0">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {row.display ?? String(row.value)}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground"
              style={{ width: `${Math.max(4, Math.round((row.value / maxBar) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ManySocialInsightCard({ insight }: { insight: ManySocialInsight }) {
  const { t } = useTranslation();
  const handle = insight.handle ? `@${insight.handle.replace(/^@/, '')}` : insight.authorName;
  const mixSlices = insight.mix.map((part) => ({
    label: t(MIX_LABEL[part.label]),
    percent: part.percent,
  }));
  return (
    <VisualPanel>
      <header className="flex min-w-0 items-center gap-3">
        <SocialAccountAvatar name={insight.authorName} src={insight.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{handle}</p>
          <p className="truncate text-xs text-muted-foreground">{insight.title}</p>
        </div>
      </header>

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {mixSlices.length > 0 ? (
          <VisualInset title={t('chat.visual_engagement_mix')}>
            <VisualDonut slices={mixSlices} />
          </VisualInset>
        ) : null}

        {insight.kpis.length > 0 ? (
          <VisualInset title={t('chat.visual_overview')}>
            <VisualOverview
              rows={insight.kpis.map((kpi) => ({
                key: kpi.label,
                label: t(KPI_LABEL[kpi.label]),
                value: kpi.value,
              }))}
            />
          </VisualInset>
        ) : null}
      </div>

      {insight.comparison.length > 1 ? (
        <div className="mt-4 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{t('chat.visual_recent_posts')}</p>
          <div className="mt-2">
            <VisualBars
              rows={insight.comparison.map((row) => ({
                key: row.label,
                label: row.label,
                value: row.impressions,
              }))}
            />
          </div>
        </div>
      ) : null}

      {insight.topics.length > 0 ? (
        <div className="mt-4 flex min-w-0 flex-wrap gap-1.5">
          {insight.topics.map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
      ) : null}
    </VisualPanel>
  );
}

function kpiHint(kpi: { sub?: string; subtitle?: string; unit?: string }): string | undefined {
  const hint = cleanVisualLabel(kpi.sub || kpi.subtitle || kpi.unit || '');
  return hint.length > 0 ? hint : undefined;
}

function ManyCompactDashboard({ artifact }: { artifact: DashboardArtifactV }) {
  const { t } = useTranslation();
  const kpis = artifact.kpis ?? [];
  const items = artifact.items ?? [];
  const sections = artifact.sections ?? [];
  return (
    <VisualPanel title={artifact.title}>
      {kpis.length > 0 ? (
        <VisualInset title={t('chat.visual_overview')}>
          <VisualOverview
            rows={kpis.map((kpi, index) => ({
              key: kpi.id ?? `kpi-${index}`,
              label: cleanVisualLabel(kpi.label),
              value: cleanVisualLabel(String(kpi.value)),
              hint: kpiHint(kpi),
            }))}
          />
        </VisualInset>
      ) : null}
      {items.length > 0 ? (
        <div className={cn('min-w-0', kpis.length > 0 && 'mt-3')}>
          <VisualBars
            rows={items.map((item, index) => ({
              key: item.id ?? `item-${index}`,
              label: cleanVisualLabel(item.label),
              value: item.progress,
              display: `${Math.round(item.progress)}%`,
            }))}
          />
        </div>
      ) : null}
      {sections.map((section, index) => (
        <div key={section.id ?? `section-${index}`} className="mt-3 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{cleanVisualLabel(section.title)}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{section.body}</p>
        </div>
      ))}
    </VisualPanel>
  );
}

function chartSlices(artifact: ChartArtifact): Array<{ label: string; percent: number }> {
  const values = artifact.data.datasets[0]?.data ?? [];
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return [];
  return artifact.data.labels
    .map((label, index) => ({
      label: cleanVisualLabel(label),
      percent: Math.round((Math.max(0, values[index] ?? 0) / total) * 100),
    }))
    .filter((slice) => slice.percent > 0);
}

function ManyCompactChart({ artifact }: { artifact: ChartArtifact }) {
  switch (artifact.chart_type) {
    case 'pie': {
      const slices = chartSlices(artifact);
      return (
        <VisualPanel title={artifact.title}>
          {slices.length > 0 ? <VisualDonut slices={slices} /> : null}
        </VisualPanel>
      );
    }
    case 'bar':
    case 'line':
    case 'scatter': {
      const values = artifact.data.datasets[0]?.data ?? [];
      return (
        <VisualPanel title={artifact.title}>
          <VisualBars
            rows={artifact.data.labels.map((label, index) => ({
              key: `${label}:${index}`,
              label: cleanVisualLabel(label),
              value: values[index] ?? 0,
            }))}
          />
        </VisualPanel>
      );
    }
    default: {
      const exhaustive: never = artifact.chart_type;
      return exhaustive;
    }
  }
}

function ManyCompactTable({ artifact }: { artifact: TableArtifact }) {
  const headers = artifact.headers.map(cleanVisualLabel);
  return (
    <VisualPanel title={artifact.title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-0 text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              {headers.map((header) => (
                <th key={header} className="px-1 py-1.5 text-left font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {artifact.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}:${cellIndex}`}
                    className={cn(
                      'max-w-40 truncate px-1 py-1.5',
                      cellIndex === 0 ? 'text-muted-foreground' : 'tabular-nums font-medium',
                    )}
                  >
                    {cleanVisualLabel(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </VisualPanel>
  );
}

function ManyCompactArtifact({ artifact }: { artifact: AnyArtifact }) {
  switch (artifact.type) {
    case 'dashboard':
      return <ManyCompactDashboard artifact={artifact} />;
    case 'chart':
      return <ManyCompactChart artifact={artifact} />;
    case 'table':
      return <ManyCompactTable artifact={artifact} />;
    default:
      return <ArtifactCard artifact={artifact} />;
  }
}

export function ManyReferenceCards({
  calls,
  className,
}: {
  calls: VisualCardToolCall[];
  className?: string;
}) {
  const cards = useMemo(() => collectSocialReferenceCards(calls), [calls]);
  const insight = useMemo(() => collectSocialInsight(calls), [calls]);
  if (cards.length === 0 && !insight) return null;
  return (
    <div className={cn('not-typeset flex w-full min-w-0 flex-col gap-2', className)}>
      {cards.map((card) =>
        card.kind === 'profile' ? (
          <SocialProfileCard key={card.key} model={card.model} />
        ) : (
          <SocialEvidenceCard key={card.key} model={card.model} variant="row" />
        ),
      )}
      {insight ? <ManySocialInsightCard insight={insight} /> : null}
    </div>
  );
}

export function ManyReferenceCardsFromBlocks({
  blocks,
  className,
}: {
  blocks: ToolDisplayBlock[];
  className?: string;
}) {
  const calls = useMemo(() => flattenToolDisplayCalls(blocks), [blocks]);
  return <ManyReferenceCards calls={calls} className={className} />;
}

function StreamingArtifactPlaceholder({ artifactType }: { artifactType: string }) {
  const { t } = useTranslation();
  const typeLabel = t(`artifacts.${artifactType}`, { defaultValue: artifactType });
  return (
    <p className="px-1.5 text-xs text-muted-foreground">
      {t('chat.artifact_streaming', { type: typeLabel })}
    </p>
  );
}

function InvalidArtifactPlaceholder() {
  const { t } = useTranslation();
  return <p className="px-1.5 text-xs text-muted-foreground">{t('chat.artifact_invalid')}</p>;
}

export function ManyAssistantVisualBody({
  content,
  allowStreaming,
  citationMap,
  onClickCitation,
  showCaret,
}: {
  content: string;
  allowStreaming: boolean;
  citationMap: ManyMessageData['citationMap'];
  onClickCitation: (n: number) => void;
  showCaret: boolean;
}) {
  const segments = useMemo(
    () => parseAssistantVisualSegments(content, allowStreaming),
    [allowStreaming, content],
  );

  return (
    <div className="flex min-w-0 w-full flex-col gap-2">
      {segments.map((segment, index) => {
        const key = `visual:${index}:${segment.kind}`;
        if (segment.kind === 'text') {
          if (!segment.content.trim()) return null;
          return (
            <div
              key={key}
              className="min-w-0 w-full break-words text-sm leading-relaxed [overflow-wrap:anywhere]"
            >
              <MarkdownRenderer
                content={segment.content}
                citationMap={citationMap}
                onClickCitation={onClickCitation}
              />
            </div>
          );
        }
        if (segment.kind === 'streaming') {
          return <StreamingArtifactPlaceholder key={key} artifactType={segment.artifactType} />;
        }
        if (segment.kind === 'invalid') {
          return <InvalidArtifactPlaceholder key={key} />;
        }
        if (segment.kind !== 'artifact') {
          const exhaustive: never = segment;
          return exhaustive;
        }
        const artifact = asRenderableArtifact(segment.value);
        if (!artifact) return <InvalidArtifactPlaceholder key={key} />;
        return (
          <div key={key} className="not-typeset min-w-0 w-full">
            <ManyCompactArtifact artifact={artifact} />
          </div>
        );
      })}
      {showCaret ? (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}
