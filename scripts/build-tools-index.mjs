#!/usr/bin/env node
/** Concatenate core tool sections — kept for bench backward compat and quick reads. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.join(__dirname, '../prompts/martin/core');
const order = [
  'reference-stub.txt',
  'tool-guardrails.txt',
  'tool-surface.txt',
  'output-format.txt',
  'tool-format.txt',
  'tool-catalog.txt',
  'filesystem-rules.txt',
  'async-subagents.txt',
];

const parts = order.map((f) => fs.readFileSync(path.join(coreDir, f), 'utf8').trim());
const out = parts.join('\n\n---\n\n') + '\n';
fs.writeFileSync(path.join(__dirname, '../prompts/martin/tools.txt'), out);
console.log('[build:tools-index] wrote prompts/martin/tools.txt', out.length, 'chars');
