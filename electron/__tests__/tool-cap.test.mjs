/**
 * Tool-cap priority: the names it protects must exist, and a coding run must
 * keep the tools it cannot work without.
 * Run: node --test electron/__tests__/tool-cap.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getAllToolDefinitions } = require('../tools/tool-definitions.cjs');
const {
  CODING_RUN_PRIORITY,
  OPENAI_COMPAT_MAX_TOOLS,
  TOOL_CAP_PRIORITY,
  capLangChainTools,
  providerNeedsOpenAiToolCap,
  resolveCapPriority,
} = require('../tools/tool-cap.cjs');

const catalogNames = getAllToolDefinitions().map((d) => d.function.name);
/** `task` is built by the runtime, not part of the static catalog. */
const RUNTIME_ONLY = new Set(['task']);
const asTools = (names) => names.map((name) => ({ name }));

describe('cap priority lists reference real tools', () => {
  it('every TOOL_CAP_PRIORITY name exists in the catalog', () => {
    const ghosts = TOOL_CAP_PRIORITY.filter(
      (n) => !catalogNames.includes(n) && !RUNTIME_ONLY.has(n),
    );
    assert.deepEqual(ghosts, [], `priority names not in the catalog: ${ghosts.join(', ')}`);
  });

  it('every CODING_RUN_PRIORITY name exists in the catalog', () => {
    const ghosts = CODING_RUN_PRIORITY.filter((n) => !catalogNames.includes(n));
    assert.deepEqual(ghosts, [], `coding priority names not in the catalog: ${ghosts.join(', ')}`);
  });

  it('delegation outranks everything', () => {
    assert.equal(resolveCapPriority({ coding: true })[0], 'task');
    assert.equal(resolveCapPriority({})[0], 'task');
  });

  it('a coding run ranks the coding families above the generic ones', () => {
    const priority = resolveCapPriority({ coding: true });
    assert.ok(priority.indexOf('shell_exec') < priority.indexOf('web_search'));
    assert.ok(priority.indexOf('git_commit') < priority.indexOf('web_search'));
  });

  it('does not duplicate names shared by both lists', () => {
    const priority = resolveCapPriority({ coding: true });
    assert.equal(new Set(priority).size, priority.length);
  });
});

describe('capLangChainTools', () => {
  it('is a no-op below the cap', () => {
    const tools = asTools(['a', 'b']);
    assert.equal(capLangChainTools(tools, { provider: 'openai', model: 'gpt-5.6' }), tools);
  });

  it('is a no-op for providers without the 128 limit', () => {
    const tools = asTools(Array.from({ length: 200 }, (_, i) => `t${i}`));
    assert.equal(capLangChainTools(tools, { provider: 'anthropic', model: 'claude' }).length, 200);
  });

  it('detects which providers need the cap', () => {
    assert.equal(providerNeedsOpenAiToolCap('openai', 'gpt-5.6'), true);
    assert.equal(providerNeedsOpenAiToolCap('openrouter', 'openai/gpt-4'), true);
    assert.equal(providerNeedsOpenAiToolCap('anthropic', 'claude'), false);
  });

  it('keeps the whole catalog under the cap for a coding run', () => {
    const tools = asTools([...catalogNames, 'task']);
    assert.ok(tools.length > OPENAI_COMPAT_MAX_TOOLS, 'catalog should exceed the cap');

    const capped = capLangChainTools(tools, {
      provider: 'openai',
      model: 'gpt-5.6',
      coding: true,
    }).map((t) => t.name);

    assert.equal(capped.length, OPENAI_COMPAT_MAX_TOOLS);
    for (const name of CODING_RUN_PRIORITY) {
      assert.ok(capped.includes(name), `${name} must survive the cap in a coding run`);
    }
    assert.ok(capped.includes('task'), 'delegation must survive');
  });

  it('keeps github_update_issue in a coding run — closing the issue is the point', () => {
    const tools = asTools([...catalogNames, 'task']);
    const capped = capLangChainTools(tools, {
      provider: 'openai',
      model: 'gpt-5.6',
      coding: true,
    }).map((t) => t.name);
    assert.ok(capped.includes('github_update_issue'));
  });

  it('preserves catalog order among equally-ranked tools', () => {
    const tools = asTools(Array.from({ length: 140 }, (_, i) => `t${i}`));
    const capped = capLangChainTools(tools, { provider: 'openai', model: 'gpt-5.6' }).map(
      (t) => t.name,
    );
    assert.deepEqual(capped.slice(0, 3), ['t0', 't1', 't2']);
  });
});
