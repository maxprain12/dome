import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import runUiPhase from '../agents/run-ui-phase.cjs';

describe('run-ui-phase', () => {
  it('maps chunk types to phases', () => {
    assert.equal(runUiPhase.phaseFromChunkType('text'), 'generating');
    assert.equal(runUiPhase.phaseFromChunkType('tool_call'), 'tool_running');
    assert.equal(runUiPhase.phaseFromChunkType('interrupt'), 'waiting_approval');
    assert.equal(runUiPhase.phaseFromChunkType('unknown'), null);
  });

  it('returns i18n label keys for phases', () => {
    assert.equal(runUiPhase.labelKeyForPhase('generating'), 'chat.generating_response');
    assert.equal(runUiPhase.labelKeyForPhase('tool_running', 'web_search'), null);
  });

  it('validates phase names', () => {
    assert.equal(runUiPhase.isUiPhase('thinking'), true);
    assert.equal(runUiPhase.isUiPhase('nope'), false);
  });
});
