/* eslint-disable no-console */
/**
 * CLI flags for scripts/sonar/run-agent.mjs (after `--`).
 */
function parseSonarLoopArgs(argv = []) {
  const args = {
    provider: process.env.SONAR_LOOP_PROVIDER || 'minimax',
    model: process.env.SONAR_LOOP_MODEL || 'MiniMax-M3',
    batch: '.quality-loop/batch.json',
    repoRoot: process.cwd(),
    timeoutMs: Number(process.env.SONAR_LOOP_TIMEOUT_MS) || 900_000,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider' && argv[i + 1]) args.provider = argv[++i];
    else if (a === '--model' && argv[i + 1]) args.model = argv[++i];
    else if (a === '--batch' && argv[i + 1]) args.batch = argv[++i];
    else if (a === '--repo-root' && argv[i + 1]) args.repoRoot = argv[++i];
    else if (a === '--timeout-ms' && argv[i + 1]) {
      args.timeoutMs = Math.max(60_000, Number(argv[++i]) || args.timeoutMs);
    } else if (a === '--dry-run') args.dryRun = true;
  }

  return args;
}

module.exports = { parseSonarLoopArgs };
