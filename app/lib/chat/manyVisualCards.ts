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
  label: 'impressions' | 'likes' | 'comments' | 'saves' | 'shares' | 'engagement' | 'followers' | 'posts' | 'following';
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
  source: 'post' | 'profile';
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

function compactCount(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return compactNumber(value);
}

export function collectSocialInsight(calls: VisualCardToolCall[]): ManySocialInsight | null {
  const { fromGet, posts, profiles } = collectPostAndProfileCards(calls);
  const ranked = newestPosts(fromGet.length > 0 ? [...fromGet, ...posts] : posts);
  const focus = ranked[0];
  if (focus) {
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
      return collectProfileInsight(profiles[0]?.model ?? null);
    }

    return {
      title: postLabel(focus.model),
      handle: focus.model.author.handle ?? null,
      authorName: focus.model.author.name,
      avatarUrl: focus.model.author.avatarUrl ?? null,
      source: 'post',
      kpis,
      mix,
      comparison,
      topics: (focus.model.topics ?? []).filter((topic) => topic && !looksLikeOpaqueId(topic)).slice(0, 6),
    };
  }
  return collectProfileInsight(profiles[0]?.model ?? null);
}

function collectProfileInsight(model: SocialEvidenceCardModel | null): ManySocialInsight | null {
  if (!model) return null;
  const kpis: ManySocialInsightKpi[] = [];
  const followers = compactCount(model.followers);
  if (followers) kpis.push({ label: 'followers', value: followers });
  const posts = compactCount(model.postsCount);
  if (posts) kpis.push({ label: 'posts', value: posts });
  const following = compactCount(model.following);
  if (following) kpis.push({ label: 'following', value: following });
  const comparison: ManySocialInsightCompare[] = [];
  if (model.followers != null) comparison.push({ label: 'Followers', impressions: model.followers, likes: 0 });
  if (model.following != null) comparison.push({ label: 'Following', impressions: model.following, likes: 0 });
  if (model.postsCount != null) comparison.push({ label: 'Posts', impressions: model.postsCount, likes: 0 });
  if (kpis.length === 0 && comparison.length < 2) return null;
  return {
    title: model.author.name,
    handle: model.author.handle ?? null,
    authorName: model.author.name,
    avatarUrl: model.author.avatarUrl ?? null,
    source: 'profile',
    kpis,
    mix: [],
    comparison,
    topics: (model.topics ?? []).filter((topic) => topic && !looksLikeOpaqueId(topic)).slice(0, 6),
  };
}

export function asRenderableArtifact(value: Record<string, unknown>): AnyArtifact | null {
  const type = value.type;
  if (typeof type !== 'string' || !KNOWN_ARTIFACT_TYPES.has(type)) return null;
  return value as AnyArtifact;
}

export type ManyWorkKind = 'note' | 'resource' | 'event' | 'events' | 'flashcards';

export type ManyWorkItem = {
  title: string;
  detail?: string;
};

export type ManyWorkCard = {
  key: string;
  kind: ManyWorkKind;
  kicker: ManyWorkKind;
  title: string;
  detail?: string;
  count?: number;
  items?: ManyWorkItem[];
};

const RESOURCE_TOOLS = new Set(['resource_create', 'resource_update']);
const CALENDAR_WRITE_TOOLS = new Set([
  'calendar_create_event',
  'calendar_update_event',
  'calendar_create',
  'calendar_update',
]);
const CALENDAR_LIST_TOOLS = new Set(['calendar_list_events', 'calendar_get_upcoming']);

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function humanTitle(value: unknown, max = 120): string | null {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title || looksLikeOpaqueId(title)) return null;
  return title.slice(0, max);
}

function parseStamp(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return null;
}

export function formatVisualWhen(start: unknown, end: unknown, allDay: boolean): string | undefined {
  const startDate = parseStamp(start);
  if (!startDate) return undefined;
  const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(startDate);
  if (allDay) return day;
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const startTime = timeFmt.format(startDate);
  const endDate = parseStamp(end);
  if (!endDate) return `${day} · ${startTime}`;
  return `${day} · ${startTime}–${timeFmt.format(endDate)}`;
}

function eventDetail(rec: Record<string, unknown>): string | undefined {
  const when = formatVisualWhen(
    rec.start_at_iso ?? rec.startAt ?? rec.start_at,
    rec.end_at_iso ?? rec.endAt ?? rec.end_at,
    rec.all_day === true || rec.allDay === true,
  );
  const location = humanTitle(rec.location, 80);
  return [when, location].filter(Boolean).join(' · ') || undefined;
}

function workFromEvent(rec: Record<string, unknown> | null, index: number): ManyWorkCard | null {
  if (!rec) return null;
  const title = humanTitle(rec.title, 80);
  if (!title) return null;
  return {
    key: `event-${title}-${index}`,
    kind: 'event',
    kicker: 'event',
    title,
    detail: eventDetail(rec),
  };
}

