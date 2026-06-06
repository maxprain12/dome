'use strict';

const fs = require('fs');
const path = require('path');
const { readCoreFile } = require('./core-prompt-loader.cjs');
const { DOME_LOAD_DOC_DESCRIPTION, DOME_LOAD_DOC_IDS } = require('../../shared/prompt-assembler/index.cjs');
const { getPromptsDir } = require('../paths.cjs');

const MARTIN_DIR = path.join(getPromptsDir(), 'martin');

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
 * On-demand bodies for dome_load_doc.
 * @param {string} docId
 */
function getSectionBody(docId) {
  if (cache[docId] !== undefined && cache[docId] !== null) return cache[docId];
  /** @type {string | null} */
  let body = null;
  switch (docId) {
    case 'entity_rules':
      body = readCoreFile('entityRules');
      break;
    case 'artifacts':
      body = readMartin('artifacts.txt');
      break;
    case 'artifact_persisted':
      body = readMartin('artifact-persisted.txt');
      break;
    case 'feeders':
      body = readMartin('feeders.txt');
      break;
    case 'artifact_design':
      body = readMartin('artifact-design.txt');
      break;
    case 'resource_links':
      body = readCoreFile('resourceLinks');
      break;
    case 'ppt_tool':
      body = readMartin('ppt-tool.txt');
      break;
    case 'docx_tool':
      body = readMartin('docx-tool.txt');
      break;
    case 'calendar_tool':
      body = readMartin('calendar-tool.txt');
      break;
    case 'flashcard_tool':
      body = readMartin('flashcard-tool.txt');
      break;
    case 'excel_notebook_tool':
      body = readMartin('excel-notebook-tool.txt');
      break;
    case 'excel_artifact_tool':
      body = readMartin('excel-artifact-tool.txt');
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

module.exports = {
  getSectionBody,
  DOME_LOAD_DOC_DESCRIPTION,
  DOME_LOAD_DOC_IDS,
};
