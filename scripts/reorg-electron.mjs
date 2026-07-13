#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-off (re-runnable) migration tool: move flat `electron/*.cjs` modules into
 * domain subfolders and rewrite every relative `require()/import` specifier
 * across `electron/**` and `scripts/**` so the require graph stays consistent.
 *
 * Deterministic + idempotent: it computes each file's NEW location, then for
 * every relative specifier recomputes the path from the file's new directory to
 * the target's new directory. Files already in their final location are left
 * alone. Anchors (main/preload/dome-mcp-bridge/paths) never move.
 *
 * Usage:
 *   node scripts/reorg-electron.mjs --domains=calendar,transcription   # move a subset
 *   node scripts/reorg-electron.mjs --all                              # move everything
 *   node scripts/reorg-electron.mjs --verify-only                      # only check specifiers resolve
 *   node scripts/reorg-electron.mjs --all --dry                        # print plan, no changes
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(ROOT, 'electron');

/** basename -> destination domain folder (relative to electron/). */
const DOMAIN_MAP = {
  // core (incl. cross-cutting database/window-manager/security)
  'init.cjs': 'core',
  'window-manager.cjs': 'core',
  'runtime-env.cjs': 'core',
  'deep-link-handler.cjs': 'core',
  'observability.cjs': 'core',
  'update-service.cjs': 'core',
  'install-devtools-extension.cjs': 'core',
  'database.cjs': 'core',
  'security.cjs': 'core',
  // ai
  'ai-settings.cjs': 'ai',
  'auto-metadata.cjs': 'ai',
  'llm-service.cjs': 'ai',
  'model-factory.cjs': 'ai',
  'model-params.cjs': 'ai',
  'message-multimodal.cjs': 'ai',
  'minimax-config.cjs': 'ai',
  'openai-key.cjs': 'ai',
  'openrouter-config.cjs': 'ai',
  'openrouter-models.cjs': 'ai',
  'provider-models.cjs': 'ai',
  'dome-provider-url.cjs': 'ai',
  // agents
  'agent-middleware.cjs': 'agents',
  'agent-runtime.cjs': 'agents',
  'agent-runtime-context.cjs': 'agents',
  'agent-store.cjs': 'agents',
  'async-subagents.cjs': 'agents',
  'automation-service.cjs': 'agents',
  'checkpointer.cjs': 'agents',
  'guardrails.cjs': 'agents',
  'harness-backend.cjs': 'agents',
  'harness-profiles.cjs': 'agents',
  'kb-llm-provision.cjs': 'agents',
  'kb-llm-shared.cjs': 'agents',
  'langgraph-agent.cjs': 'agents',
  'run-engine.cjs': 'agents',
  'subagent-specs.cjs': 'agents',
  'subagents.cjs': 'agents',
  // tools
  'ai-tools-extra.cjs': 'tools',
  'ai-tools-handler.cjs': 'tools',
  'browser-context-service.cjs': 'tools',
  'crop-image.cjs': 'tools',
  'docx-tools-handler.cjs': 'tools',
  'excel-tools-handler.cjs': 'tools',
  'exceljs-helpers.cjs': 'tools',
  'file-tree.cjs': 'tools',
  'ppt-tools-handler.cjs': 'tools',
  'tool-cap.cjs': 'tools',
  'tool-dispatcher.cjs': 'tools',
  'tool-input-normalize.cjs': 'tools',
  'tool-result-cap.cjs': 'tools',
  'tool-result-format.cjs': 'tools',
  'tool-selector.cjs': 'tools',
  // prompts
  'core-prompt-loader.cjs': 'prompts',
  'prompt-budget.cjs': 'prompts',
  'prompt-sections.cjs': 'prompts',
  'prompts-loader.cjs': 'prompts',
  'system-prompt.cjs': 'prompts',
  // documents
  'document-extractor.cjs': 'documents',
  'document-generator.cjs': 'documents',
  'document-staging.cjs': 'documents',
  'docx-converter.cjs': 'documents',
  'notebook-python.cjs': 'documents',
  'pdf-extractor.cjs': 'documents',
  'ppt-slide-extractor.cjs': 'documents',
  'ppt-spec-pptxgen.cjs': 'documents',
  'pptx-normalize.cjs': 'documents',
  'pptx-validate.cjs': 'documents',
  'thumbnail.cjs': 'documents',
  // transcription
  'audio-playback.cjs': 'transcription',
  'streaming-tts.cjs': 'transcription',
  'transcription-note-helper.cjs': 'transcription',
  'transcription-recovery.cjs': 'transcription',
  'transcription-service.cjs': 'transcription',
  'transcription-session.cjs': 'transcription',
  'transcription-shortcut.cjs': 'transcription',
  'transcription-structured.cjs': 'transcription',
  'tts-service.cjs': 'transcription',
  // calendar
  'calendar-import-service.cjs': 'calendar',
  'calendar-notification-service.cjs': 'calendar',
  'calendar-service.cjs': 'calendar',
  'calendar-sync-scheduler.cjs': 'calendar',
  'google-calendar-service.cjs': 'calendar',
  // mcp (dome-mcp-bridge stays an anchor in root)
  'dome-mcp-server.cjs': 'mcp',
  'mcp-client.cjs': 'mcp',
  'mcp-oauth.cjs': 'mcp',
  'mcp-tool-policy.cjs': 'mcp',
  // artifacts
  'artifact-design-layout.cjs': 'artifacts',
  'artifact-index-sync.cjs': 'artifacts',
  'artifact-link-sync.cjs': 'artifacts',
  'artifact-serialize.cjs': 'artifacts',
  'artifact-sink.cjs': 'artifacts',
  // storage
  'cloud-sync-service.cjs': 'storage',
  'file-storage.cjs': 'storage',
  'hybrid-rrf.cjs': 'storage',
  'semantic-index-scheduler.cjs': 'storage',
  // auth
  'auth-manager.cjs': 'auth',
  'dome-oauth.cjs': 'auth',
  // ollama
  'ollama-manager.cjs': 'ollama',
  'ollama-manager-lazy.cjs': 'ollama',
  'ollama-service.cjs': 'ollama',
  // marketplace
  'github-client.cjs': 'marketplace',
  'marketplace-bundled-catalog.cjs': 'marketplace',
  'marketplace-config.cjs': 'marketplace',
  'plugin-loader.cjs': 'marketplace',
  'skills-bootstrap.cjs': 'marketplace',
  // feeders
  'html-content-extractor.cjs': 'feeders',
  'web-scraper.cjs': 'feeders',
  'youtube-service.cjs': 'feeders',
  // personality
  'personality-loader.cjs': 'personality',
  'project-memory.cjs': 'personality',
};

