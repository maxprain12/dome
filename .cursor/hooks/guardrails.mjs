#!/usr/bin/env node
/**
 * Cursor hook: run fast UI/quality gates before git commit/push.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

let command = '';
try {
  command = String(JSON.parse(readStdin() || '{}').command || '');
} catch {
  command = '';
}

if (!/\bgit\s+(commit|push)\b/.test(command)) {
  process.stdout.write(`${JSON.stringify({ permission: 'allow' })}\n`);
  process.exit(0);
}

try {
  execSync('pnpm run check:guardrails', { stdio: 'inherit', cwd: repoRoot });
  process.stdout.write(`${JSON.stringify({ permission: 'allow' })}\n`);
  process.exit(0);
} catch {
  process.stdout.write(`${JSON.stringify({
    permission: 'deny',
    user_message: 'check:guardrails falló. Corrige los checks UI/i18n/Sonar antes de commit o push.',
    agent_message: 'Hook del repo: pnpm run check:guardrails rechazó el comando git.',
  })}\n`);
  process.exit(2);
}
