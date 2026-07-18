/* eslint-disable no-console */

const VALUE_ARG_HANDLERS = new Map([
  ['--provider', (args, value) => { args.provider = value; }],
  ['--model', (args, value) => { args.model = value; }],
  ['--mode', (args, value) => { args.mode = value; }],
  ['--grep', (args, value) => { args.grep = value; }],
  ['--category', (args, value) => {
    args.categories = value.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  }],
  ['--case', (args, value) => { args.caseId = value; }],
  ['--concurrency', (args, value) => { args.concurrency = Math.max(1, Number(value) || 1); }],
  ['--timeout-ms', (args, value) => { args.timeoutMs = Math.max(5000, Number(value) || 60000); }],
]);

const BOOLEAN_ARG_PROPERTIES = new Map([
  ['--no-judge', 'noJudge'],
  ['--keep-data', 'keepData'],
  ['--seed-only', 'seedOnly'],
  ['--dry-run', 'dryRun'],
  ['--compare', 'compare'],
]);

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
    const arg = argv[i];
    const valueHandler = VALUE_ARG_HANDLERS.get(arg);
    if (valueHandler && argv[i + 1]) {
      valueHandler(args, argv[++i]);
      continue;
    }

    const booleanProperty = BOOLEAN_ARG_PROPERTIES.get(arg);
    if (booleanProperty) args[booleanProperty] = true;
  }

  return args;
}

module.exports = { parseBenchArgs };
