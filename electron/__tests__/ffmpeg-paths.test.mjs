import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { toSpawnSafePath } from '../media/ffmpeg-paths.cjs';

describe('ffmpeg-paths', () => {
  it('rewrites app.asar binary paths to app.asar.unpacked', () => {
    const asarPath = path.join(
      '/Applications/Dome.app/Contents/Resources/app.asar/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg',
    );
    const expected = path.join(
      '/Applications/Dome.app/Contents/Resources/app.asar.unpacked/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg',
    );
    assert.equal(toSpawnSafePath(asarPath), expected);
  });

  it('leaves dev and already-unpacked paths unchanged', () => {
    const devPath = '/Users/me/dome/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
    assert.equal(toSpawnSafePath(devPath), devPath);
    const unpacked = '/Applications/Dome.app/Contents/Resources/app.asar.unpacked/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
    assert.equal(toSpawnSafePath(unpacked), unpacked);
  });
});
