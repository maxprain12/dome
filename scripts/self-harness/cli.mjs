#!/usr/bin/env node
import {
  createExperiment,
  inspectExperiment,
  promoteExperiment,
  runExperiment,
  writeReport,
} from './controller.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--') continue;
    if (!item.startsWith('--')) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function number(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, got ${value}`);
  return parsed;
}

function requireArg(args, name) {
  if (!args[name]) throw new Error(`Missing required --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  return args[name];
}

function printHelp() {
  console.log(`Dome Self-Harness CLI

Commands:
  init     --provider <id> --model <id> [--id <id>] [--seed <seed>]
  run      --experiment <id> [--rounds 5] [--width 4] [--repeats 2]
  resume   --experiment <id> [same options as run]
  report   --experiment <id> [--keep-worktrees]
  promote  --experiment <id> [--branch feat/name]
  status   --experiment <id>

Development-only options:
  --mock-proposals <json>  Read deterministic proposals instead of calling a model.
  --skip-gates             Skip static gates; intended only for controller tests.`);
}

async function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  if (!command || command === 'help' || args.help) {
    printHelp();
    return;
  }

  if (command === 'init') {
    const result = createExperiment({
      provider: requireArg(args, 'provider'),
      model: requireArg(args, 'model'),
      id: args.id,
      seed: args.seed,
      baseSha: args.baseSha,
      baseUrl: args.baseUrl,
      rounds: number(args.rounds, 5),
      width: number(args.width, 4),
      repeats: number(args.repeats, 2),
      concurrency: number(args.concurrency, 1),
      heldOutRatio: number(args.heldOutRatio, 0.3),
      maxTokens: number(args.maxTokens, null),
      maxCostUsd: number(args.maxCostUsd, null),
    });
    console.log(`Created experiment ${result.manifest.id}`);
    console.log(`State: ${result.dir}`);
    console.log(`Held-in: ${result.manifest.splits.heldIn.length}; held-out: ${result.manifest.splits.heldOut.length}`);
    return;
  }

  const experiment = requireArg(args, 'experiment');
  if (command === 'run' || command === 'resume') {
    const result = await runExperiment(experiment, {
      rounds: number(args.rounds, undefined),
      width: number(args.width, undefined),
      repeats: number(args.repeats, undefined),
      mockProposals: args.mockProposals,
      skipGates: Boolean(args.skipGates),
      force: Boolean(args.force),
    });
    console.log(`Experiment ${experiment}: ${result.state.phase}`);
    console.log(`Rounds: ${result.state.round}; promoted edits: ${result.state.lineage.length}`);
    return;
  }

  if (command === 'report') {
    const reportPath = writeReport(experiment, { cleanup: !args.keepWorktrees });
    console.log(`Report: ${reportPath}`);
    return;
  }

  if (command === 'promote') {
    const result = await promoteExperiment(experiment, { branch: args.branch });
    console.log(`Created review branch ${result.branch} at ${result.commit}`);
    return;
  }

  if (command === 'status') {
    const { manifest, state, dir } = inspectExperiment(experiment);
    console.log(JSON.stringify({ dir, manifest, state }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`[self-harness] ${error.message}`);
  process.exitCode = 1;
});
