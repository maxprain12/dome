import type { AnyArtifact } from '@/components/chat/ArtifactCard';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { parseSocialToolResult } from '@/components/chat/tool-card/socialToolResults';
import { unwrapToolResultObject } from '@/components/chat/tool-card/toolResultParsers';
import type { SocialEvidenceCardModel } from '@/components/social/cards/socialCardModel';
import { postToEvidenceCard } from '@/components/social/cards/socialCardModel';
import type { SocialPost } from '@/components/social/socialTypes';
import {
  KNOWN_ARTIFACT_TYPES,
  parseArtifactBlocks,
  type ParsedArtifactSegment,
} from '@/lib/chat/artifactSchemas';
import type { ToolDisplayBlock } from '@/lib/chat/groupToolCalls';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';

const MAX_COMPARISON_POSTS = 5;
const SKIP_REFERENCE_TOOLS = new Set(['social_accounts_list']);

export type VisualCardToolCall = Pick<ToolCallData, 'name' | 'status' | 'result'>;

export type ManySocialReferenceCard = {
  key: string;
  kind: 'post' | 'profile';
  model: SocialEvidenceCardModel;
};

export type ManySocialInsightKpi = {
  label: 'impressions' | 'likes' | 'comments' | 'saves' | 'shares' | 'engagement';
  value: string;
};

export type ManySocialInsightMix = {
  label: 'likes' | 'comments' | 'saves';
  percent: number;
};

export type ManySocialInsightCompare = {
  label: string;
  impressions: number;
  likes: number;
};

export type ManySocialInsight = {
  title: string;
  handle: string | null;
  authorName: string;
  avatarUrl: string | null;
  kpis: ManySocialInsightKpi[];
  mix: ManySocialInsightMix[];
  comparison: ManySocialInsightCompare[];
  topics: string[];
};

function socialReferenceKey(model: SocialEvidenceCardModel): string {
  if (model.url) return `url:${model.url}`;
  const handle = model.author.handle || model.author.name;
  const when = model.publishedAt ?? 0;
  const body = (model.body || model.title || '').slice(0, 80);
  return `${model.kind}:${model.provider}:${handle}:${when}:${body}`;
}

function pushSocialModel(
  cards: ManySocialReferenceCard[],
  seen: Set<string>,
  kind: 'post' | 'profile',
  model: SocialEvidenceCardModel,
): void {
  const key = socialReferenceKey(model);
  if (seen.has(key)) return;
  seen.add(key);
  cards.push({ key, kind, model });
}

function asPost(value: unknown): SocialPost | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.provider !== 'string') return null;
  return value as SocialPost;
}

function postsFromUnknown(value: unknown): SocialEvidenceCardModel[] {
  if (Array.isArray(value)) {
    return value
      .map(asPost)
      .filter((post): post is SocialPost => post != null)
      .map((post) => postToEvidenceCard(post));
  }
  const post = asPost(value);
  return post ? [postToEvidenceCard(post)] : [];
}

function summaryRecord(obj: Record<string, unknown>): Record<string, unknown> | null {
  const summary = obj.summary;
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    return summary as Record<string, unknown>;
  }
  return null;
}

/** Flatten grouped tool blocks back into the calls they contain, in display order. */
export function flattenToolDisplayCalls(blocks: ToolDisplayBlock[]): ToolCallData[] {
  const out: ToolCallData[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'tool':
        out.push(block.call);
        break;
      case 'tool-group':
        out.push(...block.calls);
        break;
      case 'subagent':
        for (const inner of block.blocks) {
          if (inner.type === 'tool') out.push(inner.call);
          else out.push(...inner.calls);
        }
        break;
      default: {
        const exhaustive: never = block;
        return exhaustive;
      }
    }
  }
  return out;
}

function collectPostAndProfileCards(calls: VisualCardToolCall[]): {
  fromGet: ManySocialReferenceCard[];
  posts: ManySocialReferenceCard[];
  profiles: ManySocialReferenceCard[];
} {
  const fromGet: ManySocialReferenceCard[] = [];
  const posts: ManySocialReferenceCard[] = [];
  const profiles: ManySocialReferenceCard[] = [];
  const seen = new Set<string>();

  for (const call of calls) {
    if (call.status !== 'success') continue;
    const name = String(call.name || '').toLowerCase();
    if (SKIP_REFERENCE_TOOLS.has(name)) continue;

    const view = parseSocialToolResult(call.name, call.result);
    if (view) {
      switch (view.type) {
        case 'post':
          pushSocialModel(name === 'social_post_get' ? fromGet : posts, seen, 'post', view.model);
          break;
        case 'posts':
          for (const model of view.models) {
            pushSocialModel(posts, seen, 'post', model);
          }
          break;
        case 'profile':
          pushSocialModel(profiles, seen, 'profile', view.model);
          break;
        case 'profiles':
          for (const model of view.models) {
            pushSocialModel(profiles, seen, 'profile', model);
          }
          break;
        default: {
          const exhaustive: never = view;
          return exhaustive;
        }
      }
    }

    const obj = unwrapToolResultObject(call.result);
    if (!obj) continue;
    const summary = summaryRecord(obj);
    const nested = [
      ...postsFromUnknown(obj.post),
      ...postsFromUnknown(obj.posts),
      ...postsFromUnknown(summary?.recentPosts),
      ...postsFromUnknown(summary?.topPosts),
    ];
    for (const model of nested) {
      pushSocialModel(posts, seen, 'post', model);
    }
  }

  return { fromGet, posts, profiles };
}

