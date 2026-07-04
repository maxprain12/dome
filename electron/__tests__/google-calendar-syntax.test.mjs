import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const modulePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../calendar/google-calendar-service.cjs',
);

describe('google-calendar-service syntax', () => {
  it('parses without SyntaxError (await only inside async functions)', () => {
    const result = spawnSync(process.execPath, ['--check', modulePath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
