import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  withTimeout,
  DOWNLOAD_TIMEOUT_MS,
} from '../email/himalaya-binary.cjs';

describe('himalaya-binary timeouts', () => {
  it('withTimeout rejects when the inner promise is slower than the limit', async () => {
    await assert.rejects(
      () => withTimeout(new Promise(() => {}), 25, 'test op'),
      /test op timed out after 25ms/,
    );
  });

  it('withTimeout resolves when the inner promise completes in time', async () => {
    const value = await withTimeout(Promise.resolve('ok'), 50, 'test op');
    assert.equal(value, 'ok');
  });

  it('exports download timeout constants', () => {
    assert.equal(typeof DOWNLOAD_TIMEOUT_MS, 'number');
    assert.ok(DOWNLOAD_TIMEOUT_MS >= 60_000);
  });
});
