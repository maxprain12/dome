import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { sanitizePath, isDeniedExternalPath, grantExternalPath } = require('../core/security.cjs');

describe('security path denylist', () => {
  it('flags sensitive external paths', () => {
    const sshKey = path.join(os.homedir(), '.ssh', 'id_rsa');
    assert.equal(isDeniedExternalPath(sshKey), true);
    assert.equal(isDeniedExternalPath(path.join(os.homedir(), '.aws', 'credentials')), true);
  });

  it('blocks denied paths even with allowExternal', () => {
    const sshKey = path.join(os.homedir(), '.ssh', 'id_rsa');
    assert.throws(() => sanitizePath(sshKey, true), /sensitive system location/);
  });

  it('allows granted external paths with warning only', () => {
    const tmpFile = path.join(os.tmpdir(), `dome-audit-${Date.now()}.txt`);
    grantExternalPath(tmpFile);
    assert.doesNotThrow(() => sanitizePath(tmpFile, true));
  });

  it('granting a directory grants files inside it (dialog folder pick)', () => {
    const dir = path.join(os.tmpdir(), `dome-audit-dir-${Date.now()}`);
    grantExternalPath(dir);
    const inside = path.join(dir, 'sub', 'notebook.ipynb');
    assert.doesNotThrow(() => sanitizePath(inside, true));
  });

  it('directory grant does not bypass the denylist', () => {
    const home = os.homedir();
    grantExternalPath(home);
    assert.throws(() => sanitizePath(path.join(home, '.ssh', 'id_rsa'), true), /sensitive system location/);
  });

  it('ignores non-string grant inputs', () => {
    assert.doesNotThrow(() => grantExternalPath(null));
    assert.doesNotThrow(() => grantExternalPath(undefined));
    assert.doesNotThrow(() => grantExternalPath(42));
  });
});
