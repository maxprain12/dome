/* eslint-disable no-console */
/**
 * Shared KB LLM config helpers (no heavy deps — safe from database.cjs).
 */

const KB_GLOBAL_KEY = 'kb_llm_global';

function projectKey(projectId) {
  return `kb_llm_project:${projectId}`;
}

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function defaultGlobalConfig() {
  return {
    enabledGlobal: false,
    defaultMode: 'full_auto',
    compileIntervalMinutes: 360,
    healthHour: 4,
    autoReindexWikiOnSave: true,
    allowAutoWrite: true,
  };
}

/**
 * @param {Record<string, unknown>} global
 * @param {Record<string, unknown>} projectOverride
 */
function effectiveKbEnabled(global, projectOverride) {
  const g = global && typeof global === 'object' ? global : {};
  const o = projectOverride && typeof projectOverride === 'object' ? projectOverride : {};
  const mode = o.override === 'enabled' || o.override === 'disabled' || o.override === 'inherit'
    ? o.override
    : 'inherit';
  if (mode === 'disabled') return false;
  if (mode === 'enabled') return true;
  return !!g.enabledGlobal;
}

module.exports = {
  KB_GLOBAL_KEY,
  projectKey,
  parseJson,
  defaultGlobalConfig,
  effectiveKbEnabled,
};
