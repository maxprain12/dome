import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '@/lib/manys/api';
import { buildMatch, foldAudit, mergeAudit, splitList } from './governanceRules';

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 'x', sequence: 1, phase: 'decision', parent_id: null, tool: 'computer_act', operation: 'navigate', host: 'a.test',
  decision: 'allowed', rule_name: null, reason: 'grants', outcome: null, error_code: null, created_at: '2026-10-05T10:00:00Z', ...over,
});

describe('governance helpers', () => {
  it('splits and de-duplicates a comma separated list', () => {
    expect(splitList(' a.com, b.com ,, a.com')).toEqual(['a.com', 'b.com']);
    expect(splitList('')).toEqual([]);
  });

  it('keeps only the match fields that were filled in', () => {
    expect(buildMatch({ tools: '', capabilities: [], operations: '', hosts: '*.bank.com' })).toEqual({ hosts: ['*.bank.com'] });
    expect(buildMatch({ tools: '', capabilities: [], operations: '', hosts: '' })).toEqual({});
  });

  it('merges pages without repeating rows and orders by sequence', () => {
    const merged = mergeAudit([entry({ id: 'a', sequence: 2 })], [entry({ id: 'b', sequence: 3 }), entry({ id: 'a', sequence: 2 })]);
    expect(merged.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('joins a decision with its result and drops an orphan result', () => {
    const rows = foldAudit([
      entry({ id: 'r1', sequence: 4, phase: 'result', parent_id: 'd1', decision: null, outcome: 'error', error_code: 'computer_unavailable' }),
      entry({ id: 'r0', sequence: 3, phase: 'result', parent_id: 'gone', decision: null, outcome: 'ok' }),
      entry({ id: 'd1', sequence: 2 }),
      entry({ id: 'd0', sequence: 1, decision: 'denied', rule_name: 'No bank', reason: 'policy_denied' }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['d1', 'd0']);
    expect(rows[0]).toMatchObject({ outcome: 'error', errorCode: 'computer_unavailable' });
    expect(rows[1]).toMatchObject({ decision: 'denied', ruleName: 'No bank', outcome: null });
  });
});
