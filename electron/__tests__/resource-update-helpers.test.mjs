/**
 * Helpers extracted from db:resources:update (S3776).
 * Run: node --test electron/__tests__/resource-update-helpers.test.mjs
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  mergeResourceUpdateFields,
  buildMergedResource,
  reconcileVaultAfterResourceUpdate,
  executeResourcesUpdate,
  retryResourcesUpdateAfterCorruption,
  attemptResourceUpdateAfterRepair,
} = require('../ipc/data/resource-update-helpers.cjs');

const baseCurrent = {
  id: 'res-1',
  type: 'note',
  title: 'Old',
  content: 'body',
  metadata: '{"a":1}',
  updated_at: 100,
  project_id: 'p1',
  vault_path: null,
};

describe('mergeResourceUpdateFields', () => {
  it('keeps current fields when update omits them', () => {
    const fields = mergeResourceUpdateFields({ id: 'res-1' }, baseCurrent);
    assert.equal(fields.mergedTitle, 'Old');
    assert.equal(fields.mergedContent, 'body');
    assert.equal(fields.mergedMetadata, '{"a":1}');
    assert.equal(fields.mergedUpdatedAt, 100);
  });

  it('merges provided title/content/metadata/updated_at', () => {
    const fields = mergeResourceUpdateFields(
      {
        id: 'res-1',
        title: 'New',
        content: 'next',
        metadata: { b: 2 },
        updated_at: 200,
      },
      baseCurrent,
    );
    assert.equal(fields.mergedTitle, 'New');
    assert.equal(fields.mergedContent, 'next');
    assert.equal(fields.mergedMetadata, '{"b":2}');
    assert.equal(fields.mergedUpdatedAt, 200);
  });

  it('stringifies only object metadata; passes through string metadata', () => {
    const asString = mergeResourceUpdateFields(
      { id: 'res-1', metadata: '{"x":1}' },
      baseCurrent,
    );
    assert.equal(asString.mergedMetadata, '{"x":1}');
  });

  it('coerces empty content to null; falls back title to Untitled when enabled', () => {
    const fields = mergeResourceUpdateFields(
      { id: 'res-1', title: null, content: '' },
      { ...baseCurrent, title: null },
      { untitledTitleFallback: true },
    );
    assert.equal(fields.mergedTitle, 'Untitled');
    assert.equal(fields.mergedContent, null);
  });

  it('omits Untitled fallback on second-repair path', () => {
    const fields = mergeResourceUpdateFields(
      { id: 'res-1', title: null },
      { ...baseCurrent, title: null },
      { untitledTitleFallback: false },
    );
    assert.equal(fields.mergedTitle, null);
  });
});

describe('buildMergedResource', () => {
  it('overlays merged fields onto current row', () => {
    const fields = {
      mergedTitle: 'T',
      mergedContent: 'C',
      mergedMetadata: '{}',
      mergedUpdatedAt: 9,
    };
    assert.deepEqual(buildMergedResource(baseCurrent, fields), {
      ...baseCurrent,
      title: 'T',
      content: 'C',
      metadata: '{}',
      updated_at: 9,
    });
  });
});

describe('reconcileVaultAfterResourceUpdate', () => {
  function makeVault() {
    return {
      relocateFolder: mock.fn(),
      relocateResource: mock.fn(),
      writeUrlMirror: mock.fn(),
      writeNotebookMirror: mock.fn(),
      renameResourceFileToTitle: mock.fn(),
    };
  }

  it('relocates folder on title or folder_id change', () => {
    const vaultStore = makeVault();
    const deps = { database: {}, fileStorage: {}, vaultStore };
    reconcileVaultAfterResourceUpdate(
      { id: 'f1', title: 'Renamed' },
      { ...baseCurrent, id: 'f1', type: 'folder', title: 'Old' },
      null,
      deps,
    );
    assert.equal(vaultStore.relocateFolder.mock.callCount(), 1);

    vaultStore.relocateFolder.mock.resetCalls();
    reconcileVaultAfterResourceUpdate(
      { id: 'f1', folder_id: 'other' },
      { ...baseCurrent, id: 'f1', type: 'folder', folder_id: 'root' },
      null,
      deps,
    );
    assert.equal(vaultStore.relocateFolder.mock.callCount(), 1);
  });

  it('relocates note on title change; skips vault when only unrelated fields', () => {
    const vaultStore = makeVault();
    const deps = { database: { getDB: () => ({ prepare: () => ({ run: () => {} }) }) }, fileStorage: {}, vaultStore };
    reconcileVaultAfterResourceUpdate(
      { id: 'n1', title: 'Renamed' },
      { ...baseCurrent, id: 'n1', type: 'note' },
      'body',
      deps,
    );
    assert.equal(vaultStore.relocateResource.mock.callCount(), 1);

    vaultStore.relocateResource.mock.resetCalls();
    reconcileVaultAfterResourceUpdate(
      { id: 'n1', updated_at: 999 },
      { ...baseCurrent, id: 'n1', type: 'note' },
      'body',
      deps,
    );
    assert.equal(vaultStore.relocateResource.mock.callCount(), 0);
  });

  it('writes url/notebook mirrors when title or content changes', () => {
    const vaultStore = makeVault();
    const deps = { database: {}, fileStorage: {}, vaultStore };
    reconcileVaultAfterResourceUpdate(
      { id: 'u1', content: 'https://x' },
      { ...baseCurrent, id: 'u1', type: 'url', content: 'https://y' },
      'https://x',
      deps,
    );
    assert.equal(vaultStore.writeUrlMirror.mock.callCount(), 1);

    reconcileVaultAfterResourceUpdate(
      { id: 'nb1', title: 'NB2' },
      { ...baseCurrent, id: 'nb1', type: 'notebook' },
      null,
      deps,
    );
    assert.equal(vaultStore.writeNotebookMirror.mock.callCount(), 1);
  });

  it('relocates artifact / renames binary when title changes', () => {
    const vaultStore = makeVault();
    const deps = { database: {}, fileStorage: {}, vaultStore };
    reconcileVaultAfterResourceUpdate(
      { id: 'a1', title: 'A2' },
      { ...baseCurrent, id: 'a1', type: 'artifact' },
      null,
      deps,
    );
    assert.equal(vaultStore.relocateResource.mock.callCount(), 1);

    reconcileVaultAfterResourceUpdate(
      { id: 'b1', title: 'Pdf2' },
      { ...baseCurrent, id: 'b1', type: 'pdf', vault_path: 'files/x.pdf' },
      null,
      deps,
    );
    assert.equal(vaultStore.renameResourceFileToTitle.mock.callCount(), 1);
  });

  it('swallows vault errors without throwing', () => {
    const vaultStore = {
      relocateFolder: () => {
        throw new Error('disk full');
      },
    };
    assert.doesNotThrow(() => {
      reconcileVaultAfterResourceUpdate(
        { id: 'f1', title: 'X' },
        { ...baseCurrent, id: 'f1', type: 'folder' },
        null,
        { database: {}, fileStorage: {}, vaultStore },
      );
    });
  });
});

function makeUpdateDeps(overrides = {}) {
  const run = mock.fn();
  const get = mock.fn(() => ({ ...baseCurrent }));
  const database = {
    getQueries: () => ({
      getResourceById: { get },
      updateResource: { run },
    }),
    getDB: () => ({ prepare: () => ({ run: () => {} }) }),
    invalidateQueries: mock.fn(),
    repairFTSTables: mock.fn(() => true),
    handleCorruptionError: mock.fn(() => false),
  };
  const windowManager = { broadcast: mock.fn() };
  const maybeScheduleKbReindex = mock.fn();
  const semanticIndexScheduler = { scheduleSemanticReindex: mock.fn() };
  const vaultStore = {
    relocateFolder: mock.fn(),
    relocateResource: mock.fn(),
    writeUrlMirror: mock.fn(),
    writeNotebookMirror: mock.fn(),
    renameResourceFileToTitle: mock.fn(),
  };
  return {
    database,
    fileStorage: {},
    windowManager,
    maybeScheduleKbReindex,
    semanticIndexScheduler,
    vaultStore,
    _mocks: { run, get },
    ...overrides,
  };
}

describe('executeResourcesUpdate', () => {
  it('returns not found when resource missing', () => {
    const deps = makeUpdateDeps();
    deps._mocks.get.mock.mockImplementation(() => null);
    const result = executeResourcesUpdate({ id: 'missing' }, deps);
    assert.deepEqual(result, { success: false, error: 'Resource not found' });
  });

  it('persists merge, reconciles vault, broadcasts and reindexes', () => {
    const deps = makeUpdateDeps();
    const result = executeResourcesUpdate(
      { id: 'res-1', title: 'New Title', content: 'hi' },
      deps,
    );
    assert.equal(result.success, true);
    assert.equal(result.data.title, 'New Title');
    assert.equal(result.data.content, 'hi');
    assert.equal(deps._mocks.run.mock.callCount(), 1);
    assert.equal(deps.windowManager.broadcast.mock.callCount(), 1);
    assert.equal(deps.maybeScheduleKbReindex.mock.callCount(), 1);
    assert.equal(deps.semanticIndexScheduler.scheduleSemanticReindex.mock.callCount(), 1);
    // note title change → relocateResource
    assert.equal(deps.vaultStore.relocateResource.mock.callCount(), 1);
  });
});

describe('retryResourcesUpdateAfterCorruption', () => {
  it('succeeds on first repair retry without vault reconcile', () => {
    const deps = makeUpdateDeps();
    const result = retryResourcesUpdateAfterCorruption(
      { id: 'res-1', title: 'Fixed' },
      deps,
    );
    assert.equal(result.success, true);
    assert.equal(result.data.title, 'Fixed');
    assert.equal(deps.vaultStore.relocateResource.mock.callCount(), 0);
    assert.equal(deps.windowManager.broadcast.mock.callCount(), 1);
  });

  it('runs second repair cycle when first retry still corrupt', () => {
    const deps = makeUpdateDeps();
    let attempts = 0;
    deps.database.getQueries = () => ({
      getResourceById: {
        get: () => {
          attempts += 1;
          if (attempts === 1) {
            const err = new Error('corrupt');
            err.code = 'SQLITE_CORRUPT_VTAB';
            throw err;
          }
          return { ...baseCurrent };
        },
      },
      updateResource: { run: mock.fn() },
    });

    const result = retryResourcesUpdateAfterCorruption(
      { id: 'res-1', title: 'Again' },
      deps,
    );
    assert.equal(result.success, true);
    assert.equal(deps.database.invalidateQueries.mock.callCount(), 1);
    assert.equal(deps.database.repairFTSTables.mock.callCount(), 1);
    assert.equal(result.data.title, 'Again');
  });

  it('returns retry error when second repair is not attempted', () => {
    const deps = makeUpdateDeps();
    deps.database.getQueries = () => ({
      getResourceById: {
        get: () => {
          const err = new Error('boom');
          err.code = 'OTHER';
          throw err;
        },
      },
      updateResource: { run: mock.fn() },
    });
    const result = retryResourcesUpdateAfterCorruption({ id: 'res-1' }, deps);
    assert.deepEqual(result, { success: false, error: 'boom' });
  });

  it('returns final error when second repair also fails', () => {
    const deps = makeUpdateDeps();
    deps.database.getQueries = () => ({
      getResourceById: {
        get: () => {
          const err = new Error('still bad');
          err.code = 'SQLITE_CORRUPT';
          throw err;
        },
      },
      updateResource: { run: mock.fn() },
    });
    const result = retryResourcesUpdateAfterCorruption({ id: 'res-1' }, deps);
    assert.deepEqual(result, { success: false, error: 'still bad' });
  });
});

describe('attemptResourceUpdateAfterRepair', () => {
  it('preserves null title without Untitled fallback when disabled', () => {
    const deps = makeUpdateDeps();
    deps._mocks.get.mock.mockImplementation(() => ({ ...baseCurrent, title: null }));
    const result = attemptResourceUpdateAfterRepair(
      { id: 'res-1', title: null },
      deps,
      { untitledTitleFallback: false },
    );
    assert.equal(result.success, true);
    assert.equal(result.data.title, null);
    const runArgs = deps._mocks.run.mock.calls[0].arguments;
    assert.equal(runArgs[0], null);
  });
});
