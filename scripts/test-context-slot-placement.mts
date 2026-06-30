/**
 * Regression test for the duplicated "23%" context indicator in the Many panel.
 * The indicator must live in the header when docked (sidebar) and in the composer
 * when fullscreen — exactly one surface, never both.
 *
 * Run: pnpm run test:context-slot-placement
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { manyContextSlotPlacement } from '../app/lib/many/contextSlotPlacement.ts';

test('docked (sidebar) → header only, never the composer too (the bug)', () => {
  const p = manyContextSlotPlacement({ isFullscreen: false, showContextUsage: true });
  assert.deepEqual(p, { header: true, composer: false });
});

test('fullscreen → composer only', () => {
  const p = manyContextSlotPlacement({ isFullscreen: true, showContextUsage: true });
  assert.deepEqual(p, { header: false, composer: true });
});

test('not eligible → neither surface (docked)', () => {
  const p = manyContextSlotPlacement({ isFullscreen: false, showContextUsage: false });
  assert.deepEqual(p, { header: false, composer: false });
});

test('not eligible → neither surface (fullscreen)', () => {
  const p = manyContextSlotPlacement({ isFullscreen: true, showContextUsage: false });
  assert.deepEqual(p, { header: false, composer: false });
});

test('invariant: the indicator is never mounted in both surfaces at once', () => {
  for (const isFullscreen of [true, false]) {
    for (const showContextUsage of [true, false]) {
      const p = manyContextSlotPlacement({ isFullscreen, showContextUsage });
      assert.equal(p.header && p.composer, false);
    }
  }
});
