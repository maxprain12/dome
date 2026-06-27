#!/usr/bin/env node
/**
 * Verify dome_load_doc prompt bodies mention the tools they document and avoid
 * legacy API shapes (camelCase wrappers, wrong flashcard fields, etc.).
 *
 * Run: node scripts/check-prompt-tool-parity.mjs
 * CI-safe: no electron require, no native deps.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

/** @typedef {{ docId: string, relPath: string, requiredTools: string[], optionalTools?: string[], allowWildcards?: string[] }} DocSpec */

const errors = [];
const warnings = [];

/** Parse `packages/tools/src/families.ts` → tool name set + family map. */
function loadToolFamilies() {
  const src = fs.readFileSync(
    path.join(root, 'packages/tools/src/families.ts'),
    'utf8',
  );
  /** @type {Record<string, string>} */
  const families = {};
  const re = /([a-z][a-z0-9_]+):\s*'([a-z]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    families[m[1]] = m[2];
  }
  return families;
}

/** @param {Record<string, string>} families @param {string} family */
function toolsInFamily(families, family) {
  return Object.keys(families).filter((n) => families[n] === family).sort();
}

/** @param {string} text @param {string} toolName */
function promptMentionsTool(text, toolName) {
  if (text.includes(`\`${toolName}\``)) return true;
  const re = new RegExp(`(^|[^a-z0-9_])${toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9_]|$)`);
  return re.test(text);
}

/** @param {string} text @param {string} prefix e.g. excel_ */
function promptMentionsFamilyPrefix(text, prefix) {
  if (text.includes(`${prefix}*`)) return true;
  const re = new RegExp(`\`${prefix}[a-z0-9_]+\``);
  return re.test(text);
}

/** @param {string} text @param {Set<string>} knownTools */
function extractUnknownToolMentions(text, knownTools) {
  /** @type {string[]} */
  const unknown = [];
  const backtickRe = /`([a-z][a-z0-9_]{2,})`/g;
  let m;
  while ((m = backtickRe.exec(text)) !== null) {
    const name = m[1];
    if (knownTools.has(name)) continue;
    // Skip artifact inline types, CSS tokens, enum literals commonly backticked
    if (SKIP_BACKTICK.has(name)) continue;
    // Looks like a tool name (has underscore) but isn't registered
    if (name.includes('_')) unknown.push(name);
  }
  return [...new Set(unknown)];
}

/** Backtick tokens that are not tools. */
const SKIP_BACKTICK = new Set([
  'artifact_type',
  'artifact_persisted',
  'artifact_design',
  'entity_rules',
  'resource_links',
  'feeders',
  'ppt_tool',
  'docx_tool',
  'calendar_tool',
  'flashcard_tool',
  'excel_notebook_tool',
  'excel_artifact_tool',
  'email_tool',
  'github_tool',
  'created_entity',
  'stdout_json',
  'output_file',
  'merge_shallow',
  'merge_deep',
  'append_array',
  'cron_lite',
  'task_tracker',
  'custom',
  'layout_16x9',
  'dome_theme',
  'dome_data',
  'active_tab',
  'resource_id',
  'project_id',
  'folder_id',
  'message_id',
  'event_id',
  'repo_id',
  'issue_id',
  'data_patch',
  'artifact_resource_id',
  'linked_resource_id',
  'window_minutes',
  'page_size',
  'account_id',
  'target_type',
  'target_id',
  'trigger_type',
  'output_mode',
  'update_policy',
  'env_name',
  'secret_name',
  'env_static',
  'env_secret_refs',
  'interval_minutes',
  'start_at',
  'end_at',
  'calendar_ids',
  'all_day',
  'source_ids',
  'file_path',
  'app_password_required',
  'auth_failed',
  'connection_failed',
  'selected_only',
  'milestone_number',
  'due_on',
  'tool_ids',
  'system_instructions',
  'include_content',
  'max_content_length',
  'sheet_name',
  'data_dome_key',
]);

