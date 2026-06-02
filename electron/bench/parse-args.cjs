/* eslint-disable no-console */
/**
 * Parse CLI flags passed after `--` from scripts/bench/run.mjs
 */
function parseBenchArgs(argv = process.argv.slice(2)) {
  const args = {
    provider: 'minimax',
    model: 'MiniMax-M2.7',
    mode: 'direct',
    grep: null,
    categories: null,
    caseId: null,
    concurrency: 1,
    timeoutMs: 60000,
    noJudge: false,
    keepData: false,
    seedOnly: false,
    dryRun: false,
    compare: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider' && argv[i + 1]) args.provider = argv[++i];
    else if (a === '--model' && argv[i + 1]) args.model = argv[++i];
    else if (a === '--mode' && argv[i + 1]) args.mode = argv[++i];
    else if (a === '--grep' && argv[i + 1]) args.grep = argv[++i];
    else if (a === '--category' && argv[i + 1]) {
      args.categories = argv[++i].split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    }
    else if (a === '--case' && argv[i + 1]) args.caseId = argv[++i];
    else if (a === '--concurrency' && argv[i + 1]) args.concurrency = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--timeout-ms' && argv[i + 1]) args.timeoutMs = Math.max(5000, Number(argv[++i]) || 60000);
    else if (a === '--no-judge') args.noJudge = true;
    else if (a === '--keep-data') args.keepData = true;
    else if (a === '--seed-only') args.seedOnly = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--compare') args.compare = true;
  }

  return args;
}

module.exports = { parseBenchArgs };
