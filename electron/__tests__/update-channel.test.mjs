import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  initialCheckDelayMs,
  intervalCheckDelayMs,
  isUpdateChannel,
  releaseNotesText,
} from '../core/update-schedule.cjs';

describe('update channel', () => {
  it('acepta solo latest y beta', () => {
    assert.equal(isUpdateChannel('latest'), true);
    assert.equal(isUpdateChannel('beta'), true);
    assert.equal(isUpdateChannel('nightly'), false);
  });

  it('el primer chequeo cae entre 5s y 60s', () => {
    assert.equal(initialCheckDelayMs(() => 0), 5000);
    assert.equal(initialCheckDelayMs(() => 0.999), 5000 + Math.floor(0.999 * 55000));
  });

  it('el intervalo es 6h con un margen de 30min', () => {
    const low = intervalCheckDelayMs(() => 0);
    const high = intervalCheckDelayMs(() => 1);
    assert.equal(low, 6 * 60 * 60 * 1000 - 30 * 60 * 1000);
    assert.equal(high, 6 * 60 * 60 * 1000 + 30 * 60 * 1000);
  });

  it('normaliza las notas de la release', () => {
    assert.equal(releaseNotesText('hola'), 'hola');
    assert.equal(releaseNotesText([{ note: 'a' }, { note: 'b' }]), 'a\n\nb');
  });
});
