'use strict';

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function serializeFeederRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    artifactResourceId: row.artifact_resource_id,
    slot: row.slot || 'default',
    name: row.name,
    description: row.description ?? '',
    interpreter: row.interpreter,
    script: row.script,
    scriptHash: row.script_hash,
    envSecretRefs: parseJsonField(row.env_secret_refs, []),
    envStatic: parseJsonField(row.env_static, {}),
    outputMode: row.output_mode || 'stdout_json',
    updatePolicy: row.update_policy || 'replace',
    timeoutMs: row.timeout_ms ?? 60000,
    enabled: row.enabled === 1 || row.enabled === true,
    approved: row.approved === 1 || row.approved === true,
    approvedScriptHash: row.approved_script_hash ?? null,
    lastRunAt: row.last_run_at ?? null,
    lastStatus: row.last_status ?? null,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function serializeFeederRunRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    feederId: row.feeder_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    status: row.status,
    exitCode: row.exit_code ?? null,
    stdoutExcerpt: row.stdout_excerpt ?? '',
    stderrExcerpt: row.stderr_excerpt ?? '',
    dataBytes: row.data_bytes ?? 0,
    triggeredBy: row.triggered_by,
    automationId: row.automation_id ?? null,
  };
}

module.exports = { serializeFeederRow, serializeFeederRunRow, parseJsonField };
