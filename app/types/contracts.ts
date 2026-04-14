/**
 * Persistence contracts for future collab / sync layers.
 * Kept minimal until multi-user editing ships.
 */
export interface NotePersistencePayload {
  version: number;
  content: string;
  updatedAt: number;
}

export interface NoteHistorySnapshot {
  id: string;
  entries: unknown[];
}

export interface NoteLinkPayload {
  sourceId: string;
  targetId: string;
}
