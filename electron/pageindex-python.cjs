/* eslint-disable no-console */
/**
 * PageIndex Python runner.
 *
 * Uses the real PageIndex Python package in a subprocess. Python owns the
 * indexing lifecycle, SQLite persistence, and document processing.
 *
 * JS only resolves the runtime, spawns the bridge, and mirrors DB-backed
 * status updates to the renderer process.
 */

const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

const jsDocIndexer = require('./doc-indexer.cjs');
const {
  DOME_FILES_DIR,
  RUNTIME_DIR_NAME,
  getEmbeddedRuntimeRelativePath,
  getRuntimeTargetId,
  getStandalonePythonUrl,
} = require('./pageindex-runtime-config.cjs');

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const REQUIREMENTS_PROBE = [
  'import openai',
  'import pymupdf',
  'import PyPDF2',
  'import tiktoken',
  'import dotenv',
  'import yaml',
].join('; ');

/** @type {Map<string, { status: string, progress: number, step: string }>} */
const state = new Map();

let cachedBasePython = null;
let ensureRuntimePromise = null;

function getDatabasePath() {
  return path.join(app.getPath('userData'), 'dome.db');
}

function getStorageRoot() {
  return path.join(app.getPath('userData'), DOME_FILES_DIR);
}

function getRuntimeRoot() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..');
  }
  return app.getAppPath().replace(`${path.sep}app.asar`, `${path.sep}app.asar.unpacked`);
}

function getBridgeScriptPath() {
  return path.join(getRuntimeRoot(), 'electron', 'pageindex_bridge.py');
}

function getPageIndexRequirementsPath() {
  return path.join(getRuntimeRoot(), 'electron', 'vendor', 'pageindex', 'requirements.txt');
}

function getEmbeddedRuntimeCandidates() {
  const relativePath = getEmbeddedRuntimeRelativePath();
  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, relativePath));
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', relativePath));
  } else {
    candidates.push(path.join(getRuntimeRoot(), 'build', RUNTIME_DIR_NAME, getRuntimeTargetId()));
  }
  return candidates;
}

function getEmbeddedRuntimeRoot() {
  return getEmbeddedRuntimeCandidates().find(candidate => fs.existsSync(candidate)) || null;
}

function getRuntimePythonExe(runtimeRoot, useVenv = true) {
  if (!runtimeRoot) return null;
  if (process.platform === 'win32') {
    return useVenv
      ? path.join(runtimeRoot, 'venv', 'Scripts', 'python.exe')
      : path.join(runtimeRoot, 'python', 'python.exe');
  }
  return useVenv
    ? path.join(runtimeRoot, 'venv', 'bin', 'python')
    : path.join(runtimeRoot, 'python', 'bin', 'python3');
}

function getPageIndexVenvPath() {
  return path.join(app.getPath('userData'), 'dome-pageindex', '.venv');
}

function getStandalonePythonDir() {
  return path.join(app.getPath('userData'), 'dome-pageindex', 'python-standalone');
}

function getStandalonePythonExe() {
  const dir = getStandalonePythonDir();
  return getRuntimePythonExe(dir, false);
}

function getPageIndexVenvPython() {
  return getRuntimePythonExe(getPageIndexVenvPath());
}

function getRequirementsStampPath() {
  return path.join(app.getPath('userData'), 'dome-pageindex', '.requirements-hash');
}

function readRequirementsHash() {
  try {
    const content = fs.readFileSync(getPageIndexRequirementsPath(), 'utf8');
    return crypto.createHash('sha1').update(content).digest('hex');
  } catch {
    return '';
  }
}

function setState(resourceId, status, progress, step, windowManager, database, errorMessage = null) {
  state.set(resourceId, { status, progress, step });

  if (database) {
    try {
      const queries = database.getQueries();
      queries.setPageIndexStatus?.run(resourceId, status, progress, errorMessage, Date.now());
    } catch {
      // Non-fatal
    }
  }

  if (windowManager) {
    try {
      windowManager.broadcast('pageindex:progress', {
        resourceId,
        status,
        progress,
        step,
        error: errorMessage,
      });
    } catch {
      // Non-fatal
    }
  }
}

