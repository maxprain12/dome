import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
export const LAB_ROOT = path.join(REPO_ROOT, '.dome-self-harness');
export const EXPERIMENTS_ROOT = path.join(LAB_ROOT, 'experiments');
export const SCHEMA_VERSION = 1;
export const EVALUATOR_VERSION = 'dome-self-harness-v1';

export const PHASES = Object.freeze([
  'baseline',
  'mining',
  'proposing',
  'validating',
  'merging',
  'completed',
  'failed',
]);

export const EDITABLE_PREFIXES = Object.freeze([
  'packages/agent-core/src/',
  'packages/agent-core/test/',
  'packages/prompts/sections/',
  'packages/prompts/surfaces/',
  'packages/prompts/src/',
  'packages/tools/src/domains/',
  'shared/prompt-assembler/',
]);

export const EDITABLE_FILES = Object.freeze([
  'electron/agents/agent-runtime.cjs',
  'electron/agents/dome-harness-bridge.cjs',
  'electron/agents/subagents-native.cjs',
  'electron/tools/tool-call-policy.cjs',
  'electron/tools/tool-cap.cjs',
]);

export const DENIED_PREFIXES = Object.freeze([
  'scripts/self-harness/',
  'scripts/bench/',
  'electron/bench/',
  '.github/',
  'app/',
  'electron/ipc/',
  'packages/db/',
]);

export const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 8,
  maxChangedLines: 200,
  maxTokenRatio: 1.2,
  maxP95DurationRatio: 1.2,
  candidateTimeoutMs: 30 * 60 * 1000,
  benchTimeoutMs: 60_000,
  proposalSteps: 12,
});

export const DEFAULT_GATES = Object.freeze([
  ['pnpm', ['--filter', '@dome/agent-core', 'run', 'test']],
  ['pnpm', ['run', 'typecheck']],
  ['pnpm', ['run', 'lint']],
  ['pnpm', ['run', 'build']],
  ['pnpm', ['run', 'check:ipc-inventory']],
  ['pnpm', ['run', 'check:sonar-patterns']],
  ['pnpm', ['run', 'depcruise']],
]);