function workFromResource(obj: Record<string, unknown>, index: number): ManyWorkCard | null {
  const rec = asObject(obj.resource) ?? obj;
  const title = humanTitle(rec.title, 120);
  if (!title) return null;
  const type = String(rec.type || 'note').toLowerCase();
  const excerpt = humanTitle(rec.content, 280) ?? undefined;
  return {
    key: `resource-${title}-${index}`,
    kind: type === 'note' ? 'note' : 'resource',
    kicker: type === 'note' ? 'note' : 'resource',
    title,
    detail: excerpt,
  };
}

export function collectWorkCards(calls: VisualCardToolCall[]): ManyWorkCard[] {
  const cards: ManyWorkCard[] = [];
  calls.forEach((call, index) => {
    if (call.status !== 'success') return;
    const name = call.name.toLowerCase();
    const obj = unwrapToolResultObject(call.result);
    if (!obj) return;
    if (RESOURCE_TOOLS.has(name)) {
      const card = workFromResource(obj, index);
      if (card) cards.push(card);
      return;
    }
    if (CALENDAR_WRITE_TOOLS.has(name)) {
      const card = workFromEvent(asObject(obj.event) ?? obj, index);
      if (card) cards.push(card);
      return;
    }
    if (CALENDAR_LIST_TOOLS.has(name)) {
      const rows = Array.isArray(obj.events) ? obj.events : Array.isArray(obj.items) ? obj.items : [];
      const items = rows
        .map((row) => workFromEvent(asObject(row), index))
        .filter((row): row is ManyWorkCard => row != null)
        .slice(0, 8)
        .map((row) => ({ title: row.title, detail: row.detail }));
      if (items.length === 0) return;
      cards.push({
        key: `agenda-${index}`,
        kind: 'events',
        kicker: 'events',
        title: '',
        items,
      });
      return;
    }
    if (name === 'flashcard_create') {
      const deck = asObject(obj.deck) ?? obj;
      const title = humanTitle(deck.title, 120);
      if (!title) return;
      const count = typeof deck.card_count === 'number' ? deck.card_count : null;
      cards.push({
        key: `flashcards-${title}-${index}`,
        kind: 'flashcards',
        kicker: 'flashcards',
        title,
        count: typeof count === 'number' ? count : undefined,
      });
    }
  });
  return cards;
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

const LABELED_LIST_ITEM =
  /^\s*(?:[-*]|\d+[.)])\s+(?:\*\*)?([^:*\n]+?)(?:\*\*)?:\s*(.+)\s*$/;
const PROFILE_FIELD_LABEL =
  /^(handle|usuario|user|bio|biograf[ií]a|categor[ií]a(?: inferida)?|category|nombre|name)$/i;
const METRIC_FIELD_LABEL =
  /(followers?|seguidores|following|seguidos|posts?|publicaciones|impresiones|impressions?|likes?|me gusta|comments?|comentarios|saves?|guardados|shares?|compartidos|engagement|alcance|reach|views?|vistas)/i;
const VISUAL_HEADING =
  /^(?:#{1,3}\s+)?(?:[📌📊🎯✅🔹]\s*)?(resumen(?: del perfil)?|profile summary|overview|m[eé]tricas(?: clave)?|key metrics|stats|estad[ií]sticas)\s*$/iu;

function parseHumanNumber(raw: string): number | null {
  let text = cleanVisualLabel(raw).replace(/["“”]/g, '');
  const cut = text.indexOf('(');
  if (cut >= 0) text = text.slice(0, cut);
  text = text.replace(/%/g, '').trim();
  if (!text) return null;
  const mil = text.match(/^([\d.,\s]+)\s*(mil|k)\b/i);
  if (mil?.[1]) {
    const n = parseGroupedNumber(mil[1]);
    return n == null ? null : n * 1000;
  }
  const mill = text.match(/^([\d.,\s]+)\s*(mill\.?|m)\b/i);
  if (mill?.[1]) {
    const n = parseGroupedNumber(mill[1]);
    return n == null ? null : n * 1_000_000;
  }
  return parseGroupedNumber(text);
}

function parseGroupedNumber(raw: string): number | null {
  const text = raw.replace(/\s/g, '');
  if (!text) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ''));
  if (/^\d{1,3}(,\d{3})+$/.test(text)) return Number(text.replace(/,/g, ''));
  if (/^\d+[.,]\d{1,2}$/.test(text)) return Number(text.replace(',', '.'));
  if (/^\d+$/.test(text)) return Number(text);
  return null;
}

function parseLabeledListItem(line: string): { label: string; value: string } | null {
  const match = line.match(LABELED_LIST_ITEM);
  if (!match?.[1] || match[2] == null) return null;
  const label = cleanVisualLabel(match[1]);
  const value = cleanVisualLabel(match[2]);
  if (!label || !value) return null;
  return { label, value };
}

function takeLabeledList(
  lines: string[],
  start: number,
): { items: Array<{ label: string; value: string }>; end: number } | null {
  const items: Array<{ label: string; value: string }> = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      const next = parseLabeledListItem(lines[index + 1] ?? '');
      if (next) {
        index += 1;
        continue;
      }
      break;
    }
    const item = parseLabeledListItem(line);
    if (!item) break;
    items.push(item);
    index += 1;
  }
  if (items.length < 2) return null;
  return { items, end: index };
}

