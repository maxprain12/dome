'use strict';

const fs = require('fs');
const path = require('path');
const { ENTITY_CREATION_RULES, RESOURCE_LINK_INSTRUCTION } = require('./system-prompt.cjs');

const MARTIN_DIR = path.join(__dirname, '..', 'prompts', 'martin');

/**
 * Canonical description of dome_load_doc valid IDs.
 * Single source of truth — import this wherever dome_load_doc is defined.
 */
const DOME_LOAD_DOC_DESCRIPTION =
  'Load a reference doc section on demand. Call BEFORE using tools that require it. ' +
  'Valid ids: entity_rules (before agent_create/workflow_create/automation_create), ' +
  'artifacts (before emitting any artifact block), ' +
  'artifact_persisted (before updating/deleting a persisted artifact), ' +
  'artifact_design (before artifact_design / complex tabbed dossier layouts), ' +
  'resource_links (if unsure about dome:// link format), ' +
  'ppt_tool (before calling ppt_create — full PptxGenJS script guide + visual QA loop), ' +
  'docx_tool (before calling docx_create/docx_update — Word document guide), ' +
  'calendar_tool (before calling calendar_create_event — date inference + reminder rules), ' +
  'flashcard_tool (before calling flashcard_create — deck creation guide), ' +
  'excel_notebook_tool (before excel_get_file_path + notebook_add_cell — pandas flow), ' +
  'excel_artifact_tool (before artifact_create from Excel — interactive dashboard guide).';

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
 * @param {string} docId entity_rules | artifacts | artifact_persisted | artifact_design | resource_links
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
    case 'artifact_design':
      body = readMartin('artifact-design.txt');
      break;
    case 'resource_links':
      body = RESOURCE_LINK_INSTRUCTION;
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

module.exports = { getSectionBody, DOME_LOAD_DOC_DESCRIPTION };
