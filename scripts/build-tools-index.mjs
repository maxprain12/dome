#!/usr/bin/env node
/** Concatenate core tool sections — bench backward compat and quick reads. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.join(__dirname, '../packages/prompts/sections');
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
const outPath = path.join(coreDir, 'tools-index.txt');
fs.writeFileSync(outPath, out);
console.log('[build:tools-index] wrote packages/prompts/sections/tools-index.txt', out.length, 'chars');
