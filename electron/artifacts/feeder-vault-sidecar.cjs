'use strict';

/**
 * Persist artifact feeders beside their vault HTML mirror:
 *
 *   Mi dashboard.html
 *   Mi dashboard.dome/
 *     feeders/
 *       <feederId>/
 *         feeder.json
 *         script.py|js|sh
 *         runtime/default.json
 *         runs/latest.json
 *
 * Secrets are NEVER written here — they stay in feeder_secrets (safeStorage).
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { artifactSidecarRelPath } = require('./artifact-vault-mirror.cjs');
const { serializeFeederRow, parseJsonField } = require('../services/feeder-serialize.cjs');
const vaultStore = require('../storage/vault-store.cjs');

const FEEDERS_DIR = 'feeders';

function scriptExtension(interpreter) {
  if (interpreter === 'python3') return '.py';
  if (interpreter === 'node') return '.js';
  if (interpreter === 'curl') return '.curl.json';
  return '.sh';
}

function scriptFilename(interpreter) {
  return `script${scriptExtension(interpreter)}`;
}

function getArtifactSidecarAbs(resource, queries, fileStorage) {
  if (!resource?.vault_path) return null;
  const root = vaultStore.getProjectVaultRoot(resource.project_id, queries, fileStorage);
  return path.join(root, artifactSidecarRelPath(resource.vault_path));
}

function getFeederDirAbs(resource, queries, fileStorage, feederId) {
  const sidecar = getArtifactSidecarAbs(resource, queries, fileStorage);
  if (!sidecar) return null;
  return path.join(sidecar, FEEDERS_DIR, feederId);
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function buildFeederManifest(row) {
  const feeder = serializeFeederRow(row);
  if (!feeder) return null;
  return {
    version: 1,
    id: feeder.id,
    artifactResourceId: feeder.artifactResourceId,
    slot: feeder.slot,
    name: feeder.name,
    description: feeder.description,
    interpreter: feeder.interpreter,
    scriptFile: scriptFilename(feeder.interpreter),
    envSecretRefs: feeder.envSecretRefs,
    envStatic: feeder.envStatic,
    outputMode: feeder.outputMode,
    updatePolicy: feeder.updatePolicy,
    timeoutMs: feeder.timeoutMs,
    enabled: feeder.enabled,
    approved: feeder.approved,
    approvedScriptHash: feeder.approvedScriptHash,
    scriptHash: feeder.scriptHash,
    lastRunAt: feeder.lastRunAt,
    lastStatus: feeder.lastStatus,
    lastError: feeder.lastError,
    updatedAt: feeder.updatedAt,
  };
}

async function ensureDir(abs) {
  await fsp.mkdir(abs, { recursive: true });
}

/**
 * Mirror a feeder row to disk under the artifact sidecar.
 * @param {import('../core/database.cjs')} database
 * @param {import('../storage/file-storage.cjs')} fileStorage
 * @param {string} feederId
 */
