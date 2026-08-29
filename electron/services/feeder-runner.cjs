'use strict';

/* eslint-disable no-console */

const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { app } = require('electron');

const { parseJsonState, serializeArtifactRecord } = require('../artifacts/artifact-serialize.cjs');
const { afterArtifactMutation } = require('../artifacts/artifact-index-sync.cjs');
const { createFeederVault } = require('./feeder-vault.cjs');
const {
  applyUpdatePolicy,
  parseFeederJsonOutput,
  buildExcerpt,
  redactSecrets,
} = require('./artifact-data-merge.cjs');
const { serializeFeederRow } = require('./feeder-serialize.cjs');
const { checkPython } = require('../documents/notebook-python.cjs');
const vaultStore = require('../storage/vault-store.cjs');
const fileStorage = require('../storage/file-storage.cjs');
const {
  writeFeederSidecar,
  writeFeederRuntimeSidecar,
  writeFeederRunSidecar,
  readFeederScript,
} = require('../artifacts/feeder-vault-sidecar.cjs');

const MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const ALLOWED_INTERPRETERS = new Set(['python3', 'node', 'bash', 'sh', 'curl']);
const ALLOWED_POLICIES = new Set(['replace', 'merge_shallow', 'merge_deep', 'append_array']);
const ALLOWED_OUTPUT_MODES = new Set(['stdout_json', 'output_file']);

/** @type {{ path: string; runArgs: string[] }|null} */
let cachedPython = null;

/**
 * Feeders currently executing. Two concurrent runs of the same feeder would
 * share (and wipe) the same workspace dir, corrupting each other's script and
 * output files — so overlapping runs are rejected up front.
 * @type {Set<string>}
 */
const runningFeederIds = new Set();

async function resolvePythonBin() {
  if (cachedPython) return cachedPython;
  const info = await checkPython();
  if (!info?.available || !info?.path) {
    throw new Error('Python 3 not found on PATH. Install python3 to run python3 feeders.');
  }
  cachedPython = { path: info.path, runArgs: [] };
  return cachedPython;
}

function hashScript(script) {
  return crypto.createHash('sha256').update(String(script || ''), 'utf8').digest('hex');
}

function parseEnvSecretRefs(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((ref) => ({
      envName: String(ref?.envName || ref?.env_name || '').trim(),
      secretName: String(ref?.secretName || ref?.secret_name || ref?.name || '').trim(),
    }))
    .filter((ref) => ref.envName && ref.secretName);
}

/**
 * @param {string} workspace
 */
async function ensureCleanWorkspace(workspace) {
  await fsp.mkdir(workspace, { recursive: true });
  const entries = await fsp.readdir(workspace);
  await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(workspace, entry);
      await fsp.rm(full, { recursive: true, force: true });
    }),
  );
}

/**
 * Resolve the environment for a feeder child process.
 *
 * Precedence (later overrides earlier):
 *   1. `process.env` (host)
 *   2. `feeder.envStatic` (non-secret config)
 *   3. Auto-injected vault secrets — every secret in the vault is exposed as
 *      `process.env.<secretName>` by default, so feeders work without having
 *      to declare `envSecretRefs`. Host env names and `envStatic` keys are
 *      never overwritten (so a secret accidentally named `PATH` cannot break
 *      the spawn).
 *   4. `feeder.envSecretRefs` (explicit `envName ← secretName` aliases). These
 *      always win, so a feeder can still rename a secret if it needs to.
 *
 * @param {ReturnType<typeof createFeederVault>} vault
 * @param {Record<string, unknown>} feeder
 * @param {string} workspace
 */
