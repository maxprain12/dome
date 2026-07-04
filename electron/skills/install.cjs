/* eslint-disable no-console */
/**
 * Skill installation from GitHub repos — compatible with anthropics/skills layout
 * and the npx skills add workflow (repo URL + skill name).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const githubClient = require('../marketplace/github-client.cjs');
const { userSkillsDir } = require('./index.cjs');

const SKILL_SCAN_DIRS = ['skills', 'skills/.curated', 'skills/.experimental', 'skills/.system'];
const OPTIONAL_SCAN_DIRS = new Set(['skills/.curated', 'skills/.experimental', 'skills/.system']);
const MARKETPLACE_MANIFEST = '.claude-plugin/marketplace.json';

/**
 * Parse the body of a YAML double-quoted scalar, honouring backslash escapes.
 * @param {string} trimmed - the raw value with surrounding quotes already verified
 * @returns {string}
 */
function parseDoubleQuotedScalar(trimmed) {
  let i = 1;
  let out = '';
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length) {
      out += trimmed[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Parse the body of a YAML single-quoted scalar (no escapes; '' → ').
 * @param {string} trimmed - the raw value with surrounding quotes already verified
 * @returns {string}
 */
function parseSingleQuotedScalar(trimmed) {
  let i = 1;
  let out = '';
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === "'" && trimmed[i + 1] === "'") {
      out += "'";
      i += 2;
      continue;
    }
    if (ch === "'") break;
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Parse a YAML scalar value (unquoted, double-quoted with escapes, single-quoted).
 * @param {string} raw
 * @returns {string}
 */
function parseYamlScalarValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"')) return parseDoubleQuotedScalar(trimmed);
  if (trimmed.startsWith("'")) return parseSingleQuotedScalar(trimmed);
  return trimmed;
}

/**
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseSkillMdFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  /** @type {Record<string, string>} */
  const result = {};
  const lines = match[1].split('\n');

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const keyMatch = line.match(/^([\w.-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[1];
    const valuePart = keyMatch[2];

    if (valuePart === '|' || valuePart === '>') {
      const blockLines = [];
      idx += 1;
      while (idx < lines.length && (lines[idx].startsWith('  ') || lines[idx].trim() === '')) {
        blockLines.push(lines[idx].replace(/^  /, ''));
        idx += 1;
      }
      idx -= 1;
      result[key] = blockLines.join('\n').trimEnd();
      continue;
    }

    result[key] = parseYamlScalarValue(valuePart);
  }

  return result;
}

/**
 * @param {Record<string, string>} meta
 * @returns {string}
 */
function resolveSkillDescription(meta) {
  return (meta.description || meta.when_to_use || meta.name || '').trim();
}

/**
 * @param {string} url
 * @returns {{ owner: string; repo: string; branch: string; subdir: string } | null}
 */
function parseGitHubRepoUrl(url) {
  const trimmed = url.trim().replace(/\.git$/, '');
  const m = trimmed.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2],
    branch: m[3] || 'main',
    subdir: (m[4] || '').replace(/\/$/, ''),
  };
}

/**
 * @param {string} name
 * @returns {string}
 */
function slugifySkillId(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * @param {string} urlStr
 * @param {Record<string,string>} [extraHeaders]
 * @returns {Promise<string|null>}
 */
function fetchText(urlStr, extraHeaders = {}) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const protocol = parsed.protocol === 'https:' ? https : http;
      const req = protocol.get(
        urlStr,
        { headers: { 'User-Agent': 'Dome-Skills/1.0', Accept: 'text/plain,application/json', ...extraHeaders } },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        },
      );
      req.setTimeout(15000, () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} repoPath
 * @returns {string}
 */
function rawGitHubUrl(owner, repo, branch, repoPath) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${repoPath}`;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} repoPath
 * @returns {string}
 */
function treeGitHubUrl(owner, repo, branch, repoPath) {
  const sub = repoPath ? `${repoPath}/` : '';
  return `https://github.com/${owner}/${repo}/tree/${branch}/${sub}`;
}

