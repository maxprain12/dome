/**
 * Export utilities for Docmost-like note export.
 * Handles relative paths, internal links, and mention replacement.
 */

/**
 * Compute relative path from one file path to another.
 * e.g. from "Root/Child" to "Root/Sibling" -> "../Sibling"
 */
export function computeRelativePath(fromPath: string, toPath: string): string {
  const fromParts = fromPath.replace(/\/$/, '').split('/').filter(Boolean);
  const toParts = toPath.replace(/\/$/, '').split('/').filter(Boolean);

  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i++;
  }

  const up = fromParts.length - i;
  const down = toParts.slice(i);
  const segments = [...Array(up).fill('..'), ...down];
  return segments.join('/') || '.';
}

/**
 * Replace resource mentions with relative links when the target is a note in the export tree.
 * Markdown: @[label](noteId) -> [label](relativePath)
 * HTML: <span data-type="resource-mention" data-resource-id="noteId"> -> <a href="relativePath">label</a>
 */
export function replaceMentionsWithRelativePaths(
  content: string,
  noteIdToPath: Record<string, string>,
  currentFilePath: string,
  format: 'markdown' | 'html'
): string {
  if (!content || Object.keys(noteIdToPath).length === 0) return content;

  let out = content;

  if (format === 'markdown') {
    // @[label](noteId) -> [label](relativePath)
    out = out.replace(/@\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label, id) => {
      const targetPath = noteIdToPath[id];
      if (!targetPath) return _m;
      const rel = computeRelativePath(currentFilePath, targetPath);
      return `[${label || 'Note'}](${rel})`;
    });
  } else {
    // HTML: replace resource-mention span with anchor when target is a note in tree
    out = out.replace(
      /<span\s+data-type="resource-mention"\s+data-resource-id="([^"]+)"[^>]*>([^<]*)<\/span>/gi,
      (_m, id, label) => {
        const targetPath = noteIdToPath[id];
        if (!targetPath) return _m;
        const rel = computeRelativePath(currentFilePath, targetPath);
        return `<a href="${rel.replace(/"/g, '&quot;')}">${label || 'Note'}</a>`;
      }
    );
  }

  return out;
}

/**
 * Build a map of noteId -> file path within the export ZIP.
 * Uses the same getSafeTitle as the file builder to ensure path consistency.
 * Paths are like "RootTitle/RootTitle.md" or "RootTitle/Child/Child.md".
 */
export function buildNoteIdToPath(
  notes: { id: string; title: string; parent_note_id: string | null }[],
  rootNote: { id: string; title: string; parent_note_id: string | null },
  ext: string,
  getSafeTitle: (title: string, parentKey: string) => string
): Record<string, string> {
  const map: Record<string, string> = {};

  const addNote = (
    note: { id: string; title: string; parent_note_id: string | null },
    parentKey: string,
    prefix: string
  ) => {
    const safe = getSafeTitle(note.title, parentKey);
    const subChildren = notes.filter((c) => c.parent_note_id === note.id);
    if (subChildren.length > 0) {
      const subPrefix = prefix ? `${prefix}/${safe}` : safe;
      map[note.id] = `${subPrefix}/${safe}${ext}`;
      for (const c of subChildren) addNote(c, note.id, subPrefix);
    } else {
      map[note.id] = prefix ? `${prefix}/${safe}${ext}` : `${safe}${ext}`;
    }
  };

  const rootChildren = notes.filter((n) => n.parent_note_id === rootNote.id);
  const rootTitle = getSafeTitle(rootNote.title, 'root');
  if (rootChildren.length > 0) {
    map[rootNote.id] = `${rootTitle}/${rootTitle}${ext}`;
    for (const c of rootChildren) addNote(c, rootNote.id, rootTitle);
  } else {
    map[rootNote.id] = `${rootTitle}${ext}`;
  }

  return map;
}