async function resolveFeederEnv(vault, feeder, workspace) {
  /** @type {Record<string, string>} */
  const env = {
    ...process.env,
    FEEDER_WORKSPACE: workspace,
    OUTPUT_FILE: path.join(workspace, 'output.json'),
  };

  const staticEnv = typeof feeder.envStatic === 'object' && feeder.envStatic ? feeder.envStatic : {};
  /** @type {Set<string>} */
  const staticKeys = new Set();
  for (const [k, v] of Object.entries(staticEnv)) {
    if (!k) continue;
    const key = String(k);
    env[key] = String(v ?? '');
    staticKeys.add(key);
  }

  /** @type {string[]} */
  const secretValues = [];
  /** @type {Set<string>} */
  const injectedSecretNames = new Set();

  // 1) Auto-inject every vault secret as process.env.<secretName>. This is the
  //    common case: a feeder script reads `process.env.IDRAC_PASS` and the
  //    user only needs to add the secret named `IDRAC_PASS` in the vault.
  if (vault.isAvailable()) {
    try {
      const secrets = vault.listSecrets() || [];
      for (const meta of secrets) {
        const sname = meta?.name;
        if (!sname) continue;
        if (staticKeys.has(sname)) continue; // explicit static env wins
        if (process.env[sname] != null) continue; // never clobber host env
        const val = vault.getSecretValueByName(sname);
        if (val != null) {
          env[sname] = val;
          secretValues.push(val);
          injectedSecretNames.add(sname);
        }
      }
    } catch (err) {
      console.warn('[Feeders] vault auto-inject failed:', err?.message || err);
    }
  }

  // 2) Explicit envSecretRefs always win — used when the script expects a
  //    different env-var name than the secret's vault name.
  const refs = parseEnvSecretRefs(feeder.envSecretRefs);
  for (const ref of refs) {
    const val = vault.getSecretValueByName(ref.secretName);
    if (val == null) {
      throw new Error(`Missing feeder secret "${ref.secretName}" (env ${ref.envName})`);
    }
    env[ref.envName] = val;
    if (!injectedSecretNames.has(ref.secretName)) {
      secretValues.push(val);
    }
  }

  return { env, secretValues };
}

/**
 * @param {string} interpreter
 * @param {string} scriptPath
 * @param {Record<string, unknown>} feeder
 */