function newestPosts(cards: ManySocialReferenceCard[]): ManySocialReferenceCard[] {
  return [...cards].sort((a, b) => (b.model.publishedAt ?? 0) - (a.model.publishedAt ?? 0));
}

/**
 * Promote social tool results into visible reference cards.
 * Connected-account lists stay in the trace; the last fetched/published post
 * is the card the user should see when asking about "my last post".
 */
export function collectSocialReferenceCards(calls: VisualCardToolCall[]): ManySocialReferenceCard[] {
  const { fromGet, posts, profiles } = collectPostAndProfileCards(calls);
  if (fromGet.length > 0) return newestPosts(fromGet).slice(0, 1);
  const ranked = newestPosts(posts);
  if (ranked.length > 0) return ranked.slice(0, 1);
  return profiles.slice(0, 1);
}

function compactNumber(value: number): string {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function postLabel(model: SocialEvidenceCardModel): string {
  const line = String(model.body || model.title || '').trim().split('\n')[0] || '';
  if (line && !looksLikeOpaqueId(line)) return line.slice(0, 42);
  const handle = model.author.handle || model.author.name;
  return handle && !looksLikeOpaqueId(handle) ? handle : model.provider;
}

function engagementRate(model: SocialEvidenceCardModel): number | null {
  const impressions = model.metrics?.impressions;
  if (impressions == null || impressions <= 0) return null;
  const engaged =
    (model.metrics?.likes ?? 0) + (model.metrics?.comments ?? 0) + (model.metrics?.saves ?? 0);
  return Math.round((engaged / impressions) * 1000) / 10;
}

export function collectSocialInsight(calls: VisualCardToolCall[]): ManySocialInsight | null {
  const { fromGet, posts } = collectPostAndProfileCards(calls);
  const ranked = newestPosts(fromGet.length > 0 ? [...fromGet, ...posts] : posts);
  const focus = ranked[0];
  if (!focus) return null;

  const kpis: ManySocialInsightKpi[] = [];
  const metrics = focus.model.metrics;
  if (metrics?.impressions != null) {
    kpis.push({ label: 'impressions', value: compactNumber(metrics.impressions) });
  }
  if (metrics?.likes != null) kpis.push({ label: 'likes', value: compactNumber(metrics.likes) });
  if (metrics?.comments != null) kpis.push({ label: 'comments', value: compactNumber(metrics.comments) });
  if (metrics?.saves != null) kpis.push({ label: 'saves', value: compactNumber(metrics.saves) });
  if (metrics?.shares != null) kpis.push({ label: 'shares', value: compactNumber(metrics.shares) });
  const rate = engagementRate(focus.model);
  if (rate != null) kpis.push({ label: 'engagement', value: `${rate}%` });

  const mixParts: Array<{ label: ManySocialInsightMix['label']; value: number }> = [
    { label: 'likes', value: metrics?.likes ?? 0 },
    { label: 'comments', value: metrics?.comments ?? 0 },
    { label: 'saves', value: metrics?.saves ?? 0 },
  ];
  const mixTotal = mixParts.reduce((sum, part) => sum + part.value, 0);
  const mix: ManySocialInsightMix[] =
    mixTotal > 0
      ? mixParts
          .filter((part) => part.value > 0)
          .map((part) => ({ label: part.label, percent: Math.round((part.value / mixTotal) * 100) }))
      : [];

  const comparison = ranked.slice(0, MAX_COMPARISON_POSTS).map((card) => ({
    label: postLabel(card.model),
    impressions: card.model.metrics?.impressions ?? 0,
    likes: card.model.metrics?.likes ?? 0,
  }));

  if (kpis.length === 0 && comparison.every((row) => row.impressions === 0 && row.likes === 0)) {
    return null;
  }

  return {
    title: postLabel(focus.model),
    handle: focus.model.author.handle ?? null,
    authorName: focus.model.author.name,
    avatarUrl: focus.model.author.avatarUrl ?? null,
    kpis,
    mix,
    comparison,
    topics: (focus.model.topics ?? []).filter((topic) => topic && !looksLikeOpaqueId(topic)).slice(0, 6),
  };
}

export function asRenderableArtifact(value: Record<string, unknown>): AnyArtifact | null {
  const type = value.type;
  if (typeof type !== 'string' || !KNOWN_ARTIFACT_TYPES.has(type)) return null;
  return value as AnyArtifact;
}

const OPAQUE_ID_PARENS = /\s*\((?:sp|sa|soc|scamp|sr)-[0-9a-f]{6,}\)/gi;

export function scrubOpaqueIdsFromProse(text: string): string {
  return text.replace(OPAQUE_ID_PARENS, '');
}

export function cleanVisualLabel(text: string): string {
  return text.replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();
}

export function isGenericVisualTitle(title: string): boolean {
  return /^(métrica|metric|imp|imps|impressions?|likes?|valor|value|ratio|table|chart|post|posts)$/i.test(
    cleanVisualLabel(title),
  );
}

function splitPipeRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /---/.test(line);
}

