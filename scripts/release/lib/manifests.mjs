import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export function parseUpdateYml(text) {
  const value = parseYaml(text);
  if (!value || typeof value !== 'object') throw new Error('El manifiesto de actualización no es un objeto YAML');
  return value;
}

export function stringifyUpdateYml(obj) {
  return stringifyYaml(obj);
}

export function rewriteForFeed(ymlObj, { baseUrl, version, stagingPercentage, releaseNotes }) {
  const next = structuredClone(ymlObj);
  const prefix = `${String(baseUrl).replace(/\/$/, '')}/releases/v${version}/`;
  const rewrite = (url) => {
    if (typeof url !== 'string' || url.length === 0 || /^https?:\/\//i.test(url)) return url;
    return `${prefix}${encodeURIComponent(url)}`;
  };
  if (Array.isArray(next.files)) next.files = next.files.map((file) => ({ ...file, url: rewrite(file.url) }));
  if (typeof next.path === 'string') next.path = rewrite(next.path);
  if (typeof stagingPercentage === 'number' && stagingPercentage < 100) next.stagingPercentage = stagingPercentage;
  else delete next.stagingPercentage;
  if (releaseNotes) next.releaseNotes = releaseNotes;
  return next;
}

export function validateBuildManifests(manifests, version) {
  const byPlatform = new Map(manifests.map((item) => [item.platform, item]));
  const missing = ['mac', 'win', 'linux'].filter((platform) => !byPlatform.has(platform));
  if (missing.length > 0) throw new Error(`Faltan builds en staging: ${missing.join(', ')}`);
  if (new Set(manifests.map((item) => item.commit)).size !== 1) {
    throw new Error('Las tres plataformas no se compilaron desde el mismo commit.');
  }
  for (const item of manifests) {
    if (item.version !== version) throw new Error(`${item.platform} es ${item.version}, se esperaba ${version}.`);
    if ((item.platform === 'mac' || item.platform === 'win') && item.signed !== true) {
      throw new Error(`${item.platform} no está firmado. Vuelve a compilar sin --unsigned.`);
    }
    if (item.platform === 'mac' && item.notarized !== true) throw new Error('macOS no está notarizado.');
  }
  return [...byPlatform.values()];
}

function parseSemver(version) {
  const [core, pre = ''] = version.split('-');
  const [maj = 0, min = 0, pat = 0] = core.split('.').map((part) => Number(part) || 0);
  return { maj, min, pat, pre };
}

export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (left.maj !== right.maj) return left.maj - right.maj;
  if (left.min !== right.min) return left.min - right.min;
  if (left.pat !== right.pat) return left.pat - right.pat;
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

export function assetKind(name) {
  if (name.endsWith('.dmg')) return 'dmg';
  if (name.endsWith('.zip')) return 'zip';
  if (name.endsWith('.AppImage')) return 'appimage';
  if (name.endsWith('.flatpak')) return 'flatpak';
  if (name.endsWith('.exe') && name.includes('Setup')) return 'nsis';
  if (name.endsWith('.exe')) return 'portable';
  return 'other';
}

export function assetArch(name) {
  if (name.includes('arm64')) return 'arm64';
  if (name.includes('x64') || name.includes('x86_64')) return 'x64';
  return 'universal';
}

export function mergeReleaseEntry(previous, entry) {
  if (!previous) return entry;
  const platforms = new Set((entry.assets || []).map((asset) => asset.platform));
  const kept = (previous.assets || []).filter((asset) => !platforms.has(asset.platform));
  const channels = [...new Set([...(previous.channels || []), ...(entry.channels || [])])];
  channels.sort((a, b) => a.localeCompare(b));
  const assets = [...kept, ...(entry.assets || [])];
  assets.sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...previous,
    ...entry,
    notesMarkdown: entry.notesMarkdown || previous.notesMarkdown,
    channels,
    stagingPercentage: { ...(previous.stagingPercentage || {}), ...(entry.stagingPercentage || {}) },
    assets,
  };
}

export function upsertIndex(index, entry) {
  const current = index && typeof index === 'object' ? index : {};
  const releases = Array.isArray(current.releases)
    ? current.releases.filter((item) => item.version !== entry.version)
    : [];
  releases.push(entry);
  releases.sort((a, b) => compareSemver(b.version, a.version));
  const channels = { ...(current.channels ?? {}) };
  for (const channel of entry.channels ?? []) channels[channel] = entry.version;
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), channels, releases };
}

export function feedFileName(channel, platform) {
  const suffix = platform === 'mac' ? '-mac' : platform === 'linux' ? '-linux' : '';
  return `${channel}${suffix}.yml`;
}