async function buildSpawnConfig(interpreter, scriptPath, feeder) {
  if (interpreter === 'python3') {
    const py = await resolvePythonBin();
    return { bin: py.path, args: [...py.runArgs, scriptPath] };
  }
  if (interpreter === 'node') {
    return {
      bin: process.execPath,
      args: [scriptPath],
      envFix: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }
  if (interpreter === 'bash') {
    return { bin: process.platform === 'win32' ? 'bash' : '/bin/bash', args: [scriptPath] };
  }
  if (interpreter === 'sh') {
    return { bin: process.platform === 'win32' ? 'sh' : '/bin/sh', args: [scriptPath] };
  }
  if (interpreter === 'curl') {
    let curlArgs = [];
    try {
      const parsed = JSON.parse(String(feeder.script || '[]'));
      if (!Array.isArray(parsed)) throw new Error('curl script must be a JSON array of arguments');
      curlArgs = parsed.map((a) => String(a));
    } catch (err) {
      throw new Error(`Invalid curl args JSON: ${err?.message || err}`);
    }
    return { bin: 'curl', args: curlArgs };
  }
  throw new Error(`Unsupported interpreter: ${interpreter}`);
}

/**
 * @param {string} bin
 * @param {string[]} args
 * @param {{ cwd: string, env: Record<string, string>, timeoutMs: number }} opts
 */
function runProcess(bin, args, opts) {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 2000);
    }, opts.timeoutMs);

    proc.stdout?.on('data', (chunk) => {
      if (stdout.length < MAX_BUFFER) stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk) => {
      if (stderr.length < MAX_BUFFER) stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}\n${err.message}`.trim(), exitCode: 1, killed, spawnError: err.message });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, killed });
    });
  });
}

/**
 * Persist parsed JSON into artifact state + runtime slot.
 * @param {import('../core/database.cjs')} database
 * @param {{ broadcast?: Function }} windowManager
 * @param {{ artifactResourceId: string, slot: string, updatePolicy: string, incoming: unknown, runId?: string|null, automationId?: string|null }} opts
 */
function applyDataToArtifact(database, windowManager, opts) {
  const queries = database.getQueries();
  const art = queries.getArtifactByResourceId.get(opts.artifactResourceId);
  if (!art) throw new Error('Linked artifact not found');

  const now = Date.now();
  let state = parseJsonState(art.state);
  const prevData =
    state.data !== undefined && state.data !== null && typeof state.data === 'object' && !Array.isArray(state.data)
      ? /** @type {Record<string, unknown>} */ (state.data)
      : {};
  const nextData = applyUpdatePolicy(prevData, opts.incoming, opts.updatePolicy || 'replace');
  state = { ...state, data: nextData };

  queries.updateArtifactState.run(JSON.stringify(state), now, opts.artifactResourceId);

  const slot = opts.slot || 'default';
  const rtExisting = queries.getArtifactRuntimeDataByArtifactSlot.get(art.id, slot);
  queries.upsertArtifactRuntimeData.run(
    rtExisting?.id || crypto.randomUUID(),
    art.id,
    slot,
    JSON.stringify(nextData),
    rtExisting?.schema_version ?? 1,
    opts.runId ?? null,
    opts.automationId ?? null,
    now,
  );

  const resource = queries.getResourceById.get(opts.artifactResourceId);
  const updatedArt = queries.getArtifactByResourceId.get(opts.artifactResourceId);
  const serialized = serializeArtifactRecord(updatedArt, resource, queries);
  if (serialized && windowManager?.broadcast) {
    windowManager.broadcast('artifact:updated', serialized);
  }
  try {
    const fileStorage = require('../storage/file-storage.cjs');
    vaultStore.writeArtifactHtmlMirror({ id: opts.artifactResourceId }, { database, fileStorage });
  } catch (e) {
    console.warn('[Feeders] artifact vault mirror failed:', e?.message || e);
  }
  afterArtifactMutation(database, opts.artifactResourceId);

  return { data: nextData, serialized };
}

function assertFeederApproved(feederRow) {
  const feeder = serializeFeederRow(feederRow);
  if (!feeder) throw new Error('Feeder not found');
  if (!feeder.enabled) throw new Error(`Feeder "${feeder.name}" is disabled`);
  if (!feeder.approved) {
    throw new Error(
      `Feeder "${feeder.name}" is not approved. Open the artifact Feeders panel and approve the script before running.`,
    );
  }
  if (feeder.approvedScriptHash && feeder.scriptHash !== feeder.approvedScriptHash) {
    throw new Error(
      `Feeder "${feeder.name}" script changed since approval. Re-approve the script before running.`,
    );
  }
  return feeder;
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {{ broadcast?: Function }} windowManager
 * @param {string} feederId
 * @param {{ triggeredBy?: 'agent'|'user'|'automation', automationId?: string|null }} [opts]
 */
async function runFeeder(database, windowManager, feederId, opts = {}) {
  const queries = database.getQueries();
  const row = queries.getFeederById.get(feederId);
  const feeder = assertFeederApproved(row);
  if (runningFeederIds.has(feederId)) {
    throw new Error(`Feeder "${feeder.name}" is already running`);
  }
  runningFeederIds.add(feederId);
  try {
    return await runFeederLocked(database, windowManager, feederId, feeder, opts);
  } finally {
    runningFeederIds.delete(feederId);
  }
}

/**
 * Map a feeder interpreter to its on-disk script extension. `curl` callers
 * never write a script file (handled separately), so it's not in this map.
 * @param {string} interpreter
 */
function interpreterScriptExtension(interpreter) {
  if (interpreter === 'python3') return '.py';
  if (interpreter === 'node') return '.js';
  return '.sh';
}

/**
 * Materialize the feeder script into the workspace so the child interpreter
 * can exec/eval it. Returns null for `curl` (no script file needed).
 * @param {Record<string, unknown>} feeder
 * @param {string} workspace
 * @param {string} scriptSource
 */
async function prepareInterpreterScript(feeder, workspace, scriptSource) {
  if (feeder.interpreter === 'curl') return null;
  const scriptPath = path.join(workspace, `feeder${interpreterScriptExtension(feeder.interpreter)}`);
  await fsp.writeFile(scriptPath, scriptSource, 'utf8');
  if (feeder.interpreter !== 'node') {
    await fsp.chmod(scriptPath, 0o700);
  }
  return scriptPath;
}

/**
 * Pick the most informative error message for a non-zero process result.
 * Prefers stderr (where Node/Python normally write tracebacks); falls back
 * to a stdout tail so the user sees more than "Process exited with code 1".
 * @param {string} capturedStdout
 * @param {string} capturedStderr
 */
function buildProcessFailureHint(capturedStdout, capturedStderr) {
  if (capturedStderr.trim().length > 0) return capturedStderr.trim();
  if (capturedStdout.trim().length > 0) return `(no stderr; stdout tail) ${capturedStdout.slice(-1200)}`;
  return '';
}

/**
 * Throw an Error describing why the child process failed. Returns void on
 * success so callers can use a single linear call site.
 * @param {{ killed?: boolean, exitCode?: number|null, spawnError?: string }} result
 * @param {string} capturedStdout
 * @param {string} capturedStderr
 * @param {number} timeoutMs
 */
function assertProcessSucceeded(result, capturedStdout, capturedStderr, timeoutMs) {
  if (result.killed) {
    const tail = capturedStdout ? ` (last stdout: ${capturedStdout.slice(-400)})` : '';
    throw new Error(`Feeder timed out after ${timeoutMs}ms${tail}`);
  }
  if (result.exitCode !== 0) {
    const hint = buildProcessFailureHint(capturedStdout, capturedStderr);
    const head = result.spawnError || `Process exited with code ${result.exitCode}`;
    throw new Error(hint ? `${head}\n${hint}` : head);
  }
}

/**
 * Resolve the JSON payload produced by a feeder run — either stdout
 * directly or the contents of $OUTPUT_FILE when configured.
 * @param {Record<string, unknown>} feeder
 * @param {string} capturedStdout
 * @param {Record<string, string>} env
 */
async function loadFeederOutput(feeder, capturedStdout, env) {
  if (feeder.outputMode !== 'output_file') return capturedStdout;
  try {
    return await fsp.readFile(env.OUTPUT_FILE, 'utf8');
  } catch (readErr) {
    throw new Error(
      `Feeder finished with exit 0 but OUTPUT_FILE (${env.OUTPUT_FILE}) was not created: ${readErr?.message || readErr}`,
    );
  }
}

/**
 * Throw if the feeder produced unparseable JSON, including a sample of the
 * raw output to make debugging easier.
 * @param {unknown} parsed
 * @param {string} jsonText
 * @param {Record<string, unknown>} feeder
 */
function validateParsedJson(parsed, jsonText, feeder) {
  if (parsed != null) return;
  const sample = String(jsonText || '').slice(0, 1200);
  throw new Error(
    sample
      ? `Feeder did not produce valid JSON (mode=${feeder.outputMode}). Output sample:\n${sample}`
      : `Feeder did not produce valid JSON output (mode=${feeder.outputMode}) — output was empty.`,
  );
}

/**
 * Persist the success state of a feeder run: DB updates, broadcast, and
 * sidecar writes. Returns the updated run record.
 * @param {Record<string, unknown>} runRecord
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {{ runId: string, feederId: string, result: { exitCode?: number|null }, stdoutExcerpt: string, stderrExcerpt: string, parsed: unknown }} ctx
 */
function completeRunRecord(runRecord, queries, ctx) {
  const dataBytes = Buffer.byteLength(JSON.stringify(ctx.parsed), 'utf8');
  const finishedAt = Date.now();
  queries.updateFeederRun.run(
    finishedAt,
    'completed',
    ctx.result.exitCode ?? 0,
    ctx.stdoutExcerpt,
    ctx.stderrExcerpt,
    dataBytes,
    ctx.runId,
  );
  queries.updateFeederLastRun.run(finishedAt, 'completed', null, finishedAt, ctx.feederId);
  return {
    ...runRecord,
    finishedAt,
    status: 'completed',
    exitCode: ctx.result.exitCode ?? 0,
    stdoutExcerpt: ctx.stdoutExcerpt,
    stderrExcerpt: ctx.stderrExcerpt,
    dataBytes,
  };
}

/**
 * Persist the failure state of a feeder run: DB updates, console error,
 * broadcast, and run sidecar. Returns the updated run record.
 * @param {{
 *   database: import('../core/database.cjs'),
 *   fileStorage: typeof fileStorage,
 *   windowManager: { broadcast?: Function },
 *   queries: ReturnType<import('../core/database.cjs')['getQueries']>,
 *   runRecord: Record<string, unknown>,
 *   runId: string,
 *   feederId: string,
 *   feederName: string,
 *   capturedStdout: string,
 *   capturedStderr: string,
 *   capturedExitCode: number|null,
 *   secretValues: string[],
 *   err: unknown,
 * }} ctx
 */
async function persistFailedRun(ctx) {
  const finishedAt = Date.now();
  const message = ctx.err?.message || String(ctx.err);
  // Preserve whatever the process actually emitted — the previous
  // implementation overwrote stdout with '' on failure, which made
  // debugging Node feeders very hard.
  const stdoutExcerpt = redactSecrets(buildExcerpt(ctx.capturedStdout), ctx.secretValues);
  const stderrExcerpt = redactSecrets(
    buildExcerpt(ctx.capturedStderr || message),
    ctx.secretValues,
  );
  const exitCode = ctx.capturedExitCode ?? 1;
  ctx.queries.updateFeederRun.run(
    finishedAt,
    'failed',
    exitCode,
    stdoutExcerpt,
    stderrExcerpt,
    0,
    ctx.runId,
  );
  ctx.queries.updateFeederLastRun.run(finishedAt, 'failed', message, finishedAt, ctx.feederId);
  const failed = {
    ...ctx.runRecord,
    finishedAt,
    status: 'failed',
    exitCode,
    stdoutExcerpt,
    stderrExcerpt,
  };
  console.error(
    `[Feeders] run failed feeder="${ctx.feederName}" id=${ctx.feederId} exit=${exitCode}\n  message: ${message}\n  stdout(tail): ${ctx.capturedStdout.slice(-600)}\n  stderr(tail): ${ctx.capturedStderr.slice(-600)}`,
  );
  if (ctx.windowManager?.broadcast) {
    ctx.windowManager.broadcast('feeder:run-completed', {
      feederId: ctx.feederId,
      run: failed,
      error: message,
    });
  }
  await writeFeederRunSidecar(ctx.database, ctx.fileStorage, ctx.feederId, failed);
  return failed;
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {{ broadcast?: Function }} windowManager
 * @param {string} feederId
 * @param {ReturnType<typeof serializeFeederRow>} feeder
 * @param {{ triggeredBy?: 'agent'|'user'|'automation', automationId?: string|null }} opts
 */
async function runFeederLocked(database, windowManager, feederId, feeder, opts) {
  const queries = database.getQueries();
  const vault = createFeederVault(database);
  if (!vault.isAvailable() && parseEnvSecretRefs(feeder.envSecretRefs).length > 0) {
    throw new Error('Feeder secrets vault unavailable; cannot resolve required secrets.');
  }

  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const triggeredBy = opts.triggeredBy || 'user';
  const workspace = path.join(app.getPath('userData'), 'feeders', feederId, 'workspace');
  await ensureCleanWorkspace(workspace);

  /** @type {Record<string, unknown>} */
  let runRecord = {
    id: runId,
    feederId,
    startedAt,
    finishedAt: null,
    status: 'running',
    exitCode: null,
    stdoutExcerpt: '',
    stderrExcerpt: '',
    dataBytes: 0,
    triggeredBy,
    automationId: opts.automationId ?? null,
  };

  queries.createFeederRun.run(
    runId,
    feederId,
    startedAt,
    null,
    'running',
    null,
    '',
    '',
    0,
    triggeredBy,
    opts.automationId ?? null,
  );

  let secretValues = [];
  /** @type {string} */
  let capturedStdout = '';
  /** @type {string} */
  let capturedStderr = '';
  /** @type {number|null} */
  let capturedExitCode = null;
  try {
    const { env, secretValues: resolvedSecrets } = await resolveFeederEnv(vault, feeder, workspace);
    secretValues = resolvedSecrets;

    const scriptSource = readFeederScript(database, fileStorage, feederId) || String(feeder.script || '');
    const scriptPath = await prepareInterpreterScript(feeder, workspace, scriptSource);

    const spawnCfg = await buildSpawnConfig(feeder.interpreter, scriptPath || '', feeder);
    const procEnv = { ...env, ...(spawnCfg.envFix || {}) };
    const timeoutMs = Math.min(Math.max(Number(feeder.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
    const result = await runProcess(spawnCfg.bin, spawnCfg.args, {
      cwd: workspace,
      env: procEnv,
      timeoutMs,
    });

    capturedStdout = result.stdout || '';
    capturedStderr = result.stderr || '';
    capturedExitCode = result.exitCode ?? null;

    const stdoutExcerpt = redactSecrets(buildExcerpt(capturedStdout), secretValues);
    const stderrExcerpt = redactSecrets(buildExcerpt(capturedStderr), secretValues);

    assertProcessSucceeded(result, capturedStdout, capturedStderr, timeoutMs);

    const jsonText = await loadFeederOutput(feeder, capturedStdout, env);
    const parsed = parseFeederJsonOutput(jsonText, feeder.outputMode);
    validateParsedJson(parsed, jsonText, feeder);

    applyDataToArtifact(database, windowManager, {
      artifactResourceId: feeder.artifactResourceId,
      slot: feeder.slot,
      updatePolicy: feeder.updatePolicy,
      incoming: parsed,
      runId,
      automationId: opts.automationId ?? null,
    });

    runRecord = completeRunRecord(runRecord, queries, {
      runId,
      feederId,
      result,
      stdoutExcerpt,
      stderrExcerpt,
      parsed,
    });

    if (windowManager?.broadcast) {
      windowManager.broadcast('feeder:run-completed', { feederId, run: runRecord });
    }

    await writeFeederRuntimeSidecar(database, fileStorage, feederId, parsed, feeder.slot);
    await writeFeederRunSidecar(database, fileStorage, feederId, runRecord);
    await writeFeederSidecar(database, fileStorage, feederId);

    return { success: true, run: runRecord, feeder };
  } catch (err) {
    runRecord = await persistFailedRun({
      database,
      fileStorage,
      windowManager,
      queries,
      runRecord,
      runId,
      feederId,
      feederName: feeder.name,
      capturedStdout,
      capturedStderr,
      capturedExitCode,
      secretValues,
      err,
    });
    throw err;
  }
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {Record<string, unknown>} input
 */
function createFeederRecord(database, input) {
  const queries = database.getQueries();
  const interpreter = ALLOWED_INTERPRETERS.has(String(input.interpreter))
    ? String(input.interpreter)
    : 'python3';
  const outputMode = ALLOWED_OUTPUT_MODES.has(String(input.outputMode || input.output_mode))
    ? String(input.outputMode || input.output_mode)
    : 'stdout_json';
  const updatePolicy = ALLOWED_POLICIES.has(String(input.updatePolicy || input.update_policy))
    ? String(input.updatePolicy || input.update_policy)
    : 'replace';
  const timeoutMs = Math.min(
    Math.max(Number(input.timeoutMs ?? input.timeout_ms) || DEFAULT_TIMEOUT_MS, 1000),
    MAX_TIMEOUT_MS,
  );
  const script = String(input.script || '');
  if (!script.trim()) throw new Error('script is required');
  const artifactResourceId = String(input.artifactResourceId || input.artifact_resource_id || '').trim();
  if (!artifactResourceId) throw new Error('artifactResourceId is required');
  const art = queries.getArtifactByResourceId.get(artifactResourceId);
  if (!art) throw new Error('Artifact not found');

  const now = Date.now();
  const id = String(input.id || crypto.randomUUID());
  const scriptHash = hashScript(script);
  queries.createFeeder.run(
    id,
    artifactResourceId,
    String(input.slot || 'default'),
    String(input.name || 'Feeder').trim(),
    input.description ? String(input.description) : null,
    interpreter,
    script,
    scriptHash,
    JSON.stringify(parseEnvSecretRefs(input.envSecretRefs || input.env_secret_refs || [])),
    JSON.stringify(input.envStatic || input.env_static || {}),
    outputMode,
    updatePolicy,
    timeoutMs,
    input.enabled === false ? 0 : 1,
    0,
    null,
    null,
    null,
    null,
    now,
    now,
  );
  void writeFeederSidecar(database, fileStorage, id);
  return serializeFeederRow(queries.getFeederById.get(id));
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {string} feederId
 * @param {string} script
 */
function updateFeederScript(database, feederId, script) {
  const queries = database.getQueries();
  const existing = queries.getFeederById.get(feederId);
  if (!existing) throw new Error('Feeder not found');
  const scriptHash = hashScript(script);
  const now = Date.now();
  queries.updateFeederScript.run(String(script), scriptHash, 0, null, now, feederId);
  void writeFeederSidecar(database, fileStorage, feederId);
  return serializeFeederRow(queries.getFeederById.get(feederId));
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {string} feederId
 */
function approveFeeder(database, feederId) {
  const queries = database.getQueries();
  const existing = queries.getFeederById.get(feederId);
  if (!existing) throw new Error('Feeder not found');
  const now = Date.now();
  queries.approveFeeder.run(1, existing.script_hash, now, feederId);
  void writeFeederSidecar(database, fileStorage, feederId);
  return serializeFeederRow(queries.getFeederById.get(feederId));
}

function isFeederRunning(feederId) {
  return runningFeederIds.has(feederId);
}

module.exports = {
  runFeeder,
  isFeederRunning,
  createFeederRecord,
  updateFeederScript,
  approveFeeder,
  hashScript,
  ALLOWED_INTERPRETERS,
  ALLOWED_POLICIES,
  ALLOWED_OUTPUT_MODES,
};
