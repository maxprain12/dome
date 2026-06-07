#!/usr/bin/env node
/* eslint-disable */
/**
 * Tests for @dome/tools (Phase 3):
 *   - createToolRegistry   (OpenAI defs → AgentTool bridge)
 *   - families taxonomy    (TOOL_FAMILIES / familyOf / toolsInFamily)
 *   - resourceToolDefinitions (worked-example family)
 *
 * `node:test`; imports compiled `dist/`. Run: `node scripts/test-dome-tools.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createToolRegistry,
  createToolFromDefinition,
  toolDefName,
  TOOL_FAMILIES,
  TOOL_COUNT,
  familyOf,
  toolsInFamily,
  RESOURCE_TOOL_NAMES,
  resourceToolDefinitions,
} from '../packages/tools/dist/index.js';

// ── registry ───────────────────────────────────────────────────────────────
test('toolDefName: reads nested and flat shapes', () => {
  assert.equal(toolDefName({ function: { name: 'a' } }), 'a');
  assert.equal(toolDefName({ name: 'b' }), 'b');
  assert.equal(toolDefName({ description: 'no name' }), '');
});

test('createToolRegistry: wraps defs and bridges execute to ops', async () => {
  const calls = [];
  const ops = {
    executeToolInMain: async (name, args) => {
      calls.push({ name, args });
      return { ok: true, echoed: args };
    },
  };
  const tools = createToolRegistry(
    [
      { type: 'function', function: { name: 'search', description: 'd', parameters: { type: 'object' } } },
      { name: 'flat', description: 'flat-style', parameters: {} },
    ],
    ops,
  );
  assert.equal(tools.length, 2);
  assert.equal(tools[0].name, 'search');
  assert.equal(tools[0].schema.function.name, 'search');
  assert.equal(tools[1].name, 'flat');
  const res = await tools[0].execute({ q: 'cats' }, {});
  assert.deepEqual(calls[0], { name: 'search', args: { q: 'cats' } });
  assert.match(res.text, /echoed/);
  assert.deepEqual(res.details, { ok: true, echoed: { q: 'cats' } });
});

test('createToolRegistry: string results pass through; errors become error results', async () => {
  const tools = createToolRegistry(
    [{ name: 'str', parameters: {} }, { name: 'boom', parameters: {} }],
    {
      executeToolInMain: async (name) => {
        if (name === 'boom') throw new Error('dispatcher down');
        return 'plain string';
      },
    },
  );
  assert.equal((await tools[0].execute({}, {})).text, 'plain string');
  assert.match((await tools[1].execute({}, {})).error, /dispatcher down/);
});

test('createToolRegistry: drops defs without a name; handles empty/undefined', () => {
  assert.deepEqual(createToolRegistry(undefined, { executeToolInMain: async () => {} }), []);
  assert.equal(
    createToolRegistry([{ description: 'no name' }], { executeToolInMain: async () => {} }).length,
    0,
  );
});

test('createToolFromDefinition: returns null for nameless defs', () => {
  assert.equal(createToolFromDefinition({}, { executeToolInMain: async () => {} }), null);
});

// ── families ─────────────────────────────────────────────────────────────
test('TOOL_FAMILIES covers the 103-tool catalog', () => {
  assert.equal(TOOL_COUNT, 103);
  assert.equal(Object.keys(TOOL_FAMILIES).length, 103);
});

test('familyOf resolves known tools and falls back to misc', () => {
  assert.equal(familyOf('resource_search'), 'resources');
  assert.equal(familyOf('excel_get'), 'office');
  assert.equal(familyOf('web_search'), 'web');
  assert.equal(familyOf('ui_click'), 'ui');
  assert.equal(familyOf('totally_unknown_tool'), 'misc');
});

test('toolsInFamily returns the members of a family', () => {
  const office = toolsInFamily('office');
  assert.ok(office.includes('excel_get'));
  assert.ok(office.includes('docx_create'));
  assert.ok(office.includes('ppt_export'));
  // resources family is the biggest single family
  assert.ok(toolsInFamily('resources').length >= 18);
});

// ── resources worked example ─────────────────────────────────────────────
test('resourceToolDefinitions returns valid OpenAI defs in the resources family', () => {
  const defs = resourceToolDefinitions();
  assert.ok(defs.length >= 3);
  for (const d of defs) {
    const name = toolDefName(d);
    assert.ok(RESOURCE_TOOL_NAMES.includes(name), `${name} should be a resource tool`);
    assert.equal(familyOf(name), 'resources');
    assert.equal(d.function.parameters.type, 'object');
  }
  // resource_search requires query
  const search = defs.find((d) => toolDefName(d) === 'resource_search');
  assert.deepEqual(search.function.parameters.required, ['query']);
});

test('resourceToolDefinitions plug into the registry', async () => {
  const tools = createToolRegistry(resourceToolDefinitions(), {
    executeToolInMain: async (name, args) => ({ ran: name, args }),
  });
  const search = tools.find((t) => t.name === 'resource_search');
  assert.ok(search);
  const res = await search.execute({ query: 'cats' }, {});
  assert.match(res.text, /resource_search/);
});
