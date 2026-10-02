type NoteContentNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: NoteContentNode[];
};

/**
 * Extract resource IDs from note content (ProseMirror JSON or legacy markdown).
 * Used for resource navigation and exporting attachments.
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
