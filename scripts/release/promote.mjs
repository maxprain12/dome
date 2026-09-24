import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadReleaseEnv, requireKeys, UPLOAD_KEYS, PUBLISH_KEYS } from './lib/config.mjs';
import { feedFileName, parseUpdateYml, stringifyUpdateYml, upsertIndex } from './lib/manifests.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

function flag(name) {
  return process.argv.includes(name);
}

async function main() {
  loadReleaseEnv();
  requireKeys([...UPLOAD_KEYS, ...PUBLISH_KEYS]);
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = option('--version', pkg.version);
  const channel = option('--channel', 'latest');
  const pause = flag('--pause');
  const skipBeta = flag('--skip-beta');
  const staging = pause ? 0 : Number(option('--staging', '100'));
  if (!['beta', 'latest'].includes(channel)) throw new Error('--channel debe ser beta o latest');

  const { createClient, getText, putText } = await import('./lib/s3.mjs');
  const client = createClient({
    endpoint: process.env.RELEASE_PUBLIC_S3_ENDPOINT,
    region: process.env.RELEASE_PUBLIC_S3_REGION,
    accessKeyId: process.env.RELEASE_PUBLIC_S3_ACCESS_KEY,
    secretAccessKey: process.env.RELEASE_PUBLIC_S3_SECRET_KEY,
  });
  const bucket = process.env.RELEASE_S3_BUCKET_PUBLIC;
  const sourceChannel = channel === 'latest' && !skipBeta ? 'beta' : channel;

  for (const platform of ['mac', 'win', 'linux']) {
    const sourceName = feedFileName(sourceChannel, platform);
    const raw = await getText(client, bucket, `feed/${sourceName}`);
    if (!raw) throw new Error(`No existe feed/${sourceName}. Publica primero con release:publish.`);
    const yml = parseUpdateYml(raw);
    if (String(yml.version) !== version) {
      throw new Error(`feed/${sourceName} es ${yml.version}, se esperaba ${version}.`);
    }
    if (staging > 0 && staging < 100) yml.stagingPercentage = staging;
    else delete yml.stagingPercentage;
    if (pause) yml.stagingPercentage = 0;
    const dest = `feed/${feedFileName(channel, platform)}`;
    await putText(client, bucket, dest, stringifyUpdateYml(yml), {
      contentType: 'text/yaml',
      cacheControl: 'public, max-age=60',
    });
    console.log(`${pause ? 'pausado' : 'promovido'} ${dest} (${staging}%)`);
  }

  const indexRaw = await getText(client, bucket, 'index.json');
  const index = upsertIndex(indexRaw ? JSON.parse(indexRaw) : {}, {
    version,
    date: new Date().toISOString().slice(0, 10),
    channels: [channel],
    stagingPercentage: { [channel]: staging },
    notesMarkdown: '',
    assets: [],
  });
  const previous = (indexRaw ? JSON.parse(indexRaw).releases : []).find((item) => item.version === version);
  if (previous) {
    const entry = index.releases.find((item) => item.version === version);
    entry.notesMarkdown = previous.notesMarkdown;
    entry.assets = previous.assets;
    entry.date = previous.date;
    entry.stagingPercentage = { ...(previous.stagingPercentage ?? {}), [channel]: staging };
    if (!entry.channels.includes(channel)) entry.channels.push(channel);
  }
  await putText(client, bucket, 'index.json', `${JSON.stringify(index, null, 2)}\n`, {
    contentType: 'application/json',
    cacheControl: 'public, max-age=60',
  });
  if (pause) {
    console.log('No hay rollback: electron-updater no baja de versión. Publica un parche para corregir una release rota.');
  }
  const url = process.env.LANDING_DEPLOY_WEBHOOK_URL;
  const token = process.env.COOLIFY_TOKEN;
  if (url && token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Webhook de la landing respondió ${res.status}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