function getState(resourceId) {
  return state.get(resourceId) || jsDocIndexer.getState(resourceId) || null;
}

function isProcessing(resourceId) {
  return state.get(resourceId)?.status === 'processing' || jsDocIndexer.isProcessing(resourceId);
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: process.platform === 'win32' && ['python', 'python3', 'py'].includes(command),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (code, timedOut = false) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr, timedOut });
    };

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
      // Escalate to SIGKILL if the process doesn't exit after SIGTERM
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, 1000);
      finish(-1, true);
    }, timeoutMs);

    proc.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    proc.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    proc.on('error', () => {
      clearTimeout(timer);
      finish(-1, false);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      finish(code, false);
    });
  });
}

async function findBasePython() {
  if (cachedBasePython) return cachedBasePython;

  const embeddedRuntimeRoot = getEmbeddedRuntimeRoot();
  const embeddedPython = getRuntimePythonExe(embeddedRuntimeRoot, false);
  if (embeddedPython && fs.existsSync(embeddedPython)) {
    cachedBasePython = { command: embeddedPython, runArgs: [], source: 'embedded-base' };
    return cachedBasePython;
  }

  const standaloneExe = getStandalonePythonExe();
  if (fs.existsSync(standaloneExe)) {
    cachedBasePython = { command: standaloneExe, runArgs: [], source: 'downloaded-base' };
    return cachedBasePython;
  }

  const candidates = process.platform === 'win32'
    ? [
        { command: 'python', runArgs: [] },
        { command: 'python3', runArgs: [] },
        { command: 'py', runArgs: ['-3'] },
      ]
    : [
        { command: 'python3', runArgs: [] },
        { command: 'python', runArgs: [] },
      ];

  for (const candidate of candidates) {
    const result = await runCommand(candidate.command, [...candidate.runArgs, '--version'], { timeoutMs: 5000 });
    if (result.code === 0 && (result.stdout || result.stderr)) {
      const versionOutput = (result.stdout || result.stderr || '').trim();
      const match = versionOutput.match(/Python (\d+)\.(\d+)\.(\d+)/);
      const major = Number(match?.[1] || 0);
      const minor = Number(match?.[2] || 0);
      if (major < 3 || (major === 3 && minor < 9) || minor >= 14) {
        continue;
      }
      cachedBasePython = { ...candidate, source: 'system' };
      return cachedBasePython;
    }
  }

  return null;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    function fetch(currentUrl) {
      const lib = currentUrl.startsWith('https') ? https : http;
      lib.get(currentUrl, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          fetch(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} while downloading ${currentUrl}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (error) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(error);
        });
        res.on('error', reject);
      }).on('error', reject);
    }
    fetch(url);
  });
}

async function ensureStandalonePython() {
  const exePath = getStandalonePythonExe();
  if (fs.existsSync(exePath)) {
    return { command: exePath, runArgs: [] };
  }

  const destDir = getStandalonePythonDir();
  const tarPath = path.join(os.tmpdir(), `dome_pageindex_python_${Date.now()}.tar.gz`);
  fs.mkdirSync(destDir, { recursive: true });

  try {
    await downloadFile(getStandalonePythonUrl(), tarPath);
    const extract = await runCommand('tar', ['-xzf', tarPath, '-C', destDir], { timeoutMs: 3 * 60 * 1000 });
    if (extract.code !== 0 || !fs.existsSync(exePath)) {
      throw new Error(extract.stderr || extract.stdout || 'Failed to extract standalone Python');
    }
    cachedBasePython = { command: exePath, runArgs: [], source: 'downloaded-base' };
    return cachedBasePython;
  } finally {
    try { fs.unlinkSync(tarPath); } catch {}
  }
}

async function ensureEmbeddedRuntime() {
  const embeddedRuntimeRoot = getEmbeddedRuntimeRoot();
  if (!embeddedRuntimeRoot) return null;
  const venvPython = getRuntimePythonExe(embeddedRuntimeRoot);
  if (!venvPython || !fs.existsSync(venvPython)) {
    throw new Error(`Embedded PageIndex runtime is incomplete: ${embeddedRuntimeRoot}`);
  }
  const probe = await runCommand(
    venvPython,
    ['-c', REQUIREMENTS_PROBE],
    { timeoutMs: 15000 }
  );
  if (probe.code !== 0) {
    throw new Error(probe.stderr || probe.stdout || 'Embedded PageIndex runtime is missing dependencies');
  }
  return { pythonPath: venvPython, source: 'embedded' };
}

