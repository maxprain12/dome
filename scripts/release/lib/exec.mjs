import { spawnSync } from 'node:child_process';

export function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
    ...opts,
  });
  if (res.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')} (exit ${res.status})`);
}

export function capture(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}
