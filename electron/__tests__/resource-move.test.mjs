import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateMoveToFolder } = require('../storage/resource-move.cjs');

describe('validateMoveToFolder', () => {
  it('allows moving a file into a folder in the same project', () => {
    const result = validateMoveToFolder({
      resource: { id: 'note', type: 'note', project_id: 'p1' },
      folder: { id: 'folder', type: 'folder', project_id: 'p1' },
      folderId: 'folder',
      subtreeIds: [],
    });
    assert.equal(result.ok, true);
  });

  it('rejects missing resources and non-folder targets', () => {
    assert.equal(validateMoveToFolder({ resource: null, folder: null, folderId: 'x' }).ok, false);
    assert.equal(
      validateMoveToFolder({
        resource: { id: 'note', type: 'note', project_id: 'p1' },
        folder: { id: 'file', type: 'note', project_id: 'p1' },
        folderId: 'file',
      }).error,
      'Target is not a folder',
    );
  });

  it('rejects self, descendant, and cross-project moves', () => {
    assert.equal(
      validateMoveToFolder({
        resource: { id: 'folder', type: 'folder', project_id: 'p1' },
        folder: { id: 'folder', type: 'folder', project_id: 'p1' },
        folderId: 'folder',
      }).error,
      'Cannot move folder into itself',
    );
    assert.equal(
      validateMoveToFolder({
        resource: { id: 'parent', type: 'folder', project_id: 'p1' },
        folder: { id: 'child', type: 'folder', project_id: 'p1' },
        folderId: 'child',
        subtreeIds: ['parent', 'child'],
      }).error,
      'Cannot move folder into its descendant',
    );
    assert.equal(
      validateMoveToFolder({
        resource: { id: 'note', type: 'note', project_id: 'p1' },
        folder: { id: 'other', type: 'folder', project_id: 'p2' },
        folderId: 'other',
      }).error,
      'Cannot move to a folder in another project',
    );
  });

  it('allows moving to project root', () => {
    const result = validateMoveToFolder({
      resource: { id: 'note', type: 'note', project_id: 'p1' },
      folder: null,
      folderId: null,
    });
    assert.equal(result.ok, true);
  });
});