/**
 * @typedef {{ id: string; name: string; description: string; repoPath: string; skillUrl: string }} DiscoveredSkill
 */

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} skillRepoPath - e.g. skills/pptx
 * @returns {Promise<DiscoveredSkill|null>}
 */
async function loadSkillMetaFromPath(owner, repo, branch, skillRepoPath) {
  try {
    const md = await fetchText(rawGitHubUrl(owner, repo, branch, `${skillRepoPath}/SKILL.md`));
    if (!md) return null;
    const meta = parseSkillMdFrontmatter(md);
    if (!meta.name) return null;
    const id = slugifySkillId(meta.name);
    return {
      id,
      name: meta.name,
      description: resolveSkillDescription(meta),
      repoPath: skillRepoPath,
      skillUrl: treeGitHubUrl(owner, repo, branch, skillRepoPath),
    };
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} prefix
 * @returns {Promise<DiscoveredSkill[]>}
 */
async function scanDirectoryForSkills(owner, repo, branch, prefix) {
  const skills = [];
  try {
    const contents = await githubClient.getRepoContents(owner, repo, prefix, branch);
    if (!Array.isArray(contents)) return skills;

    const hasRootSkill = contents.some((e) => e.type === 'file' && e.name === 'SKILL.md');
    if (hasRootSkill && prefix) {
      const meta = await loadSkillMetaFromPath(owner, repo, branch, prefix);
      if (meta) skills.push(meta);
      return skills;
    }

    const dirs = contents.filter((e) => e.type === 'dir').slice(0, 50);
    const results = await Promise.all(
      dirs.map(async (d) => {
        const childPath = prefix ? `${prefix}/${d.name}` : d.name;
        return loadSkillMetaFromPath(owner, repo, branch, childPath);
      }),
    );
    skills.push(...results.filter(Boolean));
  } catch (err) {
    const isMissingOptionalDir =
      OPTIONAL_SCAN_DIRS.has(prefix) && /not found/i.test(err.message);
    if (!isMissingOptionalDir) {
      console.warn(`[Skills] scanDirectoryForSkills ${prefix}:`, err.message);
    }
  }
  return skills;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} basePrefix
 * @returns {Promise<DiscoveredSkill[]>}
 */
async function discoverFromMarketplaceManifest(owner, repo, branch, basePrefix) {
  const manifestPath = basePrefix
    ? `${basePrefix}/${MARKETPLACE_MANIFEST}`
    : MARKETPLACE_MANIFEST;
  const json = await fetchText(rawGitHubUrl(owner, repo, branch, manifestPath));
  if (!json) return [];

  try {
    const manifest = JSON.parse(json);
    const plugins = manifest.plugins || [];
    const skillPaths = new Set();
    for (const plugin of plugins) {
      for (const skillRef of plugin.skills || []) {
        const normalized = String(skillRef)
          .replace(/^\.\//, '')
          .replace(/\/$/, '');
        if (normalized) skillPaths.add(normalized);
      }
    }

    const results = await Promise.all(
      [...skillPaths].map((p) => loadSkillMetaFromPath(owner, repo, branch, p)),
    );
    return results.filter(Boolean);
  } catch (err) {
    console.warn('[Skills] marketplace manifest parse failed:', err.message);
    return [];
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} basePrefix
 * @returns {Promise<DiscoveredSkill[]>}
 */
async function discoverFromSkillsJson(owner, repo, branch, basePrefix) {
  const indexPath = basePrefix ? `${basePrefix}/skills.json` : 'skills.json';
  const json = await fetchText(rawGitHubUrl(owner, repo, branch, indexPath));
  if (!json) return [];

  try {
    const entries = JSON.parse(json);
    if (!Array.isArray(entries)) return [];
    const results = await Promise.all(
      entries.map(async (e) => {
        const skillPath = basePrefix
          ? `${basePrefix}/${e.path || e.id}`
          : (e.path || e.id);
        const meta = await loadSkillMetaFromPath(owner, repo, branch, skillPath);
        if (meta) return meta;
        return {
          id: slugifySkillId(e.id || e.name || ''),
          name: e.name || e.id,
          description: e.description || '',
          repoPath: skillPath,
          skillUrl: treeGitHubUrl(owner, repo, branch, skillPath),
        };
      }),
    );
    return results.filter((s) => s.id);
  } catch (_) {
    return [];
  }
}

/**
 * Discover all skills in a GitHub repository.
 * @param {string} repoUrl
 * @returns {Promise<{ owner: string; repo: string; branch: string; skills: DiscoveredSkill[] }>}
 */
async function discoverSkillsInRepo(repoUrl) {
  const repoInfo = parseGitHubRepoUrl(repoUrl);
  if (!repoInfo) {
    throw new Error('Not a valid GitHub repository URL.');
  }

  const { owner, repo, branch, subdir } = repoInfo;
  const seen = new Map();

  function addSkills(list) {
    for (const s of list) {
      if (!seen.has(s.id)) seen.set(s.id, s);
    }
  }

  if (subdir) {
    const direct = await loadSkillMetaFromPath(owner, repo, branch, subdir);
    if (direct) {
      return { owner, repo, branch, skills: [direct] };
    }
    addSkills(await scanDirectoryForSkills(owner, repo, branch, subdir));
    return { owner, repo, branch, skills: [...seen.values()] };
  }

  addSkills(await discoverFromMarketplaceManifest(owner, repo, branch, ''));
  for (const scanDir of SKILL_SCAN_DIRS) {
    addSkills(await scanDirectoryForSkills(owner, repo, branch, scanDir));
  }
  addSkills(await discoverFromSkillsJson(owner, repo, branch, ''));
  addSkills(await scanDirectoryForSkills(owner, repo, branch, ''));

  return { owner, repo, branch, skills: [...seen.values()] };
}

/**
 * Recursively list all file blobs under a repo path.
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} dirPath
 * @returns {Promise<Array<{ path: string; downloadUrl: string }>>}
 */
async function listRepoFilesRecursive(owner, repo, branch, dirPath) {
  /** @type {Array<{ path: string; downloadUrl: string }>} */
  const files = [];

  async function walk(currentPath) {
    let contents;
    try {
      contents = await githubClient.getRepoContents(owner, repo, currentPath, branch);
    } catch (_) {
      return;
    }
    if (!Array.isArray(contents)) return;

    for (const item of contents) {
      if (item.type === 'file' && item.download_url) {
        files.push({ path: item.path, downloadUrl: item.download_url });
      } else if (item.type === 'dir') {
        await walk(item.path);
      }
    }
  }

  await walk(dirPath);
  return files;
}

/**
 * @param {string} url
 * @returns {Promise<Buffer|null>}
 */
function fetchBinary(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol === 'https:' ? https : http;
      const req = protocol.get(url, { headers: { 'User-Agent': 'Dome-Skills/1.0' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.setTimeout(30000, () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Download a skill folder from GitHub into destDir.
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} repoPath
 * @param {string} destDir
 */
async function downloadSkillFolder(owner, repo, branch, repoPath, destDir) {
  const files = await listRepoFilesRecursive(owner, repo, branch, repoPath);
  if (files.length === 0) {
    throw new Error(`No files found at ${repoPath} in ${owner}/${repo}.`);
  }

  const skillMd = files.find((f) => f.path.endsWith('/SKILL.md') || f.path === `${repoPath}/SKILL.md`);
  if (!skillMd) {
    throw new Error(`SKILL.md not found in ${repoPath}.`);
  }

  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const prefix = `${repoPath}/`;
  for (const file of files) {
    const relative = file.path.startsWith(prefix) ? file.path.slice(prefix.length) : path.basename(file.path);
    if (!relative) continue;

    const destFile = path.join(destDir, relative);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });

    const buf = await fetchBinary(file.downloadUrl);
    if (!buf) {
      console.warn(`[Skills] Failed to download ${file.path}, skipping`);
      continue;
    }
    fs.writeFileSync(destFile, buf);
  }

  const skillMdPath = path.join(destDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    throw new Error('SKILL.md missing after download.');
  }

  const meta = parseSkillMdFrontmatter(fs.readFileSync(skillMdPath, 'utf8'));
  if (!meta.name) {
    throw new Error('SKILL.md is missing required "name" in frontmatter.');
  }
  const description = resolveSkillDescription(meta);
  if (!description) {
    throw new Error('SKILL.md is missing required "description" in frontmatter.');
  }

  const skillId = slugifySkillId(meta.name);
  const correctDest = path.join(userSkillsDir(), skillId);
  if (path.resolve(correctDest) !== path.resolve(destDir)) {
    if (fs.existsSync(correctDest)) {
      fs.rmSync(correctDest, { recursive: true, force: true });
    }
    fs.renameSync(destDir, correctDest);
    destDir = correctDest;
  }

  return {
    id: skillId,
    name: meta.name,
    description,
    dir: destDir,
  };
}

/**
 * @param {{ repoUrl: string; skillNames?: string[]; overwrite?: boolean }} opts
 * @returns {Promise<Array<{ id: string; name: string; description: string; dir: string }>>}
 */
async function installSkillsFromRepo({ repoUrl, skillNames, overwrite = true }) {
  const { owner, repo, branch, skills } = await discoverSkillsInRepo(repoUrl);

  if (skills.length === 0) {
    throw new Error('No skills found in that repository.');
  }

  let toInstall = skills;
  if (skillNames && skillNames.length > 0) {
    const wanted = new Set(skillNames.map((n) => slugifySkillId(n)));
    toInstall = skills.filter((s) => wanted.has(s.id) || wanted.has(slugifySkillId(s.name)));
    if (toInstall.length === 0) {
      throw new Error(
        `Skill(s) not found: ${skillNames.join(', ')}. Use browse to see available skills.`,
      );
    }
  }

  const destRoot = userSkillsDir();
  if (!fs.existsSync(destRoot)) {
    fs.mkdirSync(destRoot, { recursive: true });
  }

  /** @type {Array<{ id: string; name: string; description: string; dir: string }>} */
  const installed = [];

  for (const skill of toInstall) {
    const destDir = path.join(destRoot, skill.id);
    if (fs.existsSync(destDir) && !overwrite) {
      throw new Error(`Skill "${skill.id}" already exists. Enable overwrite to replace it.`);
    }
    const result = await downloadSkillFolder(owner, repo, branch, skill.repoPath, destDir);
    installed.push(result);
  }

  return installed;
}

/**
 * Install a single skill from a direct GitHub tree URL or SKILL.md URL.
 * @param {string} url
 * @returns {Promise<{ id: string; name: string; description: string; dir: string }>}
 */
async function installSkillFromUrl(url) {
  const repoInfo = parseGitHubRepoUrl(url);
  if (!repoInfo) {
    throw new Error('Not a valid GitHub URL.');
  }

  const { owner, repo, branch, subdir } = repoInfo;
  const repoPath = subdir || '';

  if (!repoPath) {
    const discovered = await discoverSkillsInRepo(url);
    if (discovered.skills.length === 1) {
      const [only] = discovered.skills;
      const destDir = path.join(userSkillsDir(), only.id);
      return downloadSkillFolder(owner, repo, branch, only.repoPath, destDir);
    }
    throw new Error('Repository contains multiple skills. Specify a skill name or browse the repo.');
  }

  const destDir = path.join(userSkillsDir(), path.basename(repoPath));
  const result = await downloadSkillFolder(owner, repo, branch, repoPath, destDir);
  return result;
}

/**
 * @param {string} skillId
 */
/**
 * Rename skill folders so frontmatter `name` matches directory (Agent Skills spec).
 * Idempotent — skips when target name already exists.
 */
function repairSkillDirectoryNames() {
  const root = userSkillsDir();
  if (!fs.existsSync(root)) return;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(root, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    try {
      const meta = parseSkillMdFrontmatter(fs.readFileSync(skillMd, 'utf8'));
      const want = slugifySkillId(meta.name || '');
      if (!want || want === entry.name) continue;
      const target = path.join(root, want);
      if (fs.existsSync(target)) continue;
      fs.renameSync(path.join(root, entry.name), target);
      console.log(`[Skills] Renamed ${entry.name} → ${want} (Agent Skills spec)`);
    } catch (err) {
      console.warn(`[Skills] Could not repair directory for ${entry.name}:`, err?.message);
    }
  }
}

function removeSkill(skillId) {
  const safeId = slugifySkillId(skillId);
  if (!safeId) throw new Error('Invalid skill id');
  const skillDir = path.join(userSkillsDir(), safeId);
  if (!fs.existsSync(skillDir)) {
    throw new Error('Skill not found');
  }
  fs.rmSync(skillDir, { recursive: true, force: true });
}

/**
 * Resolve installed skill folder id from frontmatter name or folder name.
 * Handles skills where name !== directory (e.g. advo-identity in advo-identity-skill/).
 * @param {string} skillRef
 * @returns {string}
 */
function resolveSkillDirectoryId(skillRef) {
  const safe = slugifySkillId(skillRef);
  if (!safe) throw new Error('Invalid skill id');

  const root = userSkillsDir();
  const direct = path.join(root, safe);
  if (fs.existsSync(path.join(direct, 'SKILL.md'))) return safe;

  if (!fs.existsSync(root)) {
    throw new Error(`Skill not found: ${skillRef}`);
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name;
    if (slugifySkillId(dir) === safe) return dir;
    const skillMd = path.join(root, dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    try {
      const meta = parseSkillMdFrontmatter(fs.readFileSync(skillMd, 'utf8'));
      const metaName = slugifySkillId(meta.name || '');
      if (metaName && metaName === safe) return dir;
    } catch {
      /* skip unreadable */
    }
  }

  throw new Error(`Skill not found: ${skillRef}`);
}

/**
 * Read a text file from an installed skill directory (~/.dome/skills/<id>/).
 * @param {string} skillId
 * @param {string} relativePath - e.g. "editing.md" or "references/layout.md"
 * @returns {string}
 */
function readSkillFile(skillId, relativePath) {
  const safeId = resolveSkillDirectoryId(skillId);

  const skillRoot = path.resolve(userSkillsDir(), safeId);

  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) {
    throw new Error('Invalid relative path');
  }

  const full = path.resolve(skillRoot, rel);
  const rootWithSep = skillRoot.endsWith(path.sep) ? skillRoot : `${skillRoot}${path.sep}`;
  if (!full.startsWith(rootWithSep) && full !== skillRoot) {
    throw new Error('Path escapes skill directory');
  }
  if (!fs.existsSync(full)) {
    throw new Error('File not found');
  }
  if (fs.statSync(full).isDirectory()) {
    throw new Error('Path is a directory');
  }

  return fs.readFileSync(full, 'utf8');
}

module.exports = {
  parseSkillMdFrontmatter,
  parseGitHubRepoUrl,
  discoverSkillsInRepo,
  installSkillsFromRepo,
  installSkillFromUrl,
  removeSkill,
  readSkillFile,
  repairSkillDirectoryNames,
  resolveSkillDirectoryId,
  slugifySkillId,
};
