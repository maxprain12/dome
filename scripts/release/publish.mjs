import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractSection } from './lib/changelog.mjs';
import { ROOT, loadReleaseEnv, requireKeys, UPLOAD_KEYS, PUBLISH_KEYS } from './lib/config.mjs';
import { run } from './lib/exec.mjs';
import {
  assetArch,
  assetKind,
  feedFileName,
  parseUpdateYml,
  rewriteForFeed,
  stringifyUpdateYml,
  upsertIndex,
  validateBuildManifests,
} from './lib/manifests.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

function flag(name) {
  return process.argv.includes(name);
}

const YML_BY_PLATFORM = { mac: 'latest-mac.yml', win: 'latest.yml', linux: 'latest-linux.yml' };

async function main() {
  loadReleaseEnv();
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = option('--version', pkg.version);
  const channel = option('--channel', 'beta');
  const staging = Number(option('--staging', '10'));
  const dryRun = flag('--dry-run');
  const bridge = flag('--github-bridge');
  const bridgeOnly = flag('--bridge-only');
  if (!['beta', 'latest'].includes(channel)) throw new Error('--channel debe ser beta o latest');
  if (!Number.isFinite(staging) || staging < 0 || staging > 100) throw new Error('--staging debe estar entre 0 y 100');

  const keys = bridgeOnly ? UPLOAD_KEYS : [...UPLOAD_KEYS, ...PUBLISH_KEYS];
  requireKeys(keys);
  const { createClient, getText, putText, copyViaStream } = await import('./lib/s3.mjs');
  const stagingClient = createClient({
    endpoint: process.env.RELEASE_S3_ENDPOINT,
    region: process.env.RELEASE_S3_REGION,
    accessKeyId: process.env.RELEASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.RELEASE_S3_SECRET_KEY,
  });
  const publicClient = bridgeOnly ? null : createClient({
    endpoint: process.env.RELEASE_PUBLIC_S3_ENDPOINT,
    region: process.env.RELEASE_PUBLIC_S3_REGION,
    accessKeyId: process.env.RELEASE_PUBLIC_S3_ACCESS_KEY,
    secretAccessKey: process.env.RELEASE_PUBLIC_S3_SECRET_KEY,
  });
  const stagingBucket = process.env.RELEASE_S3_BUCKET_STAGING;
  const publicBucket = process.env.RELEASE_S3_BUCKET_PUBLIC;

  const manifests = [];
  for (const platform of ['mac', 'win', 'linux']) {
    const raw = await getText(stagingClient, stagingBucket, `v${version}/build-manifest-${platform}.json`);
    if (!raw) throw new Error(`No está v${version}/build-manifest-${platform}.json en staging`);
    manifests.push(JSON.parse(raw));
  }
  validateBuildManifests(manifests, version);
  const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const notes = extractSection(changelog, version);
  if (!notes) throw new Error(`Añade la sección [${version}] a CHANGELOG.md`);

  if (bridge || bridgeOnly) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dome-release-'));
    const names = [];
    for (const manifest of manifests) {
      for (const file of manifest.files) {
        const text = file.name.endsWith('.yml')
          ? await getText(stagingClient, stagingBucket, `v${version}/${manifest.platform}/${file.name}`)
          : null;
        const dest = path.join(dir, file.name);
        if (text != null) writeFileSync(dest, text);
        else {
          const { GetObjectCommand } = await import('@aws-sdk/client-s3');
          const { pipeline } = await import('node:stream/promises');
          const { createWriteStream } = await import('node:fs');
          const obj = await stagingClient.send(new GetObjectCommand({
            Bucket: stagingBucket,
            Key: `v${version}/${manifest.platform}/${file.name}`,
          }));
          await pipeline(obj.Body, createWriteStream(dest));
        }
        names.push(dest);
      }
    }
    const notesFile = path.join(dir, 'notes.md');
    writeFileSync(notesFile, notes);
    const repo = process.env.GITHUB_BRIDGE_REPO || 'maxprain12/dome';
    if (!dryRun) {
      run('gh', ['release', 'create', `v${version}`, ...names, '--title', `v${version}`, '--notes-file', notesFile, '--latest', '-R', repo]);
    }
    rmSync(dir, { recursive: true, force: true });
    if (bridgeOnly) {
      console.log(`Puente GitHub publicado en ${repo}`);
      return;
    }
  }

  if (!publicClient) throw new Error('Falta el cliente del bucket público');
  const assets = [];
  for (const manifest of manifests) {
    for (const file of manifest.files) {
      const sourceKey = `v${version}/${manifest.platform}/${file.name}`;
      const destKey = `releases/v${version}/${file.name}`;
      const cache = file.name.endsWith('.yml') ? 'public, max-age=60' : 'public, max-age=31536000, immutable';
      if (!dryRun) {
        await copyViaStream(stagingClient, stagingBucket, sourceKey, publicClient, publicBucket, destKey, { cacheControl: cache });
      }
      if (!file.name.endsWith('.yml') && !file.name.endsWith('.blockmap')) {
        assets.push({
          platform: manifest.platform,
          arch: assetArch(file.name),
          kind: assetKind(file.name),
          name: file.name,
          url: `${process.env.RELEASE_PUBLIC_BASE_URL.replace(/\/$/, '')}/releases/v${version}/${encodeURIComponent(file.name)}`,
          size: file.size,
          sha512: file.sha512,
        });
      }
    }
    const ymlName = YML_BY_PLATFORM[manifest.platform];
    const ymlRaw = await getText(stagingClient, stagingBucket, `v${version}/${manifest.platform}/${ymlName}`);
    if (!ymlRaw) throw new Error(`Falta ${ymlName} de ${manifest.platform}`);
    const rewritten = rewriteForFeed(parseUpdateYml(ymlRaw), {
      baseUrl: process.env.RELEASE_PUBLIC_BASE_URL,
      version,
      stagingPercentage: staging,
      releaseNotes: notes,
    });
    const feedKey = `feed/${feedFileName(channel, manifest.platform)}`;
    if (dryRun) console.log(`dry-run ${feedKey}`);
    else {
      await putText(publicClient, publicBucket, feedKey, stringifyUpdateYml(rewritten), {
        contentType: 'text/yaml',
        cacheControl: 'public, max-age=60',
      });
    }
  }

  const existing = dryRun ? null : await getText(publicClient, publicBucket, 'index.json');
  const index = upsertIndex(existing ? JSON.parse(existing) : {}, {
    version,
    date: new Date().toISOString().slice(0, 10),
    channels: [channel],
    stagingPercentage: { [channel]: staging },
    notesMarkdown: notes,
    assets,
  });
  if (!dryRun) {
    await putText(publicClient, publicBucket, 'index.json', `${JSON.stringify(index, null, 2)}\n`, {
      contentType: 'application/json',
      cacheControl: 'public, max-age=60',
    });
  }
  await pingLanding(dryRun);
  console.log(`Publicado ${version} en ${channel} al ${staging}%`);
}

async function pingLanding(dryRun) {
  const url = process.env.LANDING_DEPLOY_WEBHOOK_URL;
  const token = process.env.COOLIFY_TOKEN;
  if (!url || !token || dryRun) return;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Webhook de la landing respondió ${res.status}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