async function ensureVenvPython() {
  const venvPython = getPageIndexVenvPython();
  if (fs.existsSync(venvPython)) return venvPython;

  let basePython = await findBasePython();
  if (!basePython) {
    basePython = await ensureStandalonePython();
  }
  if (!basePython) {
    throw new Error('No Python installation found for PageIndex');
  }

  fs.mkdirSync(path.dirname(getPageIndexVenvPath()), { recursive: true });
  const create = await runCommand(
    basePython.command,
    [...basePython.runArgs, '-m', 'venv', getPageIndexVenvPath()],
    { timeoutMs: 120000 }
  );
  if (create.code !== 0 || !fs.existsSync(venvPython)) {
    throw new Error(`Failed to create PageIndex venv: ${create.stderr || create.stdout || 'unknown error'}`);
  }
  return venvPython;
}

async function requirementsInstalled(pythonPath) {
  const currentHash = readRequirementsHash();
  if (!currentHash) return false;

  let stampedHash = '';
  try {
    stampedHash = fs.readFileSync(getRequirementsStampPath(), 'utf8').trim();
  } catch {
    stampedHash = '';
  }
  if (stampedHash !== currentHash) return false;

  const probe = await runCommand(
    pythonPath,
    ['-c', REQUIREMENTS_PROBE],
    { timeoutMs: 15000 }
  );
  return probe.code === 0;
}

async function installRequirements(pythonPath) {
  const requirementsPath = getPageIndexRequirementsPath();
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`PageIndex requirements not found: ${requirementsPath}`);
  }

  const upgradePip = await runCommand(
    pythonPath,
    ['-m', 'pip', 'install', '--upgrade', 'pip'],
    { timeoutMs: 180000 }
  );
  if (upgradePip.code !== 0) {
    throw new Error(`Failed to upgrade pip for PageIndex: ${upgradePip.stderr || upgradePip.stdout}`);
  }

  const install = await runCommand(
    pythonPath,
    ['-m', 'pip', 'install', '-r', requirementsPath],
    { timeoutMs: 8 * 60 * 1000 }
  );
  if (install.code !== 0) {
    throw new Error(`Failed to install PageIndex requirements: ${install.stderr || install.stdout}`);
  }

  fs.mkdirSync(path.dirname(getRequirementsStampPath()), { recursive: true });
  fs.writeFileSync(getRequirementsStampPath(), readRequirementsHash(), 'utf8');
}

async function ensureRuntime() {
  if (ensureRuntimePromise) return ensureRuntimePromise;

  ensureRuntimePromise = (async () => {
    const embedded = await ensureEmbeddedRuntime();
    if (embedded) {
      if (!fs.existsSync(getBridgeScriptPath())) {
        throw new Error(`PageIndex bridge not found: ${getBridgeScriptPath()}`);
      }
      return embedded;
    }
    const pythonPath = await ensureVenvPython();
    if (!(await requirementsInstalled(pythonPath))) {
      await installRequirements(pythonPath);
    }
    if (!fs.existsSync(getBridgeScriptPath())) {
      throw new Error(`PageIndex bridge not found: ${getBridgeScriptPath()}`);
    }
    return { pythonPath, source: 'downloaded' };
  })();

  try {
    return await ensureRuntimePromise;
  } catch (error) {
    ensureRuntimePromise = null;
    throw error;
  }
}

async function start() {
  await ensureRuntime();
  return { success: true };
}

function getRuntimeDescriptor() {
  const embeddedRuntimeRoot = getEmbeddedRuntimeRoot();
  if (embeddedRuntimeRoot) return 'python-embedded';
  return 'python-subprocess';
}

const { MINIMAX_OPENAI_BASE_URL } = require('./minimax-config.cjs');

