import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectArtifacts } from './lib/artifacts.mjs';
import { PLATFORM, ROOT, buildKeysFor, loadReleaseEnv, requireKeys } from './lib/config.mjs';
import { capture, run } from './lib/exec.mjs';
import { preflightGit } from './lib/git.mjs';

function flag(name) {
  return process.argv.includes(name);
}

function assertToolchain(unsigned) {
  const node = process.version;
  if (!node.startsWith('v24')) throw new Error(`Se necesita Node 24, hay ${node}`);
  const pnpm = capture('pnpm', ['--version']);
  if (pnpm !== '11.8.0') throw new Error(`Se necesita pnpm 11.8.0, hay ${pnpm}`);
  if (PLATFORM === 'mac' && !unsigned) {
    const identities = capture('security', ['find-identity', '-v', '-p', 'codesigning']);
    if (!identities.includes('Developer ID Application')) {
      throw new Error('No hay un certificado Developer ID Application en el llavero.');
    }
    capture('xcrun', ['notarytool', '--version']);
  }
  if (PLATFORM === 'linux') {
    capture('flatpak-builder', ['--version']);
    try {
      capture('flatpak', ['info', '--user', 'org.electronjs.Electron2.BaseApp//24.08']);
    } catch {
      throw new Error(
        'Falta el runtime Flatpak. Instala: flatpak install --user -y flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08 org.electronjs.Electron2.BaseApp//24.08',
      );
    }
  }
}

function builderArgs(unsigned) {
  if (PLATFORM === 'mac') {
    const args = ['--mac', '--arm64', '--x64'];
    if (unsigned) args.push('--config.mac.identity=null', '--config.mac.notarize=false');
    return args;
  }
  if (PLATFORM === 'win') return ['--win'];
  if (PLATFORM === 'linux') return ['--linux', 'AppImage', 'flatpak'];
  throw new Error(`Sistema no soportado: ${process.platform}`);
}

async function uploadStaging(version, files, manifestPath, force) {
  const { createClient, headSha512, uploadFile } = await import('./lib/s3.mjs');
  const client = createClient({
    endpoint: process.env.RELEASE_S3_ENDPOINT,
    region: process.env.RELEASE_S3_REGION,
    accessKeyId: process.env.RELEASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.RELEASE_S3_SECRET_KEY,
  });
  const bucket = process.env.RELEASE_S3_BUCKET_STAGING;
  for (const file of files) {
    const key = `v${version}/${PLATFORM}/${file.name}`;
    const existing = await headSha512(client, bucket, key);
    if (existing === file.sha512) {
      console.log(`sin cambios ${key}`);
      continue;
    }
    if (existing && !force) {
      throw new Error(`${key} ya existe con otro sha512. Usa --force solo si quieres sustituirlo.`);
    }
    await uploadFile(client, bucket, key, file.path, {
      sha512: file.sha512,
      cacheControl: 'public, max-age=31536000, immutable',
    });
    console.log(`subido ${key}`);
  }
  const manifestName = path.basename(manifestPath);
  await uploadFile(client, bucket, `v${version}/${manifestName}`, manifestPath, {
    sha512: 'manifest',
    contentType: 'application/json',
    cacheControl: 'public, max-age=60',
  });
}

async function main() {
  const unsigned = flag('--unsigned');
  const noUpload = flag('--no-upload');
  const skipInstall = flag('--skip-install');
  const force = flag('--force');
  loadReleaseEnv();
  if (!PLATFORM) throw new Error(`Sistema no soportado: ${process.platform}`);
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const { tag, commit } = preflightGit(pkg.version);
  assertToolchain(unsigned);
  requireKeys(buildKeysFor(PLATFORM, { unsigned, upload: !noUpload }));
  if (PLATFORM === 'mac' && unsigned) process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

  const releaseDir = path.join(ROOT, 'release');
  rmSync(releaseDir, { recursive: true, force: true });
  if (!skipInstall) run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: ROOT });
  run('pnpm', ['run', 'bootstrap:release-deps'], { cwd: ROOT });
  run('pnpm', ['run', 'materialize:workspace-deps'], { cwd: ROOT });
  run('pnpm', ['run', 'build'], { cwd: ROOT });
  run('pnpm', ['run', 'verify:workspace-deps'], { cwd: ROOT });
  run('pnpm', ['run', 'verify:natives'], { cwd: ROOT });
  run('node', ['scripts/embed-env.cjs'], { cwd: ROOT });
  run('node', ['scripts/verify-sentry-build.cjs'], { cwd: ROOT });
  run('pnpm', ['exec', 'cross-env', 'DEBUG=', 'electron-builder', ...builderArgs(unsigned), '--publish', 'never'], { cwd: ROOT });

  const files = await collectArtifacts(releaseDir, PLATFORM);
  const yml = { mac: 'latest-mac.yml', win: 'latest.yml', linux: 'latest-linux.yml' }[PLATFORM];
  if (!files.some((file) => file.name === yml)) throw new Error(`Falta ${yml} en release/`);
  if (!files.some((file) => assetIsInstaller(file.name))) throw new Error('No hay instaladores en release/');

  const electronPkg = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/electron/package.json'), 'utf8'));
  const manifest = {
    version: pkg.version,
    tag,
    commit,
    platform: PLATFORM,
    files: files.map(({ name, size, sha512 }) => ({ name, size, sha512 })),
    signed: !unsigned,
    notarized: PLATFORM === 'mac' && !unsigned,
    node: process.version,
    electron: electronPkg.version,
    host: os.hostname(),
    builtAt: new Date().toISOString(),
  };
  const manifestPath = path.join(releaseDir, `build-manifest-${PLATFORM}.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (!noUpload) await uploadStaging(pkg.version, files, manifestPath, force);
  console.log(`Listo ${PLATFORM} ${tag} (${files.length} archivos).`);
  console.log('Siguiente paso: release:build en las otras plataformas y después release:publish.');
}

function assetIsInstaller(name) {
  return /\.(dmg|exe|AppImage|flatpak)$/.test(name);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
