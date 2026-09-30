'use strict';

const githubApi = require('../github/github-api.cjs');

const LOCALE_FILES = [
  'src/i18n/index.ts',
  'src/i18n/index.js',
  'src/i18n.ts',
  'astro.config.mjs',
  'astro.config.ts',
  'astro.config.js',
];

const COLLECTION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE = /^[a-z]{2}(?:-[a-z0-9]+)?$/;
const DEFAULT_LOCALE = /defaultLocale(?:\s*:\s*[A-Za-z0-9_]+)?\s*[:=]\s*['"]([a-z]{2}(?:-[a-zA-Z0-9]+)?)['"]/;

function contentFolders(paths) {
  const found = new Map();
  for (const raw of paths) {
    const filePath = String(raw || '').replace(/\\/g, '/');
    const match = filePath.match(/(?:^|\/)((?:src\/content)\/([^/]+)\/([^/]+))\/([^/]+)\.(?:md|mdx)$/i);
    if (!match || match[4].startsWith('_')) continue;
    const collection = match[2].toLowerCase();
    const language = match[3].toLowerCase();
    if (!COLLECTION.test(collection) || !LANGUAGE.test(language)) continue;
    const key = `${collection}/${language}`;
    if (!found.has(key)) found.set(key, match[1]);
  }
  return found;
}

function pageLocales(paths, languages) {
  const known = new Set(languages);
  const found = new Set();
  for (const raw of paths) {
    const filePath = String(raw || '').replace(/\\/g, '/');
    const match = filePath.match(/(?:^|\/)src\/pages\/([^/]+)\//);
    if (!match) continue;
    const locale = match[1].toLowerCase();
    if (known.has(locale)) found.add(locale);
  }
  return [...found].sort((left, right) => left.localeCompare(right));
}

function defaultLocaleFromSource(source) {
  const match = String(source || '').match(DEFAULT_LOCALE);
  return match ? match[1].toLowerCase() : '';
}

function publicationPattern(languages, locales, fileDefault) {
  if (languages.length <= 1) {
    return { pattern: '/{collection}/{slug}', primary: languages[0] || fileDefault || '' };
  }
  if (locales.length > 0 && languages.every((language) => locales.includes(language))) {
    return { pattern: '/{language}/{collection}/{slug}', primary: fileDefault || languages[0] };
  }
  const unprefixed = languages.filter((language) => !locales.includes(language));
  if (unprefixed.length === 1) {
    return { pattern: '{/language}/{collection}/{slug}', primary: unprefixed[0] };
  }
  return { pattern: '{/language}/{collection}/{slug}', primary: fileDefault || languages[0] };
}

function orderedPaths(found, primary) {
  const entries = [...found.entries()].sort((left, right) => {
    const [leftCollection, leftLanguage] = left[0].split('/');
    const [rightCollection, rightLanguage] = right[0].split('/');
    const leftRank = leftLanguage === primary ? 0 : 1;
    const rightRank = rightLanguage === primary ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const byCollection = leftCollection.localeCompare(rightCollection);
    if (byCollection !== 0) return byCollection;
    return leftLanguage.localeCompare(rightLanguage);
  });
  return Object.fromEntries(entries);
}

function inferContentStructure(paths, sourceText = '') {
  const found = contentFolders(paths);
  if (found.size === 0) return null;
  const languages = [];
  for (const key of found.keys()) {
    const language = key.split('/')[1];
    if (language && !languages.includes(language)) languages.push(language);
  }
  languages.sort((left, right) => left.localeCompare(right));
  const fromFile = defaultLocaleFromSource(sourceText);
  const fileDefault = languages.includes(fromFile) ? fromFile : '';
  const { pattern, primary } = publicationPattern(languages, pageLocales(paths, languages), fileDefault);
  return {
    contentPaths: orderedPaths(found, primary),
    sitePathPattern: pattern,
  };
}

async function detectRepositoryStructure(repo, branch, api = githubApi) {
  const [owner, name] = String(repo).split('/');
  const ref = branch || 'main';
  const reference = await api.getReference(owner, name, ref);
  const commit = await api.getCommit(owner, name, reference.object.sha);
  const tree = await api.getRepositoryTree(owner, name, commit.tree.sha);
  if (tree?.truncated) throw new Error('STRUCTURE_TRUNCATED');
  const paths = (tree?.tree || [])
    .filter((item) => item && item.type === 'blob' && typeof item.path === 'string')
    .map((item) => item.path);
  const localeFile = LOCALE_FILES.find((file) => paths.includes(file)) || '';
  let source = '';
  if (localeFile) {
    try {
      source = await api.getRepositoryFile(owner, name, localeFile, ref);
    } catch {
      source = '';
    }
  }
  const detected = inferContentStructure(paths, source);
  if (!detected) throw new Error('STRUCTURE_NOT_FOUND');
  return detected;
}

function planEntryNormalization(notes, remoteEntries) {
  const bySlug = new Map();
  for (const entry of remoteEntries || []) {
    const slug = String(entry?.slug || '');
    if (!slug) continue;
    const list = bySlug.get(slug) || [];
    list.push(entry);
    bySlug.set(slug, list);
  }
  const updates = [];
  let unchanged = 0;
  let unmatched = 0;
  for (const note of notes || []) {
    const slug = String(note?.fields?.slug || '').trim();
    const matches = bySlug.get(slug) || [];
    const collection = String(note?.fields?.collection || '');
    const language = String(note?.fields?.language || '');
    const exact = matches.find((entry) => entry.collection === collection && entry.language === language);
    const chosen = exact || (matches.length === 1 ? matches[0] : null);
    if (!chosen) {
      unmatched += 1;
      continue;
    }
    const sameFields = chosen.collection === collection && chosen.language === language;
    const samePath = note?.publication?.path === chosen.path;
    if (sameFields && samePath) {
      unchanged += 1;
      continue;
    }
    updates.push({
      id: note.id,
      collection: chosen.collection,
      language: chosen.language,
      path: chosen.path,
    });
  }
  return { updates, unchanged, unmatched };
}

module.exports = {
  detectRepositoryStructure,
  inferContentStructure,
  planEntryNormalization,
};
