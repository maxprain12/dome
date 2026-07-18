/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getRepoRoot() {
  return path.join(__dirname, '../..');
}

function formatRunId(date = new Date()) {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

function createRunDir(runId, outputRoot = null) {
  const dir = outputRoot ? path.resolve(outputRoot, runId) : path.join(getRepoRoot(), 'docs/bench/runs', runId);
  fs.mkdirSync(path.join(dir, 'cases'), { recursive: true });
  return dir;
}

function tryGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: getRepoRoot(),
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function writeManifest(runDir, manifest) {
  writeJson(path.join(runDir, 'manifest.json'), manifest);
}

function writeCaseResult(runDir, caseResult) {
  const safeName = caseResult.caseId.replace(/[/\\]/g, '_');
  writeJson(path.join(runDir, 'cases', `${safeName}.json`), caseResult);
}

function buildSummary(results) {
  const total = results.length;
  const passed = results.filter((r) => r.outcome === 'PASS').length;
  const skipped = results.filter((r) => r.outcome === 'SKIP').length;
  const failed = results.filter(
    (r) => !['PASS', 'SKIP', 'DRY_RUN'].includes(r.outcome),
  );
  const scores = results
    .map((r) => r.validation?.judge?.score)
    .filter((s) => typeof s === 'number');
  const durations = results.map((r) => r.durationMs).filter((d) => typeof d === 'number');
  const tokens = results
    .map((r) => r.usage?.totalTokens)
    .filter((t) => typeof t === 'number');

  const byOutcome = {};
  for (const r of results) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
  }

  const toolsFailed = {};
  for (const r of failed) {
    const t = r.tool || r.caseId;
    toolsFailed[t] = (toolsFailed[t] || 0) + 1;
  }

  return {
    total,
    passed,
    skipped,
    failed: total - passed - skipped,
    pass_rate: total ? Number((passed / total).toFixed(4)) : 0,
    avg_score: scores.length
      ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
      : null,
    avg_duration_ms: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    avg_tokens: tokens.length
      ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)
      : null,
    by_outcome: byOutcome,
    tools_failed: toolsFailed,
  };
}

function buildReportMd(results, summary, manifest) {
  const lines = [
    '# Bench Agent Report',
    '',
    `**Run:** ${manifest.runId}`,
    `**Provider:** ${manifest.provider} / ${manifest.model}`,
    `**Prompt version:** ${manifest.promptVersion || 'n/a'}`,
    `**Git:** ${manifest.gitSha || 'n/a'}`,
    `**Cases:** ${summary.total} | **Pass:** ${summary.passed} | **Fail:** ${summary.failed} | **Skip:** ${summary.skipped}`,
    `**Pass rate:** ${(summary.pass_rate * 100).toFixed(1)}%`,
    summary.avg_score != null ? `**Avg judge score:** ${summary.avg_score}/5` : '',
    summary.avg_duration_ms != null ? `**Avg duration:** ${summary.avg_duration_ms}ms` : '',
    '',
    '| # | Case | Tool | Mode | Tools used | Structural | Judge | ms | Tokens | Outcome |',
    '|---|------|------|------|------------|------------|-------|-----|--------|---------|',
  ].filter(Boolean);

  results.forEach((r, i) => {
    const struct = r.validation?.structural?.pass ? 'OK' : 'FAIL';
    const judgeScore = r.validation?.judge?.score;
    const judge = judgeScore != null ? `${judgeScore}/5` : (r.validation?.judge?.skipped ? 'skip' : '-');
    const tools = (r.toolsCalled || []).slice(0, 3).join(', ') + ((r.toolsCalled?.length || 0) > 3 ? '…' : '');
    lines.push(
      `| ${i + 1} | ${r.caseId} | ${r.tool || '-'} | ${r.mode || '-'} | ${tools || '-'} | ${struct} | ${judge} | ${r.durationMs ?? '-'} | ${r.usage?.totalTokens ?? '-'} | ${r.outcome} |`,
    );
  });

  return `${lines.join('\n')}\n`;
}

function buildFailuresMd(results, runId) {
  const failed = results.filter((r) => !['PASS', 'SKIP'].includes(r.outcome));
  if (!failed.length) return '# Failures\n\nNo failures.\n';

  const lines = ['# Failures', '', `Run: \`${runId}\``, ''];
  for (const r of failed) {
    lines.push(`## ${r.caseId}`);
    lines.push(`- **Outcome:** ${r.outcome}`);
    lines.push(`- **Tool expected:** ${(r.expectedTools || []).join(', ')}`);
    lines.push(`- **Tools called:** ${(r.toolsCalled || []).join(', ') || '(none)'}`);
    if (r.error) lines.push(`- **Error:** ${r.error}`);
    if (r.validation?.structural?.reason) {
      lines.push(`- **Structural:** ${r.validation.structural.reason}`);
    }
    if (r.validation?.judge?.reasoning) {
      lines.push(`- **Judge:** ${r.validation.judge.reasoning}`);
    }
    const preview = (r.finalText || '').slice(0, 400);
    if (preview) lines.push('', '```', preview, '```');
    lines.push('', `Full trace: \`docs/bench/runs/${runId}/cases/${r.caseId.replace(/[/\\]/g, '_')}.json\``, '');
  }
  return `${lines.join('\n')}\n`;
}

function finalizeRun(runDir, manifest, results) {
  const summary = {
    ...buildSummary(results),
    promptVersion: manifest.promptVersion || null,
    runId: manifest.runId,
  };
  writeJson(path.join(runDir, 'summary.json'), summary);
  writeJson(path.join(runDir, 'results.json'), results);
  fs.writeFileSync(path.join(runDir, 'report.md'), buildReportMd(results, summary, manifest), 'utf-8');
  fs.writeFileSync(path.join(runDir, 'failures.md'), buildFailuresMd(results, manifest.runId), 'utf-8');
  return summary;
}

module.exports = {
  formatRunId,
  createRunDir,
  tryGitSha,
  writeManifest,
  writeCaseResult,
  finalizeRun,
  buildSummary,
  getRepoRoot,
};
