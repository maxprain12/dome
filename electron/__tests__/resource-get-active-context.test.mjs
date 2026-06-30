/**
 * Documents the runtimeContext shape contract for resource_get_active.
 * agent-runtime.cjs must pass { runtimeContext: { activeResourceId } }, not a flat spread.
 *
 * Run: node --test electron/__tests__/resource-get-active-context.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function readActiveResourceId(toolContext) {
  return toolContext?.runtimeContext?.activeResourceId ?? null;
}

function buildToolContextFromAgentRuntime(opts) {
  return {
    runtimeContext: opts.runtimeContext ?? null,
    ownerType: opts.ownerType ?? null,
    surface: 'many',
  };
}

describe('resource_get_active runtimeContext shape', () => {
  it('nested runtimeContext exposes activeResourceId to the dispatcher', () => {
    const toolContext = buildToolContextFromAgentRuntime({
      runtimeContext: { activeResourceId: 'res_active_note', pinnedResourceIds: [] },
      ownerType: 'many',
    });
    assert.equal(readActiveResourceId(toolContext), 'res_active_note');
  });

  it('flat spread (pre-fix bug) hides activeResourceId from the dispatcher', () => {
    const broken = {
      ...( { activeResourceId: 'res_active_note', pinnedResourceIds: [] } ),
      ownerType: 'many',
      surface: 'many',
    };
    assert.equal(readActiveResourceId(broken), null);
    assert.equal(broken.activeResourceId, 'res_active_note');
  });
});
