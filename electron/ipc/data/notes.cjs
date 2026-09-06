/* eslint-disable no-console */
/**
 * Notes IPC — Markdown vault storage.
 * The editor sends Markdown; the vault file is the portable source of truth.
 * Writing it also refreshes the SQLite content and search caches.
 */
const { z } = require('zod');
const vaultStore = require('../../storage/vault-store.cjs');
const semanticIndexScheduler = require('../../storage/semantic-index-scheduler.cjs');

const WriteMirrorSchema = z.object({
  id: z.string().min(1),
  markdown: z.string(),
});

const ReadMirrorSchema = z.object({
  id: z.string().min(1),
});

function register({ ipcMain, windowManager, database, fileStorage }) {
  /** Write/update a note's Markdown mirror. */
  ipcMain.handle('notes:writeMirror', (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = WriteMirrorSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const result = vaultStore.writeNoteMarkdown(parsed.data, { database, fileStorage });
    if (result.success) {
      semanticIndexScheduler.init(database);
      semanticIndexScheduler.scheduleSemanticReindex(parsed.data.id);
      windowManager.broadcast('resource:updated', {
        id: parsed.data.id,
        updates: { content: parsed.data.markdown, vault_path: result.vaultPath },
      });
    }
    return result;
  });

  /** Read a note's Markdown mirror (frontmatter stripped). */
  ipcMain.handle('notes:readMirror', (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = ReadMirrorSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    return vaultStore.readNoteMarkdown(parsed.data, { database, fileStorage });
  });

  /** Absolute path of the vault root (for "reveal in Finder/Explorer" UIs). */
  ipcMain.handle('notes:vaultDir', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    return { success: true, data: vaultStore.getVaultDir(fileStorage) };
  });
}

module.exports = { register };
