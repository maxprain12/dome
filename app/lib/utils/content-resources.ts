/**
 * Extract resource IDs from content (ProseMirror JSON or markdown).
 * Used for backlinks, export attachments, etc.
 */
export function extractResourceIdsFromContent(content: string | null | undefined): string[] {
  const ids = new Set<string>();
  if (!content || typeof content !== 'string') return [];

  // Markdown-style @[label](id)
  const mdRe = /@\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = mdRe.exec(content)) !== null) ids.add(m[1]);

  // ProseMirror JSON: "resourceId":"..."
  const jsonRe = /"resourceId"\s*:\s*"([^"]+)"/g;
  while ((m = jsonRe.exec(content)) !== null) ids.add(m[1]);

  return Array.from(ids);
}