/** @param {Record<string, string>} families */
function buildDocSpecs(families) {
  /** @type {DocSpec[]} */
  const specs = [
    {
      docId: 'entity_rules',
      relPath: 'packages/prompts/sections/entity-rules.txt',
      requiredTools: [
        'agent_create',
        'workflow_create',
        'automation_create',
        'marketplace_install',
      ],
      allowWildcards: ['calendar_', 'excel_', 'resource_'],
    },
    {
      docId: 'resource_links',
      relPath: 'packages/prompts/sections/resource-links.txt',
      requiredTools: [],
    },
    {
      docId: 'artifacts',
      relPath: 'packages/tools/src/domains/artifacts/prompt.txt',
      requiredTools: ['artifact_create', 'artifact_design', 'dome_load_doc'],
      optionalTools: ['artifact_merge_data', 'artifact_update_state'],
    },
    {
      docId: 'artifact_persisted',
      relPath: 'packages/tools/src/domains/artifacts/prompt-persisted.txt',
      requiredTools: toolsInFamily(families, 'artifacts'),
    },
    {
      docId: 'artifact_design',
      relPath: 'packages/tools/src/domains/artifacts/prompt-design.txt',
      requiredTools: ['artifact_design', 'artifact_create', 'dome_load_doc'],
    },
    {
      docId: 'feeders',
      relPath: 'packages/tools/src/domains/feeders/prompt.txt',
      requiredTools: toolsInFamily(families, 'feeders'),
      optionalTools: ['artifact_create', 'automation_create'],
    },
    {
      docId: 'ppt_tool',
      relPath: 'packages/tools/src/domains/office/prompt-ppt.txt',
      requiredTools: [
        'ppt_create',
        'ppt_get_file_path',
        'ppt_get_slides',
        'ppt_get_slide_images',
        'ppt_export',
      ],
      optionalTools: [
        'resource_get_library_overview',
        'get_library_overview',
        'resource_list',
        'resource_get',
        'resource_hybrid_search',
        'excel_get',
      ],
    },
    {
      docId: 'docx_tool',
      relPath: 'packages/tools/src/domains/office/prompt-docx.txt',
      requiredTools: [
        'docx_get',
        'docx_get_file_path',
        'docx_create',
        'docx_update',
        'docx_delete',
      ],
      optionalTools: ['resource_hybrid_search', 'resource_get', 'resource_create'],
    },
    {
      docId: 'calendar_tool',
      relPath: 'packages/tools/src/domains/calendar/prompt.txt',
      requiredTools: toolsInFamily(families, 'calendar'),
    },
    {
      docId: 'flashcard_tool',
      relPath: 'packages/tools/src/domains/flashcards/prompt.txt',
      requiredTools: ['flashcard_create'],
      optionalTools: ['resource_hybrid_search', 'resource_get', 'resource_get_section'],
    },
    {
      docId: 'excel_notebook_tool',
      relPath: 'packages/tools/src/domains/office/prompt-excel-notebook.txt',
      requiredTools: [
        'excel_get_file_path',
        'notebook_get',
        'notebook_add_cell',
        'notebook_update_cell',
        'notebook_delete_cell',
      ],
    },
    {
      docId: 'excel_artifact_tool',
      relPath: 'packages/tools/src/domains/office/prompt-excel-artifact.txt',
      requiredTools: [
        'excel_get',
        'artifact_create',
        'artifact_link_resource',
        'artifact_design',
        'dome_load_doc',
      ],
      optionalTools: ['artifact_merge_data', 'artifact_update_state'],
    },
    {
      docId: 'email_tool',
      relPath: 'packages/tools/src/domains/email/prompt.txt',
      requiredTools: toolsInFamily(families, 'email'),
    },
    {
      docId: 'github_tool',
      relPath: 'packages/tools/src/domains/github/prompt.txt',
      requiredTools: toolsInFamily(families, 'github'),
    },
  ];
  return specs;
}

/** Legacy API shapes that must not appear in operational prompts. */
const LEGACY_PATTERNS = [
  {
    relPaths: [
      'packages/tools/src/domains/artifacts/prompt-persisted.txt',
      'packages/tools/src/domains/artifacts/prompt.txt',
      'packages/tools/src/domains/office/prompt-excel-artifact.txt',
    ],
    checks: [
      { re: /\bartifactType\b/, msg: 'use artifact_type (snake_case tool param)' },
      {
        re: /artifact_create[^.\n]*\blinkedResourceId\b|\{[^}]*linkedResourceId[^}]*\}/,
        msg: 'link via artifact_link_resource({ artifact_resource_id, linked_resource_id })',
      },
      { re: /\bprojectId\b(?!\s*→)/, msg: 'use project_id' },
      { re: /\bfolderId\b/, msg: 'use folder_id' },
      { re: /artifactResourceId/, msg: 'use artifact_resource_id' },
      { re: /artifact_create\s*\([^)]*state:\s*\{/, msg: 'artifact_create uses flat html/data params' },
    ],
  },
  {
    relPaths: ['packages/tools/src/domains/flashcards/prompt.txt'],
    checks: [
      {
        re: /cards[^.\n]*\bfront\b|\bfront\b[^.\n]*\bback\b|"front"\s*:|"back"\s*:/,
        msg: 'flashcards use question/answer (not front/back schema fields)',
      },
    ],
  },
];

