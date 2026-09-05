import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  isNotebookSurface,
  sanitizeNotebookExecPath,
} = require('../documents/notebook-exec-guard.cjs');
const { grantExternalPath } = require('../core/security.cjs');

describe('notebook execution surface', () => {
  it('accepts only the notebook surface', () => {
    assert.equal(isNotebookSurface('notebook'), true);
    assert.equal(isNotebookSurface('chat'), false);
    assert.equal(isNotebookSurface(undefined), false);
    assert.equal(isNotebookSurface(null), false);
  });
});

describe('sanitizeNotebookExecPath', () => {
  it('rejects empty and non-string paths', () => {
    assert.equal(sanitizeNotebookExecPath('').ok, false);
    assert.equal(sanitizeNotebookExecPath(null).ok, false);
  });

  it('rejects sensitive locations even when allowExternal would warn', () => {
    const sshKey = path.join(os.homedir(), '.ssh', 'id_rsa');
    const result = sanitizeNotebookExecPath(sshKey);
    assert.equal(result.ok, false);
  });

  it('accepts a granted workspace directory', () => {
    const dir = path.join(os.tmpdir(), `dome-nb-ws-${Date.now()}`);
    grantExternalPath(dir);
    const result = sanitizeNotebookExecPath(dir);
    assert.equal(result.ok, true);
    assert.ok(result.path.includes('dome-nb-ws-'));
  });
});
