#!/usr/bin/env node
/**
 * Build user prompt for OpenCode sonar-coverage agent.
 *
 * Usage: node scripts/sonar/build-opencode-coverage-prompt.mjs --batch=.quality-loop/batch.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchAllowedFiles, componentToRelativePath, parseArgs } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');

/** @param {string} batchPathArg */
export function buildOpencodeCoveragePrompt(batchPathArg = batchPath) {
  const resolved = path.isAbsolute(batchPathArg)
    ? batchPathArg
    : path.resolve(ROOT, batchPathArg);
  const batchPayload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const issues = batchPayload.batch || [];
  const allowed = [...batchAllowedFiles(batchPayload)].sort();

  const targets = issues
    .map((issue) => {
      const file = componentToRelativePath(String(issue.component || ''));
      const uncovered = issue.uncoveredLines != null ? ` (~${issue.uncoveredLines} uncovered lines)` : '';
      return `- \`${file}\`${uncovered}: ${issue.message || 'Add unit tests'}`;
    })
    .join('\n');

  return `Grow code coverage for these ${issues.length} file(s).

## Manifest (mandatory)

ALLOWED_FILES:
${allowed.map((f) => `- \`${f}\``).join('\n')}

FORBIDDEN:
- Touching files outside ALLOWED_FILES
- \`pnpm-lock.yaml\`, \`package.json\`, truncating large files
- Broad refactors or behavior changes in production code

## Targets

${targets || '_No targets._'}

## Workflow

1. Read each source target; find pure helpers / branches worth testing.
2. Add colocated tests (\`*.test.ts\` / \`*.test.tsx\` / \`electron/__tests__/*.test.mjs\`).
3. Mock IPC/Electron lightly; prefer deterministic unit tests.
4. Run \`bash scripts/jenkins/verify-batch-pr.sh\` until exit 0.

## Done when

Tests pass verify-batch-pr and the diff stays in ALLOWED_FILES.
`;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.stdout.write(buildOpencodeCoveragePrompt());
}
