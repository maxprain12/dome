/* eslint-disable no-console */
/**
 * Electron headless entry for agent benchmark harness.
 * Usage: electron electron/bench/main.cjs [-- flags after -- from run.mjs]
 */
const path = require('path');
const os = require('os');

const { loadDotenv } = require('./load-env.cjs');
loadDotenv();

const benchUserData =
  process.env.DOME_BENCH_USER_DATA || path.join(os.homedir(), '.dome-bench');
process.env.DOME_BENCH_USER_DATA = benchUserData;
process.env.DOME_SKILLS_DIR = path.join(benchUserData, 'skills');
process.env.DOME_BENCH = '1';

const { app } = require('electron');
app.setPath('userData', benchUserData);
app.disableHardwareAcceleration();

const { parseBenchArgs } = require('./parse-args.cjs');
const { applyProviderSettings } = require('./provider-config.cjs');
const { seedFixtures } = require('./fixtures.cjs');
const {
  loadCaseFiles,
  expandCasesForMode,
  runCases,
} = require('./runner.cjs');
const {
  formatRunId,
  createRunDir,
  tryGitSha,
  writeManifest,
  finalizeRun,
} = require('./storage.cjs');

const database = require('../core/database.cjs');
const runEngine = require('../agents/run-engine.cjs');

async function main() {
  const args = parseBenchArgs(process.argv.slice(2));
  console.log('[Bench] userData:', benchUserData);
  console.log('[Bench] provider:', args.provider, 'model:', args.model);

  database.initDatabase();
  await runEngine.init(null, database, null);

  fsMkdirSkills();
  await seedFixtures({ force: !args.keepData });

  if (args.seedOnly) {
    console.log('[Bench] Seed complete (--seed-only)');
    app.exit(0);
    return;
  }

  if (!args.dryRun) {
    applyProviderSettings(args.provider, args.model);
  } else {
    console.log('[Bench] Dry run — skipping provider settings (no API calls)');
  }

  let cases = loadCaseFiles({
    grep: args.grep,
    categories: args.categories,
    caseId: args.caseId,
    modeFilter: args.mode === 'both' ? null : args.mode,
  });
  cases = expandCasesForMode(cases, args.mode);

  if (!cases.length) {
    const filters = [];
    if (args.caseId) filters.push(`--case ${args.caseId}`);
    if (args.grep) filters.push(`--grep ${args.grep}`);
    if (args.categories?.length) filters.push(`--category ${args.categories.join(',')}`);
    console.error(
      '[Bench] No cases matched.',
      filters.length ? `Filters: ${filters.join(' ')}` : '',
      'Use --grep with alternation (e.g. studio|ui|file) or --category studio,ui,file',
    );
    app.exit(1);
    return;
  }

  console.log(`[Bench] Running ${cases.length} case(s)...`);

  const runId = formatRunId();
  const runDir = createRunDir(runId);
  const { PROMPT_VERSION } = require('./bench-prompt.cjs');
  const manifest = {
    runId,
    startedAt: new Date().toISOString(),
    provider: args.provider,
    model: args.model,
    mode: args.mode,
    grep: args.grep,
    caseId: args.caseId,
    concurrency: args.concurrency,
    timeoutMs: args.timeoutMs,
    noJudge: args.noJudge,
    gitSha: tryGitSha(),
    promptVersion: PROMPT_VERSION,
    caseCount: cases.length,
  };
  writeManifest(runDir, manifest);

  let results = [];
  let fatalError = null;
  try {
    results = await runCases(cases, args, runDir);
  } catch (err) {
    fatalError = err;
    console.error('[Bench] Run interrupted:', err?.message || err);
  } finally {
    manifest.finishedAt = new Date().toISOString();
    manifest.interrupted = !!fatalError;
    manifest.completedCases = results.length;
    writeManifest(runDir, manifest);
    const summary = finalizeRun(runDir, manifest, results);
    console.log('[Bench] Done.');
    console.log('[Bench] Summary:', JSON.stringify(summary, null, 2));
    console.log('[Bench] Report:', path.join(runDir, 'report.md'));
    if (fatalError) console.error('[Bench] Fatal:', fatalError?.message || fatalError);
  }

  const hasHardFail =
    !!fatalError ||
    results.some((r) => !['PASS', 'SKIP', 'DRY_RUN'].includes(r.outcome));
  app.exit(hasHardFail ? 1 : 0);
}

function fsMkdirSkills() {
  const fs = require('fs');
  const skillsDir = process.env.DOME_SKILLS_DIR;
  if (!skillsDir) return;
  fs.mkdirSync(skillsDir, { recursive: true });
  const benchSkillDir = path.join(skillsDir, 'bench-runner');
  fs.mkdirSync(benchSkillDir, { recursive: true });
  const skillMd = path.join(benchSkillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    fs.writeFileSync(
      skillMd,
      '# bench-runner\n\nSkill de prueba para el harness de benchmark Dome.\n',
      'utf8',
    );
  }
}

app.whenReady().then(main).catch((err) => {
  console.error('[Bench] Fatal:', err);
  app.exit(1);
});
