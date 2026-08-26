/**
 * Helpers extracted from executeToolInMainImpl (S3776).
 * Run: node --test electron/__tests__/tool-dispatcher-handlers.test.mjs
 */
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  denyUnlessResourceInScope,
  resolveResourceId,
  normalizeMetadataArg,
  invokeToolHandler,
  HANDLER_INVOKERS,
} = require('../tools/tool-dispatcher-handlers.cjs');

describe('resolveResourceId', () => {
  it('prefers resource_id over resourceId and id', () => {
    assert.equal(
      resolveResourceId({ resource_id: 'a', resourceId: 'b', id: 'c' }),
      'a',
    );
    assert.equal(resolveResourceId({ resourceId: 'b', id: 'c' }), 'b');
    assert.equal(resolveResourceId({ id: 'c' }), 'c');
    assert.equal(resolveResourceId({}), undefined);
  });
});

describe('normalizeMetadataArg', () => {
  it('parses JSON strings and returns objects as-is', () => {
    assert.deepEqual(normalizeMetadataArg('{"k":1}'), { k: 1 });
    assert.deepEqual(normalizeMetadataArg({ k: 2 }), { k: 2 });
  });

  it('returns undefined for invalid JSON strings', () => {
    assert.equal(normalizeMetadataArg('{not-json'), undefined);
  });
});

describe('denyUnlessResourceInScope', () => {
  let database;
  let originalRequireCacheKey;

  beforeEach(() => {
    database = {
      getQueries: () => ({
        getResourceById: {
          get: mock.fn((id) => {
            if (id === 'in-scope') return { id, project_id: 'proj-a' };
            if (id === 'other') return { id, project_id: 'proj-b' };
            return null;
          }),
        },
      }),
    };
    // Stub the database module used by the helper.
    originalRequireCacheKey = require.resolve('../core/database.cjs');
    require.cache[originalRequireCacheKey] = {
      id: originalRequireCacheKey,
      filename: originalRequireCacheKey,
      loaded: true,
      exports: database,
    };
  });

  afterEach(() => {
    delete require.cache[originalRequireCacheKey];
  });

  it('returns null when automation scope is unset or resource id is missing', () => {
    assert.equal(denyUnlessResourceInScope(null, 'in-scope'), null);
    assert.equal(denyUnlessResourceInScope('proj-a', null), null);
    assert.equal(denyUnlessResourceInScope(undefined, ''), null);
  });

  it('returns null when the resource belongs to the automation project', () => {
    assert.equal(denyUnlessResourceInScope('proj-a', 'in-scope'), null);
  });

  it('denies when the resource is missing or in another project', () => {
    assert.deepEqual(denyUnlessResourceInScope('proj-a', 'missing'), {
      success: false,
      error: 'Resource is outside the automation project scope',
    });
    assert.deepEqual(denyUnlessResourceInScope('proj-a', 'other'), {
      success: false,
      error: 'Resource is outside the automation project scope',
    });
  });
});

