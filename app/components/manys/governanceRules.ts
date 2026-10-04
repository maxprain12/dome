import type { AuditEntry, PolicyMatch } from '@/lib/manys/api';

/** "a.com, b.com ,," becomes ['a.com', 'b.com']. */
export function splitList(text: string): string[] {
  return [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))];
}

/** Only the fields the person filled in. An empty list would be rejected by the provider. */
export function buildMatch(input: { tools: string; capabilities: string[]; operations: string; hosts: string }): PolicyMatch {
  const match: PolicyMatch = {};
  const tools = splitList(input.tools);
  const operations = splitList(input.operations);
  const hosts = splitList(input.hosts);
  if (tools.length) match.tools = tools;
  if (input.capabilities.length) match.capabilities = input.capabilities;
  if (operations.length) match.operations = operations;
  if (hosts.length) match.hosts = hosts;
  return match;
}

export interface AuditRow {
  id: string;
  sequence: number;
  tool: string;
  operation: string | null;
  host: string | null;
  decision: NonNullable<AuditEntry['decision']>;
  ruleName: string | null;
  reason: string | null;
  outcome: AuditEntry['outcome'];
  errorCode: string | null;
  createdAt: string;
}

/** Newest page first, de-duplicated by id and ordered by sequence, so a refresh never repeats a row. */
export function mergeAudit(current: AuditEntry[], fresh: AuditEntry[]): AuditEntry[] {
  const byId = new Map<string, AuditEntry>();
  for (const entry of [...current, ...fresh]) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.sequence - a.sequence);
}

/** A decision and the result that followed it read as one line. A result without its decision is dropped. */
export function foldAudit(entries: AuditEntry[]): AuditRow[] {
  const results = new Map<string, AuditEntry>();
  for (const entry of entries) if (entry.phase === 'result' && entry.parent_id) results.set(entry.parent_id, entry);
  return entries.filter((entry) => entry.phase === 'decision' && entry.decision).map((entry) => {
    const result = results.get(entry.id);
    return {
      id: entry.id,
      sequence: entry.sequence,
      tool: entry.tool,
      operation: entry.operation,
      host: entry.host,
      decision: entry.decision as AuditRow['decision'],
      ruleName: entry.rule_name,
      reason: entry.reason,
      outcome: result?.outcome ?? null,
      errorCode: result?.error_code ?? null,
      createdAt: entry.created_at,
    };
  });
}
