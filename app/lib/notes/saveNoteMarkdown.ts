import { ingestLocalMarkdownImages } from '@/lib/plugins/media';

interface NoteDraft {
  id: string;
  title: string;
  markdown: string;
  expectedMarkdown: string;
  pluginId: string | null;
}

type SaveResult = { markdown: string; updatedAt: number; vaultPath?: string };
const pending = new Map<string, Promise<SaveResult>>();

/** Serialize writes per note, including the final snapshot when its editor closes. */
export function saveNoteMarkdown(draft: NoteDraft) {
  const previous = pending.get(draft.id);
  const operation = previous?.catch(() => undefined).then(async (prior) => {
    return save(prior ? `${prior.markdown}\n` : draft.expectedMarkdown);
  }) ?? save(draft.expectedMarkdown);
  async function save(expectedMarkdown: string): Promise<SaveResult> {
    const markdown = draft.pluginId
      ? (await ingestLocalMarkdownImages(draft.pluginId, draft.id, draft.markdown)).markdown
      : draft.markdown;
    const current = await window.electron.notes.readMirror({ id: draft.id });
    if (!current.success || typeof current.markdown !== 'string') throw new Error(current.error || 'save failed');
    if (current.markdown !== expectedMarkdown) throw new Error('NOTE_CONFLICT');
    const updatedAt = Date.now();
    // The title determines the vault filename and frontmatter.
    const updated = await window.electron.db.resources.update({ id: draft.id, title: draft.title, updated_at: updatedAt });
    if (!updated.success) throw new Error(updated.error || 'save failed');
    const mirror = await window.electron.notes.writeMirror({ id: draft.id, markdown, expectedMarkdown });
    if (!mirror.success) throw new Error(mirror.error || 'save failed');
    return { markdown, updatedAt, vaultPath: mirror.vaultPath };
  }
  pending.set(draft.id, operation);
  const release = () => { if (pending.get(draft.id) === operation) pending.delete(draft.id); };
  operation.then(release, release);
  return operation;
}