/** Files that must never move (Electron entry, preload bridge, asar-hardcoded bridge, path helper). */
const ANCHORS = new Set(['main.cjs', 'preload.cjs', 'dome-mcp-bridge.cjs', 'paths.cjs']);

/**
 * Generated-at-build files that live at `electron/` root but may not exist on
 * disk during migration (written by scripts/embed-env.cjs). Treated as present
 * at electron/ root so their requires get rewritten correctly.
 */
const GENERATED_AT_ELECTRON_ROOT = new Set(['app-credentials.cjs']);

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagVal = (name) => {
  const f = flag(name);
  if (!f) return null;
  const eq = f.indexOf('=');
  return eq >= 0 ? f.slice(eq + 1) : '';
};
const DRY = !!flag('dry');
const VERIFY_ONLY = !!flag('verify-only');
const ALL = !!flag('all');
const selectedDomains = (() => {
  if (ALL) return new Set(Object.values(DOMAIN_MAP));
  const v = flagVal('domains');
  if (!v) return new Set();
  return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
})();

// ---------------------------------------------------------------------------
// file scan
// ---------------------------------------------------------------------------
const SCAN_EXT = new Set(['.cjs', '.mjs', '.js']);

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (SCAN_EXT.has(path.extname(ent.name))) acc.push(full);
  }
  return acc;
}

function scanFiles() {
  const files = [];
  walk(ELECTRON, files);
  walk(path.join(ROOT, 'scripts'), files);
  return files;
}

// ---------------------------------------------------------------------------
// path mapping
// ---------------------------------------------------------------------------
/** Where does this absolute path live AFTER this run's moves? */
function newAbsOf(absOld) {
  const rel = path.relative(ELECTRON, absOld);
  // Only files DIRECTLY under electron/ (no subdir) are move candidates.
  if (rel.includes(path.sep)) return absOld;
  const base = rel;
  if (ANCHORS.has(base)) return absOld;
  const domain = DOMAIN_MAP[base];
  if (!domain) return absOld;
  if (!selectedDomains.has(domain)) return absOld;
  return path.join(ELECTRON, domain, base);
}

