import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { register } = require('../ipc/data/notes.cjs');
const vaultStore = require('../storage/vault-store.cjs');

test('note mirror refuses a stale editor snapshot before writing', (t) => {
  const originalRead = vaultStore.readNoteMarkdown;
  const originalWrite = vaultStore.writeNoteMarkdown;
  t.after(() => { vaultStore.readNoteMarkdown = originalRead; vaultStore.writeNoteMarkdown = originalWrite; });
  let writes = 0;
  vaultStore.readNoteMarkdown = () => ({ success: true, markdown: 'Changed by another writer' });
  vaultStore.writeNoteMarkdown = () => { writes += 1; return { success: true }; };
  const handlers = new Map();
  register({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    windowManager: { isAuthorized: () => true, broadcast: () => {} },
    database: {}, fileStorage: {},
  });
  const result = handlers.get('notes:writeMirror')({ sender: { id: 1 } }, {
    id: 'note', markdown: 'My draft', expectedMarkdown: 'Old version',
  });
  assert.deepEqual(result, { success: false, error: 'NOTE_CONFLICT' });
  assert.equal(writes, 0);
});
