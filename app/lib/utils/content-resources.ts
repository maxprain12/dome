type NoteContentNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: NoteContentNode[];
};

/** Label stored on semantic_relations rows created from inline @ mentions. */
export const NOTE_MENTION_RELATION_LABEL = 'mention';

/** Dispatched after inline @ mentions are synced to semantic_relations. */
export const RESOURCE_RELATIONS_CHANGED = 'dome:resource-relations-changed';

export function notifyResourceRelationsChanged(sourceId: string, targetIds: string[]): void {
  window.dispatchEvent(
    new CustomEvent(RESOURCE_RELATIONS_CHANGED, { detail: { sourceId, targetIds } }),
  );
}

/**
 * Extract resource IDs from note content (ProseMirror JSON or legacy markdown).
 * Used for backlinks, export attachments, etc.
 */
export function extractResourceIdsFromContent(content: string | null | undefined): string[] {
  return extractResourceIdsFromNoteContent(content);
}

/** Walk legacy Tiptap JSON and collect linked resource IDs from mention / resourceLink nodes. */
function walkNoteContentForResourceIds(node: NoteContentNode, ids: Set<string>): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'mention' && typeof node.attrs?.id === 'string' && node.attrs.id) {
    ids.add(node.attrs.id);
  }
  if (node.type === 'resourceLink' && typeof node.attrs?.resourceId === 'string' && node.attrs.resourceId) {
    ids.add(node.attrs.resourceId);
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) walkNoteContentForResourceIds(child, ids);
  }
}

export function extractResourceIdsFromNoteContent(content: string | null | undefined): string[] {
  const ids = new Set<string>();
  if (!content || typeof content !== 'string') return [];

  const mdRe = /@\[[^\]]*\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(content)) !== null) ids.add(m[1]);

  const jsonResourceIdRe = /"resourceId"\s*:\s*"([^"]+)"/g;
  while ((m = jsonResourceIdRe.exec(content)) !== null) ids.add(m[1]);

  try {
    const parsed = JSON.parse(content) as NoteContentNode;
    if (parsed?.type === 'doc') walkNoteContentForResourceIds(parsed, ids);
  } catch {
    // legacy plain / markdown content
  }

  const mentionIdRe = /"type"\s*:\s*"mention"[^}]*"id"\s*:\s*"([^"]+)"/g;
  while ((m = mentionIdRe.exec(content)) !== null) ids.add(m[1]);

  return Array.from(ids);
}

/**
 * Sync semantic_relations for inline @ mentions in a saved note body.
 * Creates manual edges (label `mention`) and removes stale mention edges.
 */
export async function syncNoteMentionRelations(
  sourceId: string,
  serializedContent: string,
): Promise<string[]> {
  const semantic = window.electron?.db?.semantic;
  if (!semantic?.getGraph || !semantic.createManual || !semantic.delete) return [];

  const targetIds = new Set(extractResourceIdsFromNoteContent(serializedContent));
  targetIds.delete(sourceId);

  const gr = await semantic.getGraph(sourceId, 0);
  if (!gr.success || !gr.data?.edges) {
    return [...targetIds];
  }

  const outgoingMentionEdges = gr.data.edges.filter(
    (e) =>
      e.source === sourceId &&
      e.relation_type !== 'rejected' &&
      e.label === NOTE_MENTION_RELATION_LABEL,
  );

  const existingTargets = new Set(outgoingMentionEdges.map((e) => e.target));
  const removed = outgoingMentionEdges.filter((e) => !targetIds.has(e.target)).map((e) => e.target);
  const added = [...targetIds].filter((targetId) => !existingTargets.has(targetId));

  await Promise.all(
    outgoingMentionEdges
      .filter((e) => !targetIds.has(e.target))
      .map((e) => semantic.delete(e.id)),
  );

  await Promise.all(
    added.map((targetId) =>
      semantic.createManual({
        sourceId,
        targetId,
        label: NOTE_MENTION_RELATION_LABEL,
      }),
    ),
  );

  return [...targetIds];
}