/** Required param names that operational prompts should document for key tools. */
const REQUIRED_PARAM_MENTIONS = [
  {
    relPaths: ['packages/tools/src/domains/calendar/prompt.txt'],
    tool: 'calendar_get_upcoming',
    params: ['window_minutes', 'limit'],
  },
  {
    relPaths: ['packages/tools/src/domains/artifacts/prompt-persisted.txt'],
    tool: 'artifact_merge_data',
    params: ['data_patch'],
  },
  {
    relPaths: ['packages/tools/src/domains/feeders/prompt.txt'],
    tool: 'feeder_create',
    params: ['artifact_resource_id'],
  },
];

function verifyManifestSync() {
  const manifestTs = fs.readFileSync(
    path.join(root, 'packages/tools/src/domains/manifest.ts'),
    'utf8',
  );
  const idsFromTs = [...manifestTs.matchAll(/'([a-z_]+)'/g)]
    .map((x) => x[1])
    .filter((id) => id.includes('_') || id === 'artifacts' || id === 'feeders' || id === 'entity_rules' || id === 'resource_links' || id.startsWith('artifact'));

  // Parse DOME_LOAD_DOC_IDS array explicitly
  const arrMatch = manifestTs.match(/DOME_LOAD_DOC_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!arrMatch) {
    errors.push('Could not parse DOME_LOAD_DOC_IDS from manifest.ts');
    return;
  }
  const tsIds = [...arrMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

  const { DOC_MANIFEST } = require('../electron/prompts/tool-prompt-loader.cjs');
  const loaderIds = Object.keys(DOC_MANIFEST).sort();

  if (tsIds.join(',') !== loaderIds.join(',')) {
    errors.push(
      `manifest.ts ids mismatch tool-prompt-loader.cjs:\n  manifest.ts: ${tsIds.join(', ')}\n  loader:      ${loaderIds.join(', ')}`,
    );
  }
  void idsFromTs;
}

function main() {
  const families = loadToolFamilies();
  const knownTools = new Set(Object.keys(families));
  const specs = buildDocSpecs(families);

  verifyManifestSync();

  for (const spec of specs) {
    const abs = path.join(root, spec.relPath);
    if (!fs.existsSync(abs)) {
      errors.push(`[${spec.docId}] missing prompt file: ${spec.relPath}`);
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');

    for (const tool of spec.requiredTools) {
      if (promptMentionsTool(text, tool)) continue;
      if (spec.allowWildcards?.some((pfx) => tool.startsWith(pfx) && promptMentionsFamilyPrefix(text, pfx))) {
        continue;
      }
      errors.push(`[${spec.docId}] required tool not documented: ${tool} (${spec.relPath})`);
    }

    for (const unknown of extractUnknownToolMentions(text, knownTools)) {
      // Cross-family helpers are OK when listed as optional
      if (spec.optionalTools?.includes(unknown)) continue;
      warnings.push(`[${spec.docId}] mentions unregistered tool \`${unknown}\` — verify spelling or add to TOOL_FAMILIES`);
    }
  }

  for (const group of LEGACY_PATTERNS) {
    for (const rel of group.relPaths) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      for (const { re, msg } of group.checks) {
        if (re.test(text)) {
          errors.push(`[legacy API] ${rel}: ${msg}`);
        }
      }
    }
  }

  for (const rule of REQUIRED_PARAM_MENTIONS) {
    for (const rel of rule.relPaths) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      for (const param of rule.params) {
        if (!text.includes(param)) {
          errors.push(`[${rel}] should document \`${param}\` for ${rule.tool}`);
        }
      }
    }
  }

  if (warnings.length) {
    console.warn('[check-prompt-tool-parity] warnings:');
    for (const w of warnings) console.warn('  ⚠', w);
  }

  if (errors.length) {
    console.error('[check-prompt-tool-parity] FAILED\n');
    for (const e of errors) console.error('  ✗', e);
    process.exit(1);
  }

  console.log(
    '[check-prompt-tool-parity] OK —',
    specs.length,
    'dome_load_doc prompts checked against',
    knownTools.size,
    'registered tools',
  );
}

main();