function labeledListKind(
  items: Array<{ label: string; value: string }>,
): 'metrics' | 'profile-copy' | null {
  const metrics = items.filter(
    (item) => METRIC_FIELD_LABEL.test(item.label) && parseHumanNumber(item.value) != null,
  );
  const profile = items.filter((item) => PROFILE_FIELD_LABEL.test(item.label));
  if (metrics.length >= 2) return 'metrics';
  if (profile.length >= 2) return 'profile-copy';
  return null;
}

function isVisualHeading(line: string): boolean {
  return VISUAL_HEADING.test(cleanVisualLabel(line));
}

function headingTitle(line: string): string {
  return cleanVisualLabel(line)
    .replace(/^#+\s*/, '')
    .replace(/^[📌📊🎯✅🔹]\s*/, '');
}

function listToArtifacts(
  items: Array<{ label: string; value: string }>,
  title: string,
): ParsedArtifactSegment[] {
  const kpis: Array<{ id: string; label: string; value: string }> = [];
  const labels: string[] = [];
  const data: number[] = [];
  const sections: Array<{ id: string; title: string; body: string }> = [];
  for (const item of items) {
    if (PROFILE_FIELD_LABEL.test(item.label)) continue;
    const numeric = parseHumanNumber(item.value);
    if (numeric != null && METRIC_FIELD_LABEL.test(item.label)) {
      kpis.push({ id: item.label, label: item.label, value: compactNumber(numeric) });
      labels.push(item.label);
      data.push(numeric);
      continue;
    }
    if (item.value.length > 0 && item.value.length < 180) {
      sections.push({ id: item.label, title: item.label, body: item.value });
    }
  }
  const segments: ParsedArtifactSegment[] = [];
  if (kpis.length >= 2) {
    segments.push({
      kind: 'artifact',
      artifactType: 'dashboard',
      value: { type: 'dashboard', title, kpis, sections },
    });
  }
  if (data.length >= 2) {
    segments.push({
      kind: 'artifact',
      artifactType: 'chart',
      value: {
        type: 'chart',
        chart_type: 'bar',
        title: '',
        data: {
          labels,
          datasets: [{ label: '', data, color: 'var(--foreground)' }],
        },
      },
    });
  }
  return segments;
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

function liftVisualsInText(
  text: string,
  options?: { suppressProfileMetrics?: boolean },
): ParsedArtifactSegment[] {
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

    const listed = takeLabeledList(lines, i);
    if (listed) {
      const kind = labeledListKind(listed.items);
      if (kind) {
        let blockStart = i;
        let title = '';
        let heading = i - 1;
        while (heading >= cursor && !(lines[heading] ?? '').trim()) heading -= 1;
        if (heading >= cursor && isVisualHeading(lines[heading] ?? '')) {
          title = headingTitle(lines[heading] ?? '');
          blockStart = heading;
        }
        const before = lines.slice(cursor, blockStart).join('\n');
        if (before.trim()) segments.push({ kind: 'text', content: before });
        if (kind === 'metrics' && !options?.suppressProfileMetrics) {
          for (const piece of listToArtifacts(listed.items, title)) segments.push(piece);
        }
        cursor = listed.end;
        i = listed.end;
        continue;
      }
    }
    i += 1;
  }
  const tail = lines.slice(cursor).join('\n');
  if (tail.length > 0) segments.push({ kind: 'text', content: tail });
  if (segments.length > 0) return segments;
  if (cursor > 0) return [{ kind: 'text', content: '' }];
  return [{ kind: 'text', content: text }];
}

export function parseAssistantVisualSegments(
  content: string,
  allowStreaming = false,
  options?: { suppressProfileMetrics?: boolean },
): ParsedArtifactSegment[] {
  const scrubbed = scrubOpaqueIdsFromProse(content);
  const base = parseArtifactBlocks(scrubbed, { allowStreaming });
  const expanded: ParsedArtifactSegment[] = [];
  for (const segment of base) {
    if (segment.kind !== 'text') {
      expanded.push(segment);
      continue;
    }
    for (const piece of liftVisualsInText(segment.content, options)) expanded.push(piece);
  }
  return expanded.length > 0 ? expanded : [{ kind: 'text', content: '' }];
}
