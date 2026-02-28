/**
 * Persistence contracts for notes - compatible with future CRDT/collaboration layer.
 *
 * These types and structures are designed to avoid storage decisions that would
 * block multi-window/multi-device sync. When adding collaboration (e.g. Yjs/Hocuspocus):
 *
 * - content_json: ProseMirror JSON is the canonical format; CRDT layers typically
 *   convert to/from Y.Doc. Do not add format-specific fields that would conflict.
 * - contributor_ids: JSON array of participant IDs; already present for collab readiness.
 * - last_updated_by: Single editor ID; collab can extend to per-block attribution.
 * - note_links: Source/target/link_type supports mention extraction; collab can
 *   add real-time mention indexing without schema changes.
 *
 * Storage guidelines for future sync:
 * - Prefer append-only history (note_history) over in-place overwrites.
 * - Avoid denormalizing content into search indexes in ways that block merge.
 * - Keep IPC handlers stateless so they can be called from sync workers.
 */

/** Canonical note payload for persistence - used by IPC and future sync layer */
export interface NotePersistencePayload {
  id: string;
  slug_id: string;
  project_id: string;
  parent_note_id: string | null;
  title: string;
  icon: string | null;
  content_json: string | null;
  text_content: string | null;
  position: string;
  updated_at: number;
  last_updated_by: string | null;
  contributor_ids: string | null; // JSON array: ["user-1","user-2"]
}

/** History snapshot - append-only, supports restore and future CRDT replay */
export interface NoteHistorySnapshot {
  id: string;
  note_id: string;
  slug_id: string;
  title: string;
  icon: string | null;
  content_json: string | null;
  text_content: string | null;
  last_updated_by: string | null;
  contributor_ids: string | null;
  created_at: number;
}

/** Link between notes - supports backlinks and future real-time mention indexing */
export interface NoteLinkPayload {
  id: string;
  source_id: string;
  target_id: string;
  link_type: 'mention' | 'embed' | 'related';
  created_at: number;
}
