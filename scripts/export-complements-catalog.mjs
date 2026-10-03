import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const categories = ['plugins', 'agents', 'workflows', 'skills', 'mcp'];
export function validateCatalog(catalog, repoRoot = root) {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.items)) throw new Error('Unsupported catalog schema');
  const seen = new Set();
  for (const item of catalog.items) {
    if (!categories.includes(item.category) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) throw new Error('Invalid catalog identity');
    if (item.slug !== item.id) throw new Error('Catalog slug must match installable identity');
    const key = `${item.category}/${item.id}`;
    if (seen.has(key)) throw new Error(`Duplicate ${key}`);
    seen.add(key);
    const index = JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', `${item.category}.json`), 'utf8'));
    const source = index.find((entry) => entry.id === item.id);
    if (!source || source.version !== item.version || source.name !== item.name || source.author !== item.author) throw new Error(`Catalog drift: ${key}`);
    const manifestPath = item.category === 'plugins'
      ? path.join(repoRoot, 'assets/plugins', item.id, 'manifest.json')
      : path.join(repoRoot, 'public', item.category, item.id, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.id !== item.id || manifest.version !== item.version) throw new Error(`Manifest drift: ${key}`);
    if (item.category === 'plugins' && JSON.stringify(manifest.permissions) !== JSON.stringify(item.permissions)) throw new Error(`Permission drift: ${key}`);
    for (const locale of ['es', 'en', 'fr', 'pt']) {
      const copy = item.locales?.[locale];
      if (copy?.permissionDescriptions?.length !== item.permissions.length) throw new Error(`Missing permission copy: ${key}/${locale}`);
      if (!copy?.description || !copy.body || !copy.useCases?.length || !copy.requirements?.length) throw new Error(`Missing copy: ${key}/${locale}`);
    }
  }
  return catalog;
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const catalog = validateCatalog(JSON.parse(fs.readFileSync(path.join(root, 'app/lib/marketplace/complements-catalog.json'), 'utf8')));
  const output = process.argv[2];
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Complements catalog validated: ${catalog.items.length} entries`);
}
