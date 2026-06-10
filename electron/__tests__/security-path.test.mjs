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
});