async function writeFeederSidecar(database, fileStorage, feederId) {
  const queries = database.getQueries();
  const row = queries.getFeederById.get(feederId);
  if (!row) return { success: false, error: 'Feeder not found' };

  const resource = queries.getResourceById.get(row.artifact_resource_id);
  if (!resource?.vault_path) {
    vaultStore.writeArtifactHtmlMirror({ id: row.artifact_resource_id }, { database, fileStorage });
  }
  const resource2 = queries.getResourceById.get(row.artifact_resource_id);
  const feederDir = getFeederDirAbs(resource2, queries, fileStorage, feederId);
  if (!feederDir) return { success: false, error: 'Artifact has no vault mirror yet' };

  await ensureDir(feederDir);
  const manifest = buildFeederManifest(row);
  const manifestPath = path.join(feederDir, 'feeder.json');
  const scriptPath = path.join(feederDir, scriptFilename(row.interpreter));
  const contents = JSON.stringify(manifest, null, 2);
  vaultStore.markSelfWrite(manifestPath, vaultStore.contentHash(contents));
  await fsp.writeFile(manifestPath, contents, 'utf8');
  const scriptContents = String(row.script || '');
  vaultStore.markSelfWrite(scriptPath, vaultStore.contentHash(scriptContents));
  await fsp.writeFile(scriptPath, scriptContents, 'utf8');

  return { success: true, dir: feederDir };
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {import('../storage/file-storage.cjs')} fileStorage
 * @param {string} feederId
 * @param {unknown} runtimeData
 * @param {string} [slot]
 */
async function writeFeederRuntimeSidecar(database, fileStorage, feederId, runtimeData, slot = 'default') {
  const queries = database.getQueries();
  const row = queries.getFeederById.get(feederId);
  if (!row) return;
  const resource = queries.getResourceById.get(row.artifact_resource_id);
  const feederDir = getFeederDirAbs(resource, queries, fileStorage, feederId);
  if (!feederDir) return;
  const runtimeDir = path.join(feederDir, 'runtime');
  await ensureDir(runtimeDir);
  const filePath = path.join(runtimeDir, `${slot}.json`);
  const contents = JSON.stringify(runtimeData ?? {}, null, 2);
  vaultStore.markSelfWrite(filePath, vaultStore.contentHash(contents));
  await fsp.writeFile(filePath, contents, 'utf8');
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {import('../storage/file-storage.cjs')} fileStorage
 * @param {string} feederId
 * @param {Record<string, unknown>} runSummary
 */
async function writeFeederRunSidecar(database, fileStorage, feederId, runSummary) {
  const queries = database.getQueries();
  const row = queries.getFeederById.get(feederId);
  if (!row) return;
  const resource = queries.getResourceById.get(row.artifact_resource_id);
  const feederDir = getFeederDirAbs(resource, queries, fileStorage, feederId);
  if (!feederDir) return;
  const runsDir = path.join(feederDir, 'runs');
  await ensureDir(runsDir);
  const filePath = path.join(runsDir, 'latest.json');
  const contents = JSON.stringify(runSummary ?? {}, null, 2);
  vaultStore.markSelfWrite(filePath, vaultStore.contentHash(contents));
  await fsp.writeFile(filePath, contents, 'utf8');
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {import('../storage/file-storage.cjs')} fileStorage
 * @param {string} feederId
 */
async function removeFeederSidecar(database, fileStorage, feederId) {
  const queries = database.getQueries();
  const row = queries.getFeederById.get(feederId);
  if (!row) return;
  const resource = queries.getResourceById.get(row.artifact_resource_id);
  const feederDir = getFeederDirAbs(resource, queries, fileStorage, feederId);
  if (!feederDir || !fs.existsSync(feederDir)) return;
  vaultStore.markSelfWrite(feederDir, null);
  try {
    await fsp.rm(feederDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Resolve canonical script source: sidecar script file if present, else DB column.
 * @param {import('../core/database.cjs')} database
 * @param {import('../storage/file-storage.cjs')} fileStorage
 * @param {string} feederId
 */
function readFeederScript(database, fileStorage, feederId) {
  const queries = database.getQueries();
  const row = queries.getFeederById.get(feederId);
  if (!row) return '';
  const resource = queries.getResourceById.get(row.artifact_resource_id);
  const feederDir = getFeederDirAbs(resource, queries, fileStorage, feederId);
  if (feederDir) {
    const scriptPath = path.join(feederDir, scriptFilename(row.interpreter));
    if (fs.existsSync(scriptPath)) {
      return fs.readFileSync(scriptPath, 'utf8');
    }
  }
  return String(row.script || '');
}

/**
 * Sync all feeders for an artifact resource to disk.
 */
async function syncArtifactFeedersSidecar(database, fileStorage, artifactResourceId) {
  const queries = database.getQueries();
  const rows = queries.listFeedersByArtifact.all(artifactResourceId);
  for (const row of rows) {
    await writeFeederSidecar(database, fileStorage, row.id);
  }
}

module.exports = {
  getArtifactSidecarAbs,
  getFeederDirAbs,
  writeFeederSidecar,
  writeFeederRuntimeSidecar,
  writeFeederRunSidecar,
  removeFeederSidecar,
  readFeederScript,
  syncArtifactFeedersSidecar,
  scriptFilename,
  buildFeederManifest,
  parseJsonField,
};
