import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const PATTERNS = {
  mac: [/\.dmg$/, /\.zip$/, /\.blockmap$/, /^latest-mac\.yml$/],
  win: [/\.exe$/, /\.blockmap$/, /^latest\.yml$/],
  linux: [/\.AppImage$/, /\.flatpak$/, /\.blockmap$/, /^latest-linux\.yml$/],
};

export function sha512Base64(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('base64')));
  });
}

export async function collectArtifacts(releaseDir, platform) {
  const patterns = PATTERNS[platform];
  if (!patterns) throw new Error(`Plataforma desconocida: ${platform}`);
  const names = readdirSync(releaseDir).filter((name) => {
    const full = path.join(releaseDir, name);
    return statSync(full).isFile() && patterns.some((pattern) => pattern.test(name));
  });
  names.sort((a, b) => a.localeCompare(b));
  const files = [];
  for (const name of names) {
    const full = path.join(releaseDir, name);
    files.push({ name, path: full, size: statSync(full).size, sha512: await sha512Base64(full) });
  }
  return files;
}