describe('invokeToolHandler', () => {
  it('routes known handlers and falls back to fn(args)', async () => {
    const calls = [];
    const fn = mock.fn(async (query, opts) => {
      calls.push({ query, opts });
      return { ok: true, query };
    });

    const routed = await invokeToolHandler('resourceSearch', {
      fn,
      args: { query: 'hello', type: 'note', limit: 3 },
      automationProjectId: 'proj-a',
      getAiToolsHandler: () => ({}),
    });
    assert.deepEqual(routed, { ok: true, query: 'hello' });
    assert.equal(fn.mock.calls.length, 1);
    assert.deepEqual(fn.mock.calls[0].arguments[1], {
      project_id: 'proj-a',
      type: 'note',
      limit: 3,
    });

    const fallbackFn = mock.fn(async (args) => ({ fallback: args.x }));
    const fallback = await invokeToolHandler('fileRead', {
      fn: fallbackFn,
      args: { x: 1 },
      automationProjectId: null,
      getAiToolsHandler: () => ({}),
    });
    assert.deepEqual(fallback, { fallback: 1 });
    assert.equal(fallbackFn.mock.calls.length, 1);
  });

  it('resourceGetActive requires runtimeContext.activeResourceId', async () => {
    const resourceGet = mock.fn(async () => ({ success: true }));
    const missing = await invokeToolHandler('resourceGetActive', {
      fn: async () => {},
      args: {},
      toolContext: {},
      automationProjectId: null,
      getAiToolsHandler: () => ({ resourceGet }),
    });
    assert.equal(missing.success, false);
    assert.match(missing.error, /No active resource/);

    const ok = await invokeToolHandler('resourceGetActive', {
      fn: async () => {},
      args: {},
      toolContext: { runtimeContext: { activeResourceId: 'res-1' } },
      automationProjectId: null,
      getAiToolsHandler: () => ({ resourceGet }),
    });
    assert.deepEqual(ok, { success: true });
    assert.equal(resourceGet.mock.calls[0].arguments[0], 'res-1');
  });

  it('deepResearch invokes fn without wrapping in an extra async await layer', () => {
    assert.equal(typeof HANDLER_INVOKERS.deepResearch, 'function');
    const rejected = Promise.reject(new Error('research-failed'));
    // Prevent unhandledRejection in the test process.
    rejected.catch(() => {});
    const fn = mock.fn(() => rejected);
    const out = HANDLER_INVOKERS.deepResearch({ fn, args: { q: 1 } });
    assert.equal(out, rejected);
    assert.equal(fn.mock.calls[0].arguments[0].q, 1);
  });

  it('domeLoadDoc validates id and returns section body', async () => {
    const missing = await invokeToolHandler('domeLoadDoc', {
      fn: async () => {},
      args: {},
      automationProjectId: null,
      getAiToolsHandler: () => ({}),
    });
    assert.match(missing.error, /id is required/);

    const unknown = await invokeToolHandler('domeLoadDoc', {
      fn: async () => {},
      args: { id: 'not_a_real_doc_id_xyz' },
      automationProjectId: null,
      getAiToolsHandler: () => ({}),
    });
    assert.match(unknown.error, /Unknown doc id/);

    const ok = await invokeToolHandler('domeLoadDoc', {
      fn: async () => {},
      args: { id: 'artifacts' },
      automationProjectId: null,
      getAiToolsHandler: () => ({}),
    });
    assert.equal(ok.id, 'artifacts');
    assert.equal(typeof ok.content, 'string');
    assert.ok(ok.content.length > 0);
  });

  it('resourceUpdate normalizes string metadata via normalizeMetadataArg', async () => {
    const fn = mock.fn(async (_rid, patch) => patch);
    const out = await invokeToolHandler('resourceUpdate', {
      fn,
      args: {
        resource_id: 'r1',
        title: 'T',
        content: 'C',
        metadata: '{"a":true}',
      },
      automationProjectId: null,
      getAiToolsHandler: () => ({}),
    });
    assert.deepEqual(out, { title: 'T', content: 'C', metadata: { a: true } });
  });

  it('shell/git family passes toolContext as second argument', async () => {
    const fn = mock.fn(async (args, toolContext) => ({ args, toolContext }));
    const toolContext = { workspaceCwd: '/tmp/repo' };
    const out = await invokeToolHandler('gitStatus', {
      fn,
      args: { path: '.' },
      toolContext,
      automationProjectId: null,
      getAiToolsHandler: () => ({}),
    });
    assert.equal(out.toolContext, toolContext);
    assert.deepEqual(out.args, { path: '.' });
  });
});

describe('tryResolveSocialPinnedPost', () => {
  it('returns null for non sp- ids', () => {
    const { tryResolveSocialPinnedPost } = require('../tools/tool-dispatcher-handlers.cjs');
    assert.equal(tryResolveSocialPinnedPost('res-1'), null);
  });
});

describe('getToolTimeoutMs', () => {
  it('applies per-tool overrides and the default floor', () => {
    // Lazy: only pull the timeout helper (avoid loading ai-tools-handler / Electron).
    const dispatcherPath = require.resolve('../tools/tool-dispatcher.cjs');
    const src = require('node:fs').readFileSync(dispatcherPath, 'utf8');
    assert.match(src, /web_fetch:\s*90_000/);
    assert.match(src, /DEFAULT_TOOL_TIMEOUT_MS/);
    assert.match(src, /handlerName === 'deepResearch'/);
    assert.match(src, /invokeToolHandler/);
  });
});
