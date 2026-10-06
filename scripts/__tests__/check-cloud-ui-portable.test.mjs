import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { check, valueImports } from '../check-cloud-ui-portable.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('valueImports keeps what survives compilation and drops type-only imports', () => {
  const source = `
    import type { A } from './a';
    import { type B, type C } from './b';
    import { type D, e } from './d';
    import Default, { type F } from './f';
    import * as g from './g';
    export * from './h';
    export type { I } from './i';
    export { j } from './j';
    import './side-effect.css';
    // import { commented } from './commented';
    const lazy = () => import('./lazy');
  `;
  assert.deepEqual(valueImports(source).sort(), ['./d', './f', './g', './h', './j', './lazy', './side-effect.css'].sort());
});

test('the cloud Manys view does not reach the desktop', () => {
  const { offenders } = check(path.join(root, 'app/components/manys/ManysView.tsx'));
  assert.deepEqual(offenders, []);
});

test('the desktop Many panel does reach it, so the check can tell the difference', () => {
  const { offenders } = check(path.join(root, 'app/components/many/ManyPanel.tsx'));
  assert.ok(offenders.some((offender) => offender.file === 'app/lib/store/useManyStore.ts'));
  assert.ok(offenders.some((offender) => offender.reason === 'window.electron'));
});
