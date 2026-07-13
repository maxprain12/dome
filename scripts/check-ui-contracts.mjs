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

if (violations.length > 0) {
  console.error('[ui-contracts] Violations found:');
  violations.forEach((violation) => console.error(`  ${violation}`));
  process.exit(1);
}

console.log('check:ui-contracts: OK');
