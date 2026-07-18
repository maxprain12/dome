import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { batchAllowedFiles, impliedTestFiles } from '../lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(ROOT, 'scripts/sonar/resolve-loop-mode.mjs');

describe('resolve-loop-mode', () => {
  it('honors forced modes', () => {
    for (const mode of ['issues', 'coverage', 'hotspots']) {
      const r = spawnSync(process.execPath, [SCRIPT], {
        env: { ...process.env, SONAR_LOOP_MODE: mode },
        encoding: 'utf8',
      });
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), mode);
    }
  });
});

describe('batchAllowedFiles coverage', () => {
  it('implies colocated app tests', () => {
    assert.deepEqual(impliedTestFiles('app/lib/foo.ts'), [
      'app/lib/foo.test.ts',
      'app/lib/foo.test.tsx',
    ]);
    const allowed = batchAllowedFiles({
      kind: 'coverage',
      batch: [{ component: 'proj:app/lib/foo.ts' }],
    });
    assert.ok(allowed.has('app/lib/foo.ts'));
    assert.ok(allowed.has('app/lib/foo.test.ts'));
  });
});
