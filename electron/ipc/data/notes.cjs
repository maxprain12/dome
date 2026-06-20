/* eslint-disable no-console */
/**
 * Notes IPC - Markdown vault mirror (Phase 1).
 *
 * The renderer owns Tiptap -> Dome-flavored Markdown conversion (Turndown needs
 * a DOM). These handlers persist that Markdown to disk under dome-files/vault/
 * and keep resources.vault_path in sync. SQLite stays the source of truth in
 * this phase; the .md is a portable export for reading/preview/indexing.
 */
const { z } = require('zod');
const vaultStore = require('../../storage/vault-store.cjs');

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
    return vaultStore.writeNoteMarkdown(parsed.data, { database, fileStorage });
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
