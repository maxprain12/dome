import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBenchArgs } = require('../bench/parse-args.cjs');
const { loadCaseFiles } = require('../bench/runner.cjs');
const { validateBehavior } = require('../bench/validators.cjs');
const { buildElectronLaunchArgs } = require('../bench/electron-launch-args.cjs');

test('bench parses Self-Harness control-plane flags', () => {
  const args = parseBenchArgs([
    '--cases-file', '/tmp/cases.json',
    '--output-dir', '/tmp/output',
    '--run-id', 'held-in-repeat-1',
    '--experiment-manifest', '/tmp/manifest.json',
  ]);
  assert.equal(args.casesFile, '/tmp/cases.json');
  assert.equal(args.outputDir, '/tmp/output');
  assert.equal(args.runId, 'held-in-repeat-1');
  assert.equal(args.experimentManifest, '/tmp/manifest.json');
});

test('bench can select an explicit sealed case list', () => {
  const cases = loadCaseFiles({ caseIds: ['web_search.basic'], modeFilter: 'direct' });
  assert.deepEqual(cases.map((item) => item.id), ['web_search.basic']);
});

test('behavior verifier rejects repeated tools and premature finalization', () => {
  const repeated = validateBehavior({ max_attempts_per_tool: 1 }, [
    { type: 'tool_call', toolCall: { id: 'one', name: 'resource_get' } },
    { type: 'tool_call', toolCall: { id: 'two', name: 'resource_get' } },
  ]);
  assert.match(repeated.reason, /repeated tool/);

  const premature = validateBehavior({ require_text_after_last_tool: true }, [
    { type: 'tool_result', toolCallId: 'one', result: '{}' },
    { type: 'done' },
  ]);
  assert.match(premature.reason, /no final text/);
});

test('Electron sandbox bypass is Linux CI opt-in only', () => {
  const regular = buildElectronLaunchArgs({
    benchMain: '/repo/electron/bench/main.cjs',
    flags: ['--dry-run'],
    platform: 'linux',
    env: {},
  });
  assert.deepEqual(regular, ['/repo/electron/bench/main.cjs', '--dry-run']);

  const dockerCi = buildElectronLaunchArgs({
    benchMain: '/repo/electron/bench/main.cjs',
    flags: ['--dry-run'],
    platform: 'linux',
    env: { DOME_BENCH_NO_SANDBOX: '1' },
  });
  assert.deepEqual(dockerCi, [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '/repo/electron/bench/main.cjs',
    '--dry-run',
  ]);

  const localMac = buildElectronLaunchArgs({
    benchMain: '/repo/electron/bench/main.cjs',
    platform: 'darwin',
    env: { DOME_BENCH_NO_SANDBOX: '1' },
  });
  assert.deepEqual(localMac, ['/repo/electron/bench/main.cjs']);
});
