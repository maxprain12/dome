function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function aggregateMetrics(records) {
  const passCount = records.filter((record) => record.outcome === 'PASS').length;
  const errors = records.filter((record) => record.outcome === 'FAIL_EXEC').length;
  const timeouts = records.filter((record) => String(record.error || '').includes('Timeout')).length;
  const securityViolations = records.filter((record) => record.outcome === 'FAIL_SECURITY').length;
  const durations = records.map((record) => record.durationMs).filter(Number.isFinite);
  const totalTokens = records.reduce((sum, record) => sum + (record.usage?.totalTokens || 0), 0);
  const totalCostUsd = records.reduce((sum, record) => sum + (record.usage?.costUsd || 0), 0);
  return {
    attempts: records.length,
    passCount,
    passRate: records.length ? passCount / records.length : 0,
    errors,
    timeouts,
    securityViolations,
    totalTokens,
    totalCostUsd,
    p95DurationMs: percentile(durations, 0.95),
  };
}

function withinRatio(candidate, baseline, maximumRatio) {
  if (baseline === 0) return candidate === 0;
  return candidate <= baseline * maximumRatio;
}

export function evaluateCandidate({ baselineIn, baselineOut, candidateIn, candidateOut, limits }) {
  const deltaIn = candidateIn.passCount - baselineIn.passCount;
  const deltaOut = candidateOut.passCount - baselineOut.passCount;
  const reasons = [];
  if (deltaIn < 0) reasons.push(`held-in regressed by ${Math.abs(deltaIn)} pass(es)`);
  if (deltaOut < 0) reasons.push(`held-out regressed by ${Math.abs(deltaOut)} pass(es)`);
  if (deltaIn === 0 && deltaOut === 0) reasons.push('no pass-count improvement');
  if (candidateIn.errors + candidateOut.errors > baselineIn.errors + baselineOut.errors) reasons.push('execution errors increased');
  if (candidateIn.timeouts + candidateOut.timeouts > baselineIn.timeouts + baselineOut.timeouts) reasons.push('timeouts increased');
  if (candidateIn.securityViolations + candidateOut.securityViolations > 0) reasons.push('security violation detected');

  const candidateTokens = candidateIn.totalTokens + candidateOut.totalTokens;
  const baselineTokens = baselineIn.totalTokens + baselineOut.totalTokens;
  if (!withinRatio(candidateTokens, baselineTokens, limits.maxTokenRatio)) reasons.push('token budget exceeded');
  const candidateP95 = Math.max(candidateIn.p95DurationMs, candidateOut.p95DurationMs);
  const baselineP95 = Math.max(baselineIn.p95DurationMs, baselineOut.p95DurationMs);
  if (!withinRatio(candidateP95, baselineP95, limits.maxP95DurationRatio)) reasons.push('p95 duration budget exceeded');

  return { accepted: reasons.length === 0, deltaIn, deltaOut, reasons };
}

export function rankCandidates(a, b) {
  return b.decision.deltaOut - a.decision.deltaOut
    || b.decision.deltaIn - a.decision.deltaIn
    || (a.metrics.heldIn.errors + a.metrics.heldOut.errors) - (b.metrics.heldIn.errors + b.metrics.heldOut.errors)
    || (a.metrics.heldIn.totalTokens + a.metrics.heldOut.totalTokens) - (b.metrics.heldIn.totalTokens + b.metrics.heldOut.totalTokens)
    || Math.max(a.metrics.heldIn.p95DurationMs, a.metrics.heldOut.p95DurationMs)
      - Math.max(b.metrics.heldIn.p95DurationMs, b.metrics.heldOut.p95DurationMs);
}