async function getProviderConfig(database) {
  const queries = database.getQueries();
  const provider = (queries.getSetting.get('ai_provider')?.value || 'openai').toLowerCase();

  if (provider === 'ollama') {
    const rawBaseUrl = queries.getSetting.get('ollama_base_url')?.value || 'http://localhost:11434';
    const normalizedBaseUrl = rawBaseUrl.endsWith('/v1') ? rawBaseUrl : `${rawBaseUrl.replace(/\/$/, '')}/v1`;
    return {
      provider,
      model: queries.getSetting.get('ollama_model')?.value || 'llama3.2',
      api_key: queries.getSetting.get('ollama_api_key')?.value || 'ollama',
      base_url: normalizedBaseUrl,
    };
  }

  if (provider === 'dome') {
    const domeOauth = require('./dome-oauth.cjs');
    const DOME_PROVIDER_URL = process.env.DOME_PROVIDER_URL || 'http://localhost:3000';
    const session = await domeOauth.getOrRefreshSession(database);
    if (!session?.connected || !session?.accessToken) {
      throw new Error('Dome provider not connected. Connect in Settings > AI.');
    }
    return {
      provider: 'openai',
      model: queries.getSetting.get('ai_model')?.value || 'dome/auto',
      api_key: session.accessToken,
      base_url: `${DOME_PROVIDER_URL.replace(/\/$/, '')}/api/v1`,
    };
  }

  // Only use ai_base_url for Minimax — other providers (openai, anthropic, google) use their SDK defaults
  let baseUrl = '';
  if (provider === 'minimax') {
    baseUrl = queries.getSetting.get('ai_base_url')?.value || MINIMAX_OPENAI_BASE_URL;
  }

  return {
    provider,
    model: queries.getSetting.get('ai_model')?.value || 'gpt-4o-mini',
    api_key: queries.getSetting.get('ai_api_key')?.value || '',
    base_url: baseUrl,
  };
}

function parseBridgeOutput(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) {
    throw new Error('PageIndex bridge returned empty output');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!(line.startsWith('{') || line.startsWith('['))) continue;
      try {
        return JSON.parse(line);
      } catch {
        // Keep searching backwards
      }
    }
  }

  throw new Error(`Invalid PageIndex bridge output: ${trimmed.slice(0, 300)}`);
}

