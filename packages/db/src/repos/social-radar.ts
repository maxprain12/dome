import { and, desc, eq } from 'drizzle-orm';
import type { DomeDb } from '../client.js';
import {
  socialInterestProfile,
  socialRadarClusterCache,
  socialReferenceMetrics,
  socialTrendAttributions,
  socialTrendEvents,
} from '../schema/social-radar.js';

export function insertReferenceMetric(
  db: DomeDb,
  row: {
    id: string;
    referenceId: string;
    capturedAt: number;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    impressions: number | null;
    saves: number | null;
    metricsJson: string | null;
    createdAt: number;
  },
): void {
  db.insert(socialReferenceMetrics).values(row).run();
}

export function listReferenceMetrics(db: DomeDb, referenceId: string) {
  return db
    .select()
    .from(socialReferenceMetrics)
    .where(eq(socialReferenceMetrics.referenceId, referenceId))
    .orderBy(desc(socialReferenceMetrics.capturedAt))
    .all();
}

export function upsertInterestWeight(
  db: DomeDb,
  row: {
    id: string;
    projectId: string;
    topicKey: string;
    weight: number;
    evidenceJson: string | null;
    updatedAt: number;
  },
): void {
  const existing = db
    .select()
    .from(socialInterestProfile)
    .where(
      and(
        eq(socialInterestProfile.projectId, row.projectId),
        eq(socialInterestProfile.topicKey, row.topicKey),
      ),
    )
    .get();
  if (existing) {
    db.update(socialInterestProfile)
      .set({
        weight: row.weight,
        evidenceJson: row.evidenceJson,
        updatedAt: row.updatedAt,
      })
      .where(eq(socialInterestProfile.id, existing.id))
      .run();
    return;
  }
  db.insert(socialInterestProfile).values(row).run();
}

export function listInterestProfile(db: DomeDb, projectId: string) {
  return db
    .select()
    .from(socialInterestProfile)
    .where(eq(socialInterestProfile.projectId, projectId))
    .all();
}

export function insertTrendEvent(
  db: DomeDb,
  row: {
    id: string;
    projectId: string;
    clusterId: string | null;
    eventType: string;
    payloadJson: string | null;
    createdAt: number;
  },
): void {
  db.insert(socialTrendEvents).values(row).run();
}

export function listTrendEvents(db: DomeDb, projectId: string, limit = 200) {
  return db
    .select()
    .from(socialTrendEvents)
    .where(eq(socialTrendEvents.projectId, projectId))
    .orderBy(desc(socialTrendEvents.createdAt))
    .limit(limit)
    .all();
}

export function upsertClusterCache(
  db: DomeDb,
  row: {
    id: string;
    projectId: string;
    feed: string;
    topicKey: string;
    payloadJson: string;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
  },
): void {
  db.insert(socialRadarClusterCache)
    .values(row)
    .onConflictDoUpdate({
      target: socialRadarClusterCache.id,
      set: {
        payloadJson: row.payloadJson,
        expiresAt: row.expiresAt,
        updatedAt: row.updatedAt,
        feed: row.feed,
        topicKey: row.topicKey,
      },
    })
    .run();
}

export function insertAttribution(
  db: DomeDb,
  row: {
    id: string;
    projectId: string;
    clusterId: string;
    draftId: string | null;
    postId: string | null;
    createdAt: number;
    updatedAt: number;
  },
): void {
  db.insert(socialTrendAttributions).values(row).run();
}