function toSpecifier(fromDir, toAbs) {
  let r = path.relative(fromDir, toAbs);
  if (!r.startsWith('.')) r = `./${r}`;
  return r.split(path.sep).join('/');
}

/** Resolve a relative specifier to an absolute file path (best-effort, OLD layout). */
function resolveSpecifier(fromDirOld, spec) {
  const base = path.resolve(fromDirOld, spec);
  const candidates = [
    base,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.js`,
    path.join(base, 'index.cjs'),
    path.join(base, 'index.mjs'),
    path.join(base, 'index.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  // Generated-at-build files that don't exist yet but have a known home.
  const baseName = path.basename(base.endsWith('.cjs') ? base : `${base}.cjs`);
  if (GENERATED_AT_ELECTRON_ROOT.has(baseName)) {
    return path.join(ELECTRON, baseName);
  }
  return null; // unresolved (e.g., a dir target) → leave untouched
}

const SPEC_RE = /(\brequire\(\s*|\bfrom\s*|\bimport\(\s*)(['"])(\.[^'"]+)\2/g;

function rewriteContent(absOld, text) {
  const fromDirOld = path.dirname(absOld);
  const fromDirNew = path.dirname(newAbsOf(absOld));
  return text.replace(SPEC_RE, (full, head, q, spec) => {
    const targetOld = resolveSpecifier(fromDirOld, spec);
    if (!targetOld) return full; // can't resolve → don't touch
    const targetNew = newAbsOf(targetOld);
    // preserve original extension presence: rebuild specifier to the resolved file
    let newSpec = toSpecifier(fromDirNew, targetNew);
    // keep the original lacking/having extension? We always point at the real
    // file (with extension), which is what every electron require already does.
    return `${head}${q}${newSpec}${q}`;
  });
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------
function verify() {
  const files = scanFiles();
  let missing = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const dir = path.dirname(f);
    let m;
    SPEC_RE.lastIndex = 0;
    while ((m = SPEC_RE.exec(text))) {
      const spec = m[3];
      const resolved = resolveSpecifier(dir, spec);
      if (!resolved) {
        // Only report specifiers that look like local electron/scripts files.
        const guess = path.resolve(dir, spec);
        if (guess.startsWith(ELECTRON) || guess.startsWith(path.join(ROOT, 'scripts')) || guess.startsWith(path.join(ROOT, 'shared'))) {
          console.error(`  MISSING: ${path.relative(ROOT, f)} -> ${spec}`);
          missing += 1;
        }
      }
    }
  }
  if (missing) {
    console.error(`\nVERIFY FAILED: ${missing} unresolved local specifier(s).`);
    process.exit(1);
  }
  console.log('VERIFY OK: all relative specifiers resolve.');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
if (VERIFY_ONLY) {
  verify();
  process.exit(0);
}

if (selectedDomains.size === 0) {
  console.error('Nothing to do: pass --domains=a,b,c or --all (or --verify-only).');
  process.exit(1);
}

const files = scanFiles();
const moves = []; // { from, to }
for (const f of files) {
  const to = newAbsOf(f);
  if (to !== f) moves.push({ from: f, to });
}

console.log(`Domains: ${[...selectedDomains].sort().join(', ')}`);
console.log(`Files to move: ${moves.length}`);
for (const mv of moves) {
  console.log(`  ${path.relative(ROOT, mv.from)}  ->  ${path.relative(ROOT, mv.to)}`);
}

if (DRY) {
  console.log('\n--dry: no changes written.');
  process.exit(0);
}

// 1. compute rewritten content for every scanned file (based on this run's moves)
const newContents = new Map();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const rewritten = rewriteContent(f, text);
  newContents.set(f, rewritten);
}

// 2. git mv the moved files (create dirs first)
for (const mv of moves) {
  const dir = path.dirname(mv.to);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    execSync(`git mv "${path.relative(ROOT, mv.from)}" "${path.relative(ROOT, mv.to)}"`, { cwd: ROOT, stdio: 'pipe' });
  } catch {
    // not tracked / not a git repo → plain rename
    fs.renameSync(mv.from, mv.to);
  }
}

// 3. write rewritten content to each file's NEW location
const moveByFrom = new Map(moves.map((m) => [m.from, m.to]));
for (const f of files) {
  const dest = moveByFrom.get(f) ?? f;
  fs.writeFileSync(dest, newContents.get(f), 'utf8');
}

console.log('\nMove + rewrite complete. Verifying...');
verify();
