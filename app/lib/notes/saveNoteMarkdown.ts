import { ingestLocalMarkdownImages } from '@/lib/plugins/media';

interface NoteDraft {
  id: string;
  title: string;
  markdown: string;
  pluginId: string | null;
}

const pending = new Map<string, Promise<unknown>>();

/** Serialize writes per note, including the final snapshot when its editor closes. */
export function saveNoteMarkdown(draft: NoteDraft) {
  const previous = pending.get(draft.id) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const markdown = draft.pluginId
      ? (await ingestLocalMarkdownImages(draft.pluginId, draft.id, draft.markdown)).markdown
      : draft.markdown;
    const updatedAt = Date.now();
    // The title determines the vault filename and frontmatter.
    const updated = await window.electron.db.resources.update({ id: draft.id, title: draft.title, updated_at: updatedAt });
    if (!updated.success) throw new Error(updated.error || 'save failed');
    const mirror = await window.electron.notes.writeMirror({ id: draft.id, markdown });
    if (!mirror.success) throw new Error(mirror.error || 'save failed');
    return { markdown, updatedAt, vaultPath: mirror.vaultPath };
  });
  pending.set(draft.id, operation);
  const release = () => { if (pending.get(draft.id) === operation) pending.delete(draft.id); };
  operation.then(release, release);
  return operation;
}
