import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal/research/dependencies.json'), 'utf8'));
const notices = fs.readFileSync(path.join(root, 'electron/research/THIRD-PARTY-NOTICES.txt'), 'utf8');
const visited = new Set();
for (const entry of inventory.copiedAdapterCode || []) {
  if (!inventory.policy.includes(entry.license) || !/^[a-f0-9]{40}$/.test(entry.commit)) throw new Error('Unreviewed research source adaptation');
  if (!notices.includes(entry.commit) || !notices.includes(entry.copyright)) throw new Error('Missing adapted source attribution');
  for (const file of entry.adaptedFiles) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing adapted artifact: ${file}`);
}
function visit(name, from) {
  const resolver = createRequire(path.join(from, 'package.json'));
  const manifest = resolver.resolve.paths(name).map((folder) => path.join(folder, name, 'package.json')).find((file) => fs.existsSync(file));
  if (!manifest) throw new Error(`Missing research dependency: ${name}`);
  const folder = path.dirname(fs.realpathSync(manifest));
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const id = `${pkg.name}@${pkg.version}`;
  if (visited.has(id)) return;
  visited.add(id);
  if (!inventory.policy.includes(pkg.license)) throw new Error(`Disallowed research license: ${id}`);
  if (!inventory.dependencies.some((entry) => entry.name === pkg.name && entry.version === pkg.version && entry.license === pkg.license)) throw new Error(`Unaudited research artifact: ${id}`);
  if (!notices.includes(`${id} — ${pkg.license}`)) throw new Error(`Missing research notice: ${id}`);
  for (const dependency of Object.keys(pkg.dependencies || {})) visit(dependency, folder);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const direct = inventory.dependencies.find((entry) => entry.name === 'fast-xml-parser');
if (packageJson.dependencies['fast-xml-parser'] !== direct.version) throw new Error('Research parser must be pinned exactly');
visit('fast-xml-parser', root);
if (visited.size !== inventory.dependencies.length) throw new Error('Research inventory contains obsolete artifacts');
console.log(`Research licenses: ${visited.size} exact permissive artifacts, bundled notices present`);
