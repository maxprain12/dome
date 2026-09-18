'use strict';

const path = require('node:path');
const { listAllSkills } = require('../skills/index.cjs');

const MAX_ITEMS = 40;

function looksOpaque(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z]{1,12}-[0-9a-f]{6,}$/i.test(trimmed)) return true;
  return false;
}

function publicLabel(raw, fallback) {
  const title = String(raw || '').trim();
  if (title && !looksOpaque(title)) return title.slice(0, 120);
  return fallback;
}

function matchesQuery(label, query) {
  if (!query) return true;
  return label.toLowerCase().includes(query);
}

async function listPublicRefs(database, query = '') {
  const needle = String(query || '').trim().toLowerCase();
  const queries = database?.getQueries?.();
  const resources = [];
  try {
    const rows = queries?.listResourcesLight?.all?.(MAX_ITEMS) || [];
    for (const row of rows) {
      const title = publicLabel(row?.title || row?.original_filename, '');
      if (!title) continue;
      if (!matchesQuery(title, needle)) continue;
      resources.push({
        id: String(row.id),
        title,
        type: String(row.type || 'resource'),
        kind: 'resource',
      });
      if (resources.length >= MAX_ITEMS) break;
    }
  } catch {
    /* keep empty */
  }

  const skills = [];
  try {
    const listed = await listAllSkills();
    for (const skill of listed) {
      const title = publicLabel(skill?.name, '');
      if (!title) continue;
      if (!matchesQuery(`${title} ${skill?.description || ''}`, needle)) continue;
      const folderId = skill?.path ? path.basename(path.dirname(skill.path)) : title;
      skills.push({
        id: looksOpaque(folderId) ? title : folderId,
        title,
        type: 'skill',
        kind: 'skill',
        description: String(skill?.description || '').slice(0, 180),
      });
      if (skills.length >= MAX_ITEMS) break;
    }
  } catch {
    /* keep empty */
  }

  const mcp = [];
  try {
    const rows = queries?.listMcpServers?.all?.() || [];
    for (const row of rows) {
      if (row?.enabled === 0 || row?.enabled === false) continue;
      const title = publicLabel(row?.name, '');
      if (!title) continue;
      if (!matchesQuery(`${title} ${row?.description || ''}`, needle)) continue;
      mcp.push({
        id: String(row.id || title),
        title,
        type: 'mcp',
        kind: 'mcp',
        description: String(row?.description || row?.command || '').slice(0, 180),
      });
      if (mcp.length >= MAX_ITEMS) break;
    }
  } catch {
    /* keep empty */
  }

  return { resources, skills, mcp };
}

function normalizePins(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id || '').trim();
    const title = publicLabel(row.title, '');
    if (!id || !title) continue;
    out.push({
      id,
      title,
      type: String(row.type || 'resource'),
      kind: 'resource',
    });
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeSkills(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const name = publicLabel(row.name || row.title, '');
    if (!name) continue;
    out.push({ id: String(row.id || name), name });
    if (out.length >= 6) break;
  }
  return out;
}

function normalizeMcp(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    const id = typeof row === 'string' ? row.trim() : String(row?.id || row?.name || '').trim();
    const title = publicLabel(typeof row === 'string' ? row : row?.title || row?.name || '', '');
    if (!id || !title) continue;
    out.push(id);
    if (out.length >= 8) break;
  }
  return out;
}

module.exports = {
  looksOpaque,
  publicLabel,
  listPublicRefs,
  normalizePins,
  normalizeSkills,
  normalizeMcp,
};
