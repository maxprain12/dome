/* eslint-disable no-console */
/**
 * Provision / disable KB LLM scheduled automations per project.
 */
const fs = require('fs');
const path = require('path');
const runEngine = require('./run-engine.cjs');
const {
  KB_GLOBAL_KEY,
  projectKey,
  parseJson,
  defaultGlobalConfig,
  effectiveKbEnabled,
} = require('./kb-llm-shared.cjs');

const COMPILE_TOOLS = [
  'resource_search',
  'resource_hybrid_search',
  'resource_get',
  'resource_get_section',
  'resource_semantic_search',
  'resource_list',
  'resource_create',
  'resource_update',
  'link_resources',
  'get_related_resources',
];

const HEALTH_TOOLS = [
  'resource_search',
  'resource_hybrid_search',
  'resource_get',
  'resource_semantic_search',
  'resource_list',
  'web_search',
  'web_fetch',
  'resource_update',
  'link_resources',
];

const PLACEHOLDER_AGENT_ID = 'kbllm-system';

function readPromptFile(filename) {
  const base = path.join(__dirname, '..', 'prompts', filename);
  try {
    return fs.readFileSync(base, 'utf8');
  } catch (e) {
    console.warn('[KB LLM] Could not read prompt', filename, e?.message);
    return `# ${filename}\n(Missing prompt file.)`;
  }
}

function getGlobalFromDb(queries) {
  const row = queries.getSetting.get(KB_GLOBAL_KEY);
  const merged = { ...defaultGlobalConfig(), ...parseJson(row?.value, {}) };
  return merged;
}

function getProjectOverrideFromDb(queries, projectId) {
  const row = queries.getSetting.get(projectKey(projectId));
  return parseJson(row?.value, { override: 'inherit' });
}

function automationIds(projectId) {
  return {
    compile: `kbllm-compile-${projectId}`,
    health: `kbllm-health-${projectId}`,
  };
}

function disablePair(projectId) {
  const ids = automationIds(projectId);
  for (const id of [ids.compile, ids.health]) {
    const existing = runEngine.getAutomation(id);
    if (existing) {
      runEngine.upsertAutomation({ ...existing, enabled: false });
    }
  }
}

/**
 * @param {import('better-sqlite3').Database} database
 * @param {string} projectId
 */
function syncKbLlmForProject(database, projectId) {
  const queries = database.getQueries();
  const global = getGlobalFromDb(queries);
  const override = getProjectOverrideFromDb(queries, projectId);
  const enabled = effectiveKbEnabled(global, override);

  if (!enabled) {
    disablePair(projectId);
    return { success: true, enabled: false, projectId };
  }

  const compileInterval =
    typeof override.compileIntervalMinutes === 'number' && override.compileIntervalMinutes >= 15
      ? override.compileIntervalMinutes
      : global.compileIntervalMinutes || 360;

  const healthHour =
    typeof override.healthHour === 'number' && override.healthHour >= 0 && override.healthHour <= 23
      ? override.healthHour
      : typeof global.healthHour === 'number'
        ? global.healthHour
        : 4;

  const allowWrite = global.allowAutoWrite !== false;
  const compilePrompt = readPromptFile('kb-wiki-compile.md');
  const healthPrompt = readPromptFile('kb-wiki-health.md');

  const ids = automationIds(projectId);
  const userPreamble = `Project ID: ${projectId}\nGlobal KB LLM: enabled. Output may create or update notes when allowed.\n\n`;

  runEngine.upsertAutomation({
    id: ids.compile,
    projectId,
    title: 'KB LLM: Wiki compile',
    description: 'Compilación incremental de wiki desde recursos del proyecto (KB LLM).',
    targetType: 'agent',
    targetId: PLACEHOLDER_AGENT_ID,
    triggerType: 'schedule',
    schedule: {
      cadence: 'cron-lite',
      intervalMinutes: Math.min(Math.max(compileInterval, 15), 24 * 60),
    },
    inputTemplate: {
      prompt: `${userPreamble}${compilePrompt}`,
      projectId,
      toolIds: COMPILE_TOOLS,
    },
    outputMode: allowWrite ? 'note' : 'chat_only',
    enabled: true,
    legacySource: 'kb_llm',
  });

  runEngine.upsertAutomation({
    id: ids.health,
    projectId,
    title: 'KB LLM: Wiki health',
    description: 'Lint y salud del corpus wiki (KB LLM).',
    targetType: 'agent',
    targetId: PLACEHOLDER_AGENT_ID,
    triggerType: 'schedule',
    schedule: {
      cadence: 'daily',
      hour: healthHour,
    },
    inputTemplate: {
      prompt: `${userPreamble}${healthPrompt}`,
      projectId,
      toolIds: HEALTH_TOOLS,
    },
    outputMode: allowWrite ? 'note' : 'chat_only',
    enabled: true,
    legacySource: 'kb_llm',
  });

  return { success: true, enabled: true, projectId };
}

function listProjectIds(database) {
  const queries = database.getQueries();
  const rows = queries.getProjects.all();
  return Array.isArray(rows) ? rows.map((r) => r.id) : [];
}

function syncKbLlmAllProjects(database) {
  const ids = listProjectIds(database);
  const results = [];
  for (const pid of ids) {
    try {
      results.push(syncKbLlmForProject(database, pid));
    } catch (e) {
      console.error('[KB LLM] sync project failed', pid, e);
      results.push({ success: false, projectId: pid, error: e?.message || String(e) });
    }
  }
  return { success: true, results };
}

module.exports = {
  syncKbLlmForProject,
  syncKbLlmAllProjects,
  getGlobalFromDb,
  getProjectOverrideFromDb,
  automationIds,
  KB_GLOBAL_KEY,
  projectKey,
};
