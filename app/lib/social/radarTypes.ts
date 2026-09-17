import type { SocialProvider } from '@/components/social/socialTypes';

export type RadarFeedId = 'forYou' | 'emerging' | 'popular' | 'radar';
export type RadarPhase = 'emerging' | 'accelerating' | 'peak' | 'cooling';
export type RadarSource = 'local' | 'cloud' | 'hybrid';

export type RadarAffinityBand = 'high' | 'mid' | 'low';

export type RadarEvidence = {
  id: string;
  origin?: string;
  provider?: SocialProvider | string | null;
  title: string;
  url?: string | null;
  author?: { name?: string | null; handle?: string | null; avatarUrl?: string | null };
  format?: string | null;
  media?: Array<{ type?: 'image' | 'video' | 'reel'; url?: string; thumbnailUrl?: string }>;
  metrics?: Record<string, number | null> | null;
  publishedAt?: number | null;
};

export type RadarCluster = {
  id: string;
  topicKey: string;
  title: string;
  summary?: string | null;
  whyNow?: string | null;
  whyForYou?: string | null;
  affinityBand?: RadarAffinityBand;
  phase: RadarPhase;
  confidence: number;
  saturation: number;
  trendScore: number;
  affinity: number;
  forYouScore: number;
  burst: number;
  velocity: number;
  breadth: number;
  quality?: number;
  freshness: number;
  networks: string[];
  authorCount: number;
  postCount: number;
  evidence: RadarEvidence[];
  contentPatterns?: string[];
  source: RadarSource;
  nativeTrend?: boolean;
  topics?: string[];
  limitations?: string[];
  creativeBrief?: { angles: string[]; structure: string[] };
};

export type RadarSnapshot = {
  windowDays: number;
  generatedAt: number;
  ownPostCount: number;
  referenceCount: number;
  signals: Array<{
    id: string;
    theme: string;
    labelKind: string;
    ownCount: number;
    referenceCount: number;
    score: number;
    confidence: number;
    provenance: string;
    sources: string[];
    providers?: SocialProvider[];
    windowDays: number;
  }>;
  formats: Array<{ format: string; count: number }>;
  creatives?: Array<{
    origin: 'own' | 'reference';
    provider: SocialProvider | null;
    format: string | null;
    isVideo: boolean;
    title: string | null;
    url: string | null;
    author: { name?: string | null; handle?: string | null; avatarUrl?: string | null };
    media?: Array<{ type?: 'image' | 'video' | 'reel'; url?: string; thumbnailUrl?: string }>;
    metrics?: Record<string, number | null> | null;
    topics?: string[];
    publishedAt?: number | null;
    engagementScore?: number | null;
  }>;
  mix?: { video: number; carousel: number; post: number };
  recommendedFormat?: 'reel' | 'carousel' | 'post' | null;
  limitations: string[];
  capabilities?: { x?: string; instagram?: string; linkedin?: string };
  budget?: { provider?: string; remaining?: number; exhausted?: boolean; reason?: string | null } | null;
  cloudStatus?: string | null;
  feeds?: Record<RadarFeedId, RadarCluster[]>;
};

export function radarClusterLabel(cluster: Pick<RadarCluster, 'title' | 'topicKey'> | null, fallback: string): string {
  const title = String(cluster?.title || '').trim();
  if (title && !looksLikeRadarId(title)) return title;
  const topic = String(cluster?.topicKey || '').trim();
  if (topic && topic !== 'untagged' && !looksLikeRadarId(topic)) {
    return topic.startsWith('#') ? topic : `#${topic}`;
  }
  return fallback;
}

export function radarFitBand(cluster: Pick<RadarCluster, 'affinity' | 'affinityBand'>): RadarAffinityBand {
  if (cluster.affinityBand === 'high' || cluster.affinityBand === 'mid' || cluster.affinityBand === 'low') {
    return cluster.affinityBand;
  }
  if (cluster.affinity >= 0.45) return 'high';
  if (cluster.affinity >= 0.2) return 'mid';
  return 'low';
}

function looksLikeRadarId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    || /^(sr|sp|radar|cluster)-/i.test(value)
  );
}
