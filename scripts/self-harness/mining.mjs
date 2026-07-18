function lastToolName(record) {
  const reversed = [...(record.chunks || [])].reverse();
  return reversed.find((chunk) => chunk.type === 'tool_call')?.toolCall?.name || null;
}

export function deriveFailureSignature(record) {
  const outcome = record.outcome || 'FAIL_UNKNOWN';
  const reason = record.validation?.execution?.reason
    || record.validation?.structural?.reason
    || record.validation?.judge?.reasoning
    || record.error
    || outcome;

  let terminalCause = outcome.toLowerCase();
  let causalStatus = 'agent_contributed';
  let agentMechanism = 'unknown_behavior';
  const lower = String(reason).toLowerCase();

  if (lower.includes('timeout')) {
    terminalCause = 'timeout';
    agentMechanism = 'unbounded_execution';
  } else if (lower.includes('missing expected tools')) {
    terminalCause = 'missing_required_tool';
    agentMechanism = 'tool_selection';
  } else if (lower.includes('behavior repeated tool')) {
    terminalCause = 'repeated_tool_call';
    agentMechanism = 'tool_error_recovery';
  } else if (lower.includes('behavior exceeded max turns') || lower.includes('behavior exceeded max tool calls')) {
    terminalCause = 'execution_budget_exceeded';
    agentMechanism = 'unbounded_execution';
  } else if (lower.includes('without a tool result') || lower.includes('no final text after')) {
    terminalCause = 'premature_finalization';
    agentMechanism = 'finalization_validation';
  } else if (lower.includes('forbidden tools')) {
    terminalCause = 'forbidden_tool';
    agentMechanism = 'tool_scope';
  } else if (lower.includes('output') || lower.includes('regex') || lower.includes('too short')) {
    terminalCause = 'invalid_output';
    agentMechanism = 'finalization_validation';
  } else if (record.error) {
    terminalCause = 'execution_error';
    agentMechanism = lastToolName(record) ? 'tool_error_recovery' : 'runtime_error_recovery';
  } else if (outcome === 'FAIL_JUDGE') {
    terminalCause = 'quality_rejection';
    agentMechanism = 'response_quality';
    causalStatus = 'uncertain';
  }

  return { terminalCause, causalStatus, agentMechanism };
}

export function buildEvidenceBundle(records, previousProposals = []) {
  const failures = records.filter((record) => !['PASS', 'SKIP', 'DRY_RUN'].includes(record.outcome));
  const clusters = new Map();
  for (const record of failures) {
    const signature = deriveFailureSignature(record);
    const key = `${signature.terminalCause}|${signature.causalStatus}|${signature.agentMechanism}`;
    const cluster = clusters.get(key) || { signature, records: [] };
    cluster.records.push(record);
    clusters.set(key, cluster);
  }

  const patterns = [...clusters.values()].map((cluster) => ({
    signature: cluster.signature,
    support: cluster.records.length,
    caseIds: cluster.records.map((record) => record.caseId).sort(),
    traceSymptoms: [...new Set(cluster.records.map((record) =>
      record.validation?.execution?.reason
      || record.validation?.structural?.reason
      || record.error
      || record.outcome))].slice(0, 5),
    representativeTraces: cluster.records.slice(0, 3).map((record) => ({
      caseId: record.caseId,
      outcome: record.outcome,
      toolsCalled: record.toolsCalled || [],
      finalTextPreview: String(record.finalText || '').slice(0, 500),
    })),
  })).sort((a, b) => b.support - a.support || a.caseIds[0].localeCompare(b.caseIds[0]));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    failedRecords: failures.length,
    patterns,
    passingBehaviors: records.filter((record) => record.outcome === 'PASS').slice(0, 20).map((record) => ({
      caseId: record.caseId,
      toolsCalled: record.toolsCalled || [],
    })),
    previousProposals: previousProposals.map(({ id, status, reason }) => ({ id, status, reason })),
  };
}
