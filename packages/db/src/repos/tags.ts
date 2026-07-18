import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { DomeDb } from '../client.js';
import { resourceTags, resources, tags } from '../schema/core.js';

export type TagRow = typeof tags.$inferSelect;
export type TagWithCount = TagRow & { resourceCount: number };

export function getTagById(db: DomeDb, id: string): TagRow | undefined {
  return db.select().from(tags).where(eq(tags.id, id)).get();
}

export function findTagByNameInsensitive(db: DomeDb, name: string): TagRow | undefined {
  return db
    .select()
    .from(tags)
    .where(sql`${tags.name} = ${name} COLLATE NOCASE`)
    .limit(1)
    .get();
}

export function insertTag(
  db: DomeDb,
  row: { id: string; name: string; color: string | null; createdAt: number },
): void {
  db.insert(tags).values(row).run();
}

export function getTagsByResource(db: DomeDb, resourceId: string): TagRow[] {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
    })
    .from(tags)
    .innerJoin(resourceTags, eq(resourceTags.tagId, tags.id))
    .where(eq(resourceTags.resourceId, resourceId))
    .all();
}

export function getAllTagsWithCount(db: DomeDb): TagWithCount[] {
  const rows = db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
      resourceCount: count(resourceTags.resourceId),
    })
    .from(tags)
    .leftJoin(resourceTags, eq(resourceTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(desc(count(resourceTags.resourceId)), tags.name)
    .all();
  return rows.map((r) => ({ ...r, resourceCount: Number(r.resourceCount) }));
}

export function getAllTagsWithCountByProject(db: DomeDb, projectId: string): TagWithCount[] {
  const rows = db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
      resourceCount: count(resourceTags.resourceId),
    })
    .from(tags)
    .innerJoin(resourceTags, eq(resourceTags.tagId, tags.id))
    .innerJoin(resources, eq(resources.id, resourceTags.resourceId))
    .where(eq(resources.projectId, projectId))
    .groupBy(tags.id)
    .orderBy(desc(count(resourceTags.resourceId)), tags.name)
    .all();
  return rows.map((r) => ({ ...r, resourceCount: Number(r.resourceCount) }));
}

export function attachTagToResource(db: DomeDb, resourceId: string, tagId: string): void {
  db.insert(resourceTags).values({ resourceId, tagId }).onConflictDoNothing().run();
}

export function detachTagFromResource(db: DomeDb, resourceId: string, tagId: string): void {
  db
    .delete(resourceTags)
    .where(and(eq(resourceTags.resourceId, resourceId), eq(resourceTags.tagId, tagId)))
    .run();
}

export function getResourcesByTag(db: DomeDb, tagId: string) {
  return db
    .select()
    .from(resources)
    .innerJoin(resourceTags, eq(resources.id, resourceTags.resourceId))
    .where(eq(resourceTags.tagId, tagId))
    .orderBy(desc(resources.updatedAt))
    .all()
    .map((r) => r.resources);
}

export function getResourcesByTagInProject(db: DomeDb, tagId: string, projectId: string) {
  return db
    .select()
    .from(resources)
    .innerJoin(resourceTags, eq(resources.id, resourceTags.resourceId))
    .where(and(eq(resourceTags.tagId, tagId), eq(resources.projectId, projectId)))
    .orderBy(desc(resources.updatedAt))
    .all()
    .map((r) => r.resources);
}
