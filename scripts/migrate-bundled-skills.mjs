/**
 * One-off: public/skills/<id>/manifest.json -> electron/skills/bundled/<id>/SKILL.md
 * Run: node scripts/migrate-bundled-skills.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicSkills = path.join(root, 'public', 'skills');
const outBase = path.join(root, 'electron', 'skills', 'bundled');

if (!fs.existsSync(publicSkills)) {
  console.error('Missing', publicSkills);
  process.exit(1);
}
const dirs = fs.readdirSync(publicSkills, { withFileTypes: true }).filter((d) => d.isDirectory());
let n = 0;
for (const d of dirs) {
  const id = d.name;
  const manPath = path.join(publicSkills, id, 'manifest.json');
  if (!fs.existsSync(manPath)) continue;
  const raw = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  const desc = String(raw.description || raw.name || id);
  const inst = String(raw.instructions || '').trim();
  const descYaml = desc.includes('\n') ? `description: |\n${desc.split('\n').map((l) => `  ${l}`).join('\n')}` : `description: ${JSON.stringify(desc)}`;
  const md = `---
name: ${id}
${descYaml}
version: ${JSON.stringify(String(raw.version || '1.0.0'))}
author: ${JSON.stringify(String(raw.author || 'Dome Team'))}
tags: ${JSON.stringify(raw.tags || [])}
category: ${JSON.stringify(String(raw.category || 'general'))}
---

${inst || `# ${id}\n\nAdd skill instructions in this file.`}
`;
  const outDir = path.join(outBase, id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'SKILL.md'), md, 'utf8');
  n += 1;
  console.log('Wrote', id);
}
console.log('Done,', n, 'skill(s)');
