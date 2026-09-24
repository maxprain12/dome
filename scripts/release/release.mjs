import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PLATFORM, ROOT } from './lib/config.mjs';

const extra = process.argv.slice(2);

function has(name) {
  return extra.includes(name);
}

function run(script, args) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts/release', script), ...args], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

if (!PLATFORM) {
  console.error(`Sistema no soportado: ${process.platform}`);
  process.exit(1);
}

run('build.mjs', extra);
const publishArgs = ['--platform', PLATFORM];
if (!has('--channel')) publishArgs.push('--channel', 'latest');
if (!has('--staging')) publishArgs.push('--staging', '100');
publishArgs.push(...extra);
run('publish.mjs', publishArgs);
console.log(`Listo en ${PLATFORM}. El feed de esta plataforma ya apunta a esta versión.`);
