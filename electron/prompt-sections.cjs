'use strict';

const fs = require('fs');
const path = require('path');
const { ENTITY_CREATION_RULES, RESOURCE_LINK_INSTRUCTION } = require('./system-prompt.cjs');

const MARTIN_DIR = path.join(__dirname, '..', 'prompts', 'martin');

/** @type {Record<string, string | null>} */
const cache = {};

function readMartin(name) {
  const filePath = path.join(MARTIN_DIR, name);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * On-demand Markdown bodies for dome_load_doc.
 * @param {string} docId entity_rules | artifacts | artifact_persisted | resource_links
 */
function getSectionBody(docId) {
  if (cache[docId] !== undefined && cache[docId] !== null) return cache[docId];
  /** @type {string | null} */
  let body = null;
  switch (docId) {
    case 'entity_rules':
      body = ENTITY_CREATION_RULES;
      break;
    case 'artifacts':
      body = readMartin('artifacts.txt');
      break;
    case 'artifact_persisted':
      body = readMartin('artifact-persisted.txt');
      break;
    case 'resource_links':
      body = RESOURCE_LINK_INSTRUCTION;
      break;
    default:
      cache[docId] = null;
      return null;
  }
  if (typeof body === 'string' && body.trim().length > 0) {
    cache[docId] = body;
    return body;
  }
  cache[docId] = null;
  return null;
}

module.exports = { getSectionBody };