async function callBridge(mode, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { pythonPath } = await ensureRuntime();
  const inputPath = path.join(os.tmpdir(), `dome_pageindex_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(inputPath, JSON.stringify(payload), 'utf8');

  try {
    const result = await runCommand(
      pythonPath,
      [getBridgeScriptPath(), '--mode', mode, '--input-file', inputPath],
      {
        timeoutMs,
        cwd: getRuntimeRoot(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      }
    );

    if (result.stderr) {
      console.log('[PageIndex Bridge stderr]', result.stderr.trim());
    }

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `PageIndex bridge failed with code ${result.code}`);
    }

    return parseBridgeOutput(result.stdout);
  } finally {
    try {
      fs.unlinkSync(inputPath);
    } catch {
      // ignore
    }
  }
}

function mirrorStatusFromDatabase(resourceId, database, windowManager) {
  try {
    const queries = database?.getQueries?.();
    if (!queries) return null;
    const statusRow = queries.getPageIndexStatus?.get(resourceId);
    if (statusRow) {
      const mapped = {
        status: statusRow.status,
        progress: statusRow.progress ?? 0,
        step: statusRow.status === 'error' ? 'Error al indexar' : 'Procesando…',
      };
      state.set(resourceId, mapped);
      if (windowManager) {
        windowManager.broadcast('pageindex:progress', {
          resourceId,
          status: mapped.status,
          progress: mapped.progress,
          step: mapped.step,
          error: statusRow.error_message || null,
        });
      }
      return mapped;
    }
    const indexed = queries.getPageIndex?.get(resourceId);
    if (indexed) {
      const mapped = { status: 'done', progress: 100, step: 'Listo para IA' };
      state.set(resourceId, mapped);
      if (windowManager) {
        windowManager.broadcast('pageindex:progress', {
          resourceId,
          status: 'done',
          progress: 100,
          step: 'Listo para IA',
          error: null,
        });
      }
      return mapped;
    }
  } catch {
    // ignore transient polling errors
  }
  return null;
}

const MAX_POLL_MS = 30 * 60 * 1000; // Stop after 30 min regardless of DB status

function startStatusPolling(resourceId, database, windowManager) {
  let stopped = false;
  const deadline = Date.now() + MAX_POLL_MS;
  const timer = setInterval(() => {
    if (stopped) { clearInterval(timer); return; }
    if (Date.now() > deadline) {
      clearInterval(timer);
      setState(resourceId, 'error', 0, 'Timeout', windowManager, database, 'Indexing timed out after 30 min');
      return;
    }
    const snapshot = mirrorStatusFromDatabase(resourceId, database, windowManager);
    if (snapshot?.status === 'done' || snapshot?.status === 'error') {
      clearInterval(timer);
    }
  }, 400);
  return () => {
    stopped = true;
    clearInterval(timer);
    mirrorStatusFromDatabase(resourceId, database, windowManager);
  };
}

async function fallbackToJsIndexer(resourceId, deps, infraError) {
  const { database, fileStorage } = deps || {};
  const queries = database?.getQueries?.();
  const resource = queries?.getResourceById?.get(resourceId);
  if (!resource) {
    return { success: false, error: infraError.message };
  }
  const modelUsed = resource.type === 'note'
    ? (queries?.getSetting?.get('ai_model')?.value || 'unknown')
    : (queries?.getSetting?.get('ai_model')?.value || 'unknown');
  const persistFallback = (result) => {
    if (result?.success && result.tree_json && queries?.upsertPageIndex) {
      queries.upsertPageIndex.run(resourceId, result.tree_json, Date.now(), modelUsed);
      queries.deletePageIndexStatus?.run(resourceId);
    } else if (!result?.success) {
      // Clear 'processing' from in-memory state so isProcessing() returns false
      // and the resource can be retried by the next auto-index sweep.
      const errMsg = result?.error || infraError?.message || 'JS fallback indexing failed';
      setState(resourceId, 'error', 0, errMsg, null, database, errMsg);
    }
    return result;
  };
  if (resource.type === 'pdf') {
    const fullPath = resource.internal_path ? fileStorage?.getFullPath(resource.internal_path) : null;
    if (!fullPath || !fs.existsSync(fullPath)) {
      return { success: false, error: infraError.message };
    }
    return persistFallback(await jsDocIndexer.indexPDF(resourceId, fullPath, deps));
  }
  if (resource.type === 'note') {
    const resourceIndexer = require('./resource-indexer.cjs');
    const markdown = resourceIndexer.tiptapToMarkdown(resource.content || '');
    return persistFallback(await jsDocIndexer.indexMarkdown(resourceId, markdown, resource.title || '', deps));
  }
  if (resource.type === 'notebook') {
    return persistFallback(await jsDocIndexer.indexTextResource(resourceId, notebookToMarkdown(resource), resource.title || '', deps));
  }
  if (resource.type === 'url') {
    return persistFallback(await jsDocIndexer.indexTextResource(resourceId, urlToMarkdown(resource), resource.title || '', deps));
  }
  if (resource.type === 'document' || resource.type === 'ppt' || resource.type === 'excel') {
    return persistFallback(await jsDocIndexer.indexTextResource(resourceId, documentToMarkdown(resource), resource.title || '', deps));
  }
  return { success: false, error: infraError.message };
}

function parseJsonSafely(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function notebookToMarkdown(resource) {
  const doc = parseJsonSafely(resource.content);
  const cells = Array.isArray(doc?.cells) ? doc.cells : [];
  const lines = [`# ${resource.title || 'Notebook'}`];
  for (const cell of cells) {
    const source = Array.isArray(cell?.source) ? cell.source.join('') : String(cell?.source || '');
    const trimmed = source.trim();
    if (!trimmed) continue;
    if (cell?.cell_type === 'code') {
      lines.push('## Code Cell', '```python', trimmed, '```');
    } else {
      lines.push(trimmed);
    }
  }
  return lines.join('\n\n').trim();
}

function urlToMarkdown(resource) {
  const metadata = parseJsonSafely(resource.metadata) || {};
  const sourceUrl = metadata.url || resource.file_path || '';
  return [
    `# ${resource.title || 'Web Resource'}`,
    sourceUrl ? `Source URL: ${sourceUrl}` : '',
    String(resource.content || '').trim(),
  ].filter(Boolean).join('\n\n').trim();
}

function documentToMarkdown(resource) {
  const filename = resource.original_filename || resource.title || 'Document';
  const mime = resource.file_mime_type || '';
  return [
    `# ${resource.title || filename}`,
    `Source File: ${filename}`,
    mime ? `MIME Type: ${mime}` : '',
    String(resource.content || '').trim(),
  ].filter(Boolean).join('\n\n').trim();
}

function shouldUsePythonBridge(resource, deps) {
  if (!resource) return false;
  if (resource.type === 'pdf' || resource.type === 'note') return true;
  if (!['document', 'ppt', 'excel'].includes(resource.type)) return false;
  const { fileStorage } = deps || {};
  const fullPath = resource.internal_path ? fileStorage?.getFullPath?.(resource.internal_path) : null;
  return fullPath && fs.existsSync(fullPath);
}

async function indexResource(resourceId, deps) {
  const { database, windowManager } = deps || {};
  const resource = database?.getQueries?.()?.getResourceById?.get(resourceId);
  if (resource && !shouldUsePythonBridge(resource, deps)) {
    return fallbackToJsIndexer(resourceId, deps, new Error(`JS indexing for ${resource.type}`));
  }
  state.set(resourceId, { status: 'processing', progress: 5, step: 'Inicializando PageIndex Python…' });
  const stopPolling = startStatusPolling(resourceId, database, windowManager);
  try {
    const payload = {
      resource_id: resourceId,
      db_path: getDatabasePath(),
      storage_root: getStorageRoot(),
      user_data_path: app.getPath('userData'),
      llm: await getProviderConfig(database),
    };
    const response = await callBridge('index-resource', payload);
    stopPolling();
    if (response?.success) {
      state.set(resourceId, { status: 'done', progress: 100, step: 'Listo para IA' });
      return {
        success: true,
        resource_id: resourceId,
        node_count: Number(response.node_count || 0),
      };
    }
    // Fallback to JS indexer when Python fails (e.g. 404, 401, API errors)
    const errMsg = response?.error || 'Indexing failed';
    const isApiError = /40[14]|50[03]|html|nginx/i.test(String(errMsg));
    if (isApiError) {
      console.warn('[PageIndex Python] Falling back to JS indexer:', errMsg.slice(0, 120));
      return fallbackToJsIndexer(resourceId, deps, new Error(errMsg));
    }
    state.set(resourceId, { status: 'error', progress: 0, step: errMsg });
    return {
      success: false,
      resource_id: resourceId,
      error: errMsg,
      details: response?.details,
    };
  } catch (error) {
    stopPolling();
    console.warn('[PageIndex Python] Infrastructure failure, falling back to JS:', error.message);
    return fallbackToJsIndexer(resourceId, deps, error);
  }
}

async function search(query, trees, topK, database) {
  try {
    const payload = {
      query,
      top_k: topK,
      trees,
      llm: await getProviderConfig(database),
    };
    const response = await callBridge('search', payload, 3 * 60 * 1000);
    return { success: true, results: Array.isArray(response.results) ? response.results : [] };
  } catch (error) {
    console.warn('[PageIndex Python] Search failed, falling back to JS:', error.message);
    return jsDocIndexer.search(query, trees, topK, database);
  }
}

module.exports = {
  start,
  indexResource,
  search,
  getState,
  isProcessing,
  getRuntimeDescriptor,
  flattenTree: jsDocIndexer.flattenTree,
  flattenTreeWithAncestors: jsDocIndexer.flattenTreeWithAncestors,
  formatTreeAsOutline: jsDocIndexer.formatTreeAsOutline,
  buildStructureArray: jsDocIndexer.buildStructureArray,
  findNodeById: jsDocIndexer.findNodeById,
  findNodeByIdWithPath: jsDocIndexer.findNodeByIdWithPath,
  countTreeNodes: jsDocIndexer.countTreeNodes,
};