function looksNumeric(value: string): boolean {
  const trimmed = value.replace(/[%—–\s,]/g, '');
  if (!trimmed || trimmed === '-') return false;
  return /^[0-9]+([.][0-9]+)?$/.test(trimmed) || /^[0-9]+[kmb]?$/i.test(trimmed);
}

function parseGfmTable(block: string): { headers: string[]; rows: string[][] } | null {
  const lines = block.trim().split('\n').filter((line) => line.includes('|'));
  if (lines.length < 3) return null;
  const headers = splitPipeRow(lines[0]!);
  if (headers.length < 2 || !isSeparatorRow(lines[1]!)) return null;
  const rows = lines.slice(2).map(splitPipeRow).filter((row) => row.some((cell) => cell.length > 0));
  if (rows.length === 0) return null;
  return { headers, rows };
}

function tableToArtifact(table: { headers: string[]; rows: string[][] }): Record<string, unknown> {
  const headers = table.headers.map(cleanVisualLabel);
  const rows = table.rows.map((row) => row.map(cleanVisualLabel));
  const headerBlob = headers.join(' ').toLowerCase();
  const metricLike = /m[ée]trica|metric|valor|value|ratio/.test(headerBlob);
  const comparisonLike = /post|imp|likes|coment|saves/.test(headerBlob) && headers.length >= 3;
  if (metricLike) {
    return {
      type: 'dashboard',
      title: headers[0],
      kpis: rows.map((row) => ({
        label: row[0] || headers[0] || '',
        value: row[1] || '—',
        subtitle: row[2] && row[2] !== '—' ? row[2] : undefined,
      })),
    };
  }
  if (comparisonLike) {
    const numericCol = headers.findIndex(
      (_header, idx) => idx > 0 && rows.some((row) => looksNumeric(row[idx] ?? '')),
    );
    const col = numericCol > 0 ? numericCol : 1;
    return {
      type: 'chart',
      chart_type: 'bar',
      title: headers[0] || headers[col] || '',
      data: {
        labels: rows.map((row) => row[0] || ''),
        datasets: [
          {
            label: headers[col] || '',
            data: rows.map((row) => Number.parseFloat((row[col] ?? '0').replace(/[^\d.]/g, '')) || 0),
            color: 'var(--foreground)',
          },
        ],
      },
    };
  }
  return { type: 'table', title: headers[0] || '', headers, rows };
}

function liftTablesInText(text: string): ParsedArtifactSegment[] {
  const lines = text.split('\n');
  const segments: ParsedArtifactSegment[] = [];
  let cursor = 0;
  let i = 0;
  while (i < lines.length) {
    if (lines[i]?.includes('|') && i + 1 < lines.length && isSeparatorRow(lines[i + 1]!)) {
      let end = i + 2;
      while (end < lines.length && lines[end]?.includes('|')) end += 1;
      const block = lines.slice(i, end).join('\n');
      const table = parseGfmTable(block);
      if (table) {
        const before = lines.slice(cursor, i).join('\n');
        if (before.trim()) segments.push({ kind: 'text', content: before });
        const value = tableToArtifact(table);
        const artifactType = typeof value.type === 'string' ? value.type : 'table';
        segments.push({ kind: 'artifact', artifactType, value });
        cursor = end;
        i = end;
        continue;
      }
    }
    i += 1;
  }
  const tail = lines.slice(cursor).join('\n');
  if (tail.length > 0) segments.push({ kind: 'text', content: tail });
  return segments.length > 0 ? segments : [{ kind: 'text', content: text }];
}

export function parseAssistantVisualSegments(
  content: string,
  allowStreaming = false,
): ParsedArtifactSegment[] {
  const scrubbed = scrubOpaqueIdsFromProse(content);
  const base = parseArtifactBlocks(scrubbed, { allowStreaming });
  const expanded: ParsedArtifactSegment[] = [];
  for (const segment of base) {
    if (segment.kind !== 'text') {
      expanded.push(segment);
      continue;
    }
    for (const piece of liftTablesInText(segment.content)) expanded.push(piece);
  }
  return expanded.length > 0 ? expanded : [{ kind: 'text', content: '' }];
}
