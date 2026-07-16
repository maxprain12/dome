#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strictRoots = ['app/components/ui', 'app/components/shared'];
const nativeIconRoots = ['app/components/settings'];
const redesignedSurfaceFiles = [
  'app/components/home/DashboardView.tsx',
  'app/components/home/ProjectsDashboard.tsx',
  'app/components/home/projects/ProjectCard.tsx',
  'app/components/search',
  'app/pages/HomePage.tsx',
];
const violations = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const checks = [
  { label: 'transition-all', pattern: /\btransition-all\b|transition\s*:\s*all/g },
  { label: 'space-x/space-y', pattern: /\b-?space-[xy]-[^\s"'`]+/g },
  { label: 'Lucide or Tabler import', pattern: /from\s+["'](?:lucide-react|@tabler\/icons-react)["']/g },
  { label: 'non-native icon contract', pattern: /lucide-adapter|\bLucide(?:Icon|Props)\b/g },
];

// App-wide: these four checks have zero legitimate exceptions anywhere in
// the codebase (verified clean 2026-07 after the icon/CSS purge), so they
// run unscoped instead of being limited to strictRoots.
for (const file of walk(path.join(root, 'app'))) {
  if (!/\.(?:ts|tsx|css|scss)$/.test(file) || /\.test\.[jt]sx?$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const check of checks) {
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${path.relative(root, file)}:${line} ${check.label}`);
    }
  }
}

for (const relativeRoot of nativeIconRoots) {
  for (const file of walk(path.join(root, relativeRoot))) {
    if (!/\.(?:ts|tsx)$/.test(file) || /\.test\.[jt]sx?$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const settingsChecks = [
      { label: 'raw Settings control', pattern: /<(?:button|input|select|textarea)\b/g },
      { label: 'legacy Settings stylesheet', pattern: /(?:ai-settings|settings-layout)\.css/g },
      { label: 'inline Settings style', pattern: /\bstyle\s*=\s*\{/g },
      { label: 'legacy Settings class', pattern: /\b(?:settings-(?:segmented|toggle-row|split-row|field-grid|action-row|choice-grid|provider-card)|ai-provider-picker__)\b/g },
      { label: 'native Settings alert/confirm', pattern: /\b(?:window\.)?(?:alert|confirm)\s*\(/g },
    ];
    for (const check of settingsChecks) {
      for (const match of source.matchAll(check.pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${path.relative(root, file)}:${line} ${check.label}`);
      }
    }
  }
}

for (const file of walk(path.join(root, 'app/components/shell'))) {
  if (!/\.(?:ts|tsx)$/.test(file) || /\.test\.[jt]sx?$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const shellChecks = [
    { label: 'raw shell control', pattern: /<(?:button|input|select|textarea)\b/g },
    { label: 'inline shell svg', pattern: /<svg\b/g },
  ];
  for (const check of shellChecks) {
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${path.relative(root, file)}:${line} ${check.label}`);
    }
  }
}

for (const relativePath of redesignedSurfaceFiles) {
  const absolutePath = path.join(root, relativePath);
  const files = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()
    ? walk(absolutePath)
    : [absolutePath];
  for (const file of files) {
    if (!fs.existsSync(file) || !/\.(?:ts|tsx)$/.test(file) || /\.test\.[jt]sx?$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const surfaceChecks = [
      { label: 'raw redesigned-surface control', pattern: /<(?:button|input|select|textarea)\b/g },
      { label: 'inline redesigned-surface style', pattern: /\bstyle\s*=\s*\{/g },
    ];
    for (const check of surfaceChecks) {
      for (const match of source.matchAll(check.pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${path.relative(root, file)}:${line} ${check.label}`);
      }
    }
  }
}

// ── !important: allowed only in files with a documented reason (vendor
// overrides, sandboxed/portaled DOM, native pseudo-elements). New files
// need to be added here deliberately, not silently pick it up. ──────────
const IMPORTANT_ALLOWED_FILES = new Set([
  'app/globals.css', // driver.js tour override, reduced-motion kill-switch, responsive shell panels
  'app/styles/folder-view.css', // FolderCard drag-preview is portaled outside the normal cascade
  'app/styles/github-view.css', // overrides DomeSegmentedControl's default flex-wrap
  'app/components/viewers/PptViewer.tsx', // styles the pptx-preview-rendered slide iframe content
  'app/components/viewers/SpreadsheetViewer.tsx', // sticky row-number column vs. table striping
  'app/pages/PptCapturePage.tsx', // pptx-preview capture window, same vendor-override reason
  'app/lib/chat/useDomeThemeSnapshot.ts', // beats hardcoded/rogue styles injected by model-generated HTML
  'app/lib/email/emailBodyParts.ts', // sandboxed email iframe body, no cascade from app theme
]);

for (const file of walk(path.join(root, 'app'))) {
  if (!/\.(?:ts|tsx|css|scss)$/.test(file) || /\.test\.[jt]sx?$/.test(file)) continue;
  const rel = path.relative(root, file);
  if (IMPORTANT_ALLOWED_FILES.has(rel)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/!important/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${rel}:${line} !important outside allowlist`);
  }
}

// ── Hand-rolled .dome-*/.hub-*/.lr-* BEM classes: allowed only in files
// already carrying a documented irreducible-CSS exception. ──────────────
const BEM_ALLOWED_FILES = new Set([
  'app/globals.css', // dome-tour-popover (driver.js), dome-ui-cursor-* (pointer overlay), dome-cmdk-preview
  'app/styles/folder-view.css',
  'app/styles/github-view.css',
  'app/styles/mention-textarea.css',
  'app/styles/email-view.css',
  'app/styles/learn.css', // .lr-* — Quiz/MindMap state-driven styling, see file header
]);

for (const file of walk(path.join(root, 'app'))) {
  if (!/\.(?:css|scss)$/.test(file)) continue;
  const rel = path.relative(root, file);
  if (BEM_ALLOWED_FILES.has(rel)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/^\.(?:dome|hub|lr)-[a-zA-Z0-9_-]+/gm)) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${rel}:${line} hand-rolled .dome-/.hub-/.lr- class outside allowlist`);
  }
}

// ── Orphaned .css/.scss files: every stylesheet under app/ must be
// imported from somewhere (a .ts/.tsx entry point or another stylesheet). ─
const allCssFiles = walk(path.join(root, 'app')).filter((f) => /\.(?:css|scss)$/.test(f));
const allSourceFiles = walk(path.join(root, 'app')).filter((f) => /\.(?:tsx?|css|scss)$/.test(f));
const importedCssBasenames = new Set();
for (const file of allSourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|@import\s+|import\s+)['"]([^'"]+\.(?:css|scss))['"]/g)) {
    importedCssBasenames.add(path.basename(match[1]));
  }
}
for (const file of allCssFiles) {
  const rel = path.relative(root, file);
  if (!importedCssBasenames.has(path.basename(file))) {
    violations.push(`${rel} orphaned stylesheet (not imported anywhere)`);
  }
}

if (violations.length > 0) {
  console.error('[ui-contracts] Violations found:');
  violations.forEach((violation) => console.error(`  ${violation}`));
  process.exit(1);
}

console.log('check:ui-contracts: OK');
