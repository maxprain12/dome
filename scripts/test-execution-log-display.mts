import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countAgentProgress,
  getExecutionStatusPresentation,
  hasExecutionLogContent,
  resolveExecutionDisplay,
} from '../app/lib/agent-canvas/executionLogDisplay.ts';

describe('executionLogDisplay', () => {
  it('resolveExecutionDisplay uses live entries while running', () => {
    const entries = [{ id: '1', type: 'info' as const, nodeId: 'n1', nodeLabel: 'A', message: 'x', timestamp: 1 }];
    const history = [
      {
        id: 'h1',
        status: 'done' as const,
        startedAt: 0,
        finishedAt: 1,
        entries: [],
      },
    ];
    const result = resolveExecutionDisplay(entries, 'running', 100, history, null);
    assert.equal(result.displayEntries, entries);
    assert.equal(result.displayStatus, 'running');
  });

  it('resolveExecutionDisplay uses selected history when idle', () => {
    const historyEntries = [{ id: '2', type: 'done' as const, nodeId: 'n1', nodeLabel: 'A', message: 'ok', timestamp: 2 }];
    const history = [
      {
        id: 'h1',
        status: 'done' as const,
        startedAt: 0,
        finishedAt: 1,
        entries: historyEntries,
      },
    ];
    const result = resolveExecutionDisplay([], 'idle', null, history, 'h1');
    assert.deepEqual(result.displayEntries, historyEntries);
    assert.equal(result.displayStartTime, 0);
  });

  it('hasExecutionLogContent detects empty idle state', () => {
    assert.equal(hasExecutionLogContent('idle', [], []), false);
    assert.equal(hasExecutionLogContent('running', [], []), true);
  });

  it('countAgentProgress counts unique node ids', () => {
    const entries = [
      { id: '1', type: 'done' as const, nodeId: 'a', nodeLabel: 'A', message: '', timestamp: 0 },
      { id: '2', type: 'info' as const, nodeId: 'a', nodeLabel: 'A', message: '', timestamp: 1 },
      { id: '3', type: 'done' as const, nodeId: 'b', nodeLabel: 'B', message: '', timestamp: 2 },
    ];
    assert.deepEqual(countAgentProgress(entries), { completedAgents: 2, totalAgents: 2 });
  });

  it('getExecutionStatusPresentation maps statuses', () => {
    assert.equal(getExecutionStatusPresentation('running').statusLabelKey, 'canvas.exec_status_running');
    assert.equal(getExecutionStatusPresentation('done').statusColor, 'var(--success)');
    assert.equal(getExecutionStatusPresentation('error').isError, true);
  });
});
