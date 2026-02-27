/* eslint-disable no-console */
/**
 * PageIndex Service Manager - Main Process
 *
 * Manages a Python FastAPI subprocess that provides reasoning-based RAG
 * via PageIndex. Replaces LanceDB vector embeddings with hierarchical
 * document tree indexing.
 *
 * Lifecycle:
 *   start()  → spawn venv + install deps + spawn FastAPI server
 *   stop()   → kill subprocess
 *   index()  → POST /index (generate tree for a PDF)
 *   search() → POST /search (reasoning-based retrieval)
 *   status() → GET  /health
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { app } = require('electron');

const SERVICE_PORT = parseInt(process.env.PAGEINDEX_PORT || '7432', 10);
const STARTUP_TIMEOUT_MS = 60_000; // 60 s for pip install on first run
const REQUEST_TIMEOUT_MS = 120_000; // 2 min for indexing large PDFs

let serviceProcess = null;
let isRunning = false;
let isStarting = false;
let startPromise = null;

// ---------------------------------------------------------------------------
// Python detection (mirrors notebook-python.cjs approach)
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<string|null>} Path to python3 binary or null
 */
async function findPython() {
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      await execQuiet(cmd, ['--version'], 5000);
      return cmd;
    } catch {
      // try next
    }
  }
  return null;
}

/** Resolve venv python binary path */
function venvPython(venvDir) {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

/** Resolve venv pip binary path */
function venvPip(venvDir) {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'pip.exe')
    : path.join(venvDir, 'bin', 'pip');
}

// ---------------------------------------------------------------------------
// Async exec helper
// ---------------------------------------------------------------------------

function execQuiet(cmd, args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (ok, err) => {
      if (settled) return;
      settled = true;
      if (ok) resolve({ stdout, stderr });
      else reject(new Error(err || `Process exited with error:\n${stderr}`));
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(false, 'Timeout');
    }, timeoutMs);

    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0, `Exit code ${code}`);
    });
    proc.on('error', (err) => { clearTimeout(timer); finish(false, err.message); });
  });
}

// ---------------------------------------------------------------------------
// HTTP helper (Node built-in, no extra deps)
// ---------------------------------------------------------------------------

/**
 * @param {string} method
 * @param {string} path_
 * @param {object|null} body
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function httpRequest(method, path_, body = null, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: '127.0.0.1',
      port: SERVICE_PORT,
      path: path_,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);

    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Ollama availability check
// ---------------------------------------------------------------------------

/**
 * Quickly check if Ollama is reachable at the given base URL.
 * @param {string} baseUrl - e.g. "http://localhost:11434"
 * @returns {Promise<boolean>}
 */
function checkOllamaAvailable(baseUrl) {
  return new Promise((resolve) => {
    const url = new URL('/api/tags', baseUrl);
    const mod = url.protocol === 'https:' ? require('https') : http;
    const req = mod.request(
      { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname, method: 'GET' },
      (res) => { resolve(res.statusCode === 200); }
    );
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Service management
// ---------------------------------------------------------------------------

/**
 * Build env vars for the Python subprocess.
 *
 * Priority order for PageIndex LLM backend:
 *   1. Ollama — if the main AI provider is set to "ollama" OR if Ollama is
 *      reachable and a reasoning-capable model is configured.
 *   2. OpenAI / Anthropic / Google — falls back to the configured cloud provider.
 *
 * Ollama is preferred when available because it keeps everything local and
 * avoids API costs. PageIndex uses Ollama's OpenAI-compatible endpoint.
 *
 * @param {object} database - Dome database module
 * @returns {Promise<object>} env vars for the subprocess
 */
async function buildEnv(database) {
  const env = { ...process.env, PAGEINDEX_PORT: String(SERVICE_PORT) };

  try {
    const queries = database.getQueries();
    const provider = queries.getSetting.get('ai_provider')?.value || 'openai';
    const apiKey = queries.getSetting.get('ai_api_key')?.value || '';
    const model = queries.getSetting.get('ai_model')?.value || '';
    const ollamaBaseUrl = queries.getSetting.get('ollama_base_url')?.value || 'http://localhost:11434';
    const ollamaModel = queries.getSetting.get('ollama_model')?.value
      || queries.getSetting.get('ai_model')?.value
      || 'llama3.1';

    // Check if Ollama is explicitly the configured provider OR if it's reachable
    // as an opportunistic local option
    let useOllama = false;

    if (provider === 'ollama') {
      // User explicitly chose Ollama as AI provider
      useOllama = true;
    } else {
      // Opportunistic: check if Ollama is running even if cloud is the main provider
      const ollamaReachable = await checkOllamaAvailable(ollamaBaseUrl);
      if (ollamaReachable) {
        // Only use Ollama for PageIndex if a model capable of reasoning is available.
        // We assume any non-embedding Ollama model works. If ollama_model is set, use it.
        const hasOllamaModel = !!(queries.getSetting.get('ollama_model')?.value);
        if (hasOllamaModel) {
          useOllama = true;
          console.log(`[PageIndex] Opportunistic Ollama detected at ${ollamaBaseUrl}, using for PageIndex RAG`);
        }
      }
    }

    if (useOllama) {
      env.PAGEINDEX_PROVIDER = 'ollama';
      env.PAGEINDEX_MODEL = ollamaModel;
      env.OLLAMA_BASE_URL = ollamaBaseUrl;
      // OpenAI client requires a non-empty key even when pointing at Ollama
      env.OPENAI_API_KEY = 'ollama';
      console.log(`[PageIndex] Configured for Ollama: model=${ollamaModel} base=${ollamaBaseUrl}`);
    } else {
      env.PAGEINDEX_PROVIDER = provider;
      env.PAGEINDEX_MODEL = model || (provider === 'openai' ? 'gpt-4o-2024-11-20' : 'claude-3-5-sonnet-latest');

      if (provider === 'anthropic') {
        env.ANTHROPIC_API_KEY = apiKey;
      } else {
        env.OPENAI_API_KEY = apiKey;
      }
      console.log(`[PageIndex] Configured for ${provider}: model=${env.PAGEINDEX_MODEL}`);
    }
  } catch (err) {
    console.warn('[PageIndex] Could not read AI settings from DB:', err.message);
  }

  return env;
}

/**
 * Ensure venv exists and has pageindex + fastapi installed.
 * @param {string} venvDir - Path to venv directory
 * @param {string} systemPython - Path to system python binary
 */
async function ensureVenv(venvDir, systemPython) {
  const pyBin = venvPython(venvDir);
  const pipBin = venvPip(venvDir);

  // Create venv if it doesn't exist
  if (!fs.existsSync(pyBin)) {
    console.log('[PageIndex] Creating venv at:', venvDir);
    await execQuiet(systemPython, ['-m', 'venv', venvDir], 30_000);
    console.log('[PageIndex] Venv created');
  }

  // Check if pageindex is installed
  try {
    await execQuiet(pyBin, ['-c', 'import pageindex; import fastapi; import uvicorn'], 5000);
    console.log('[PageIndex] Dependencies already installed');
    return;
  } catch {
    // Need to install
  }

  console.log('[PageIndex] Installing dependencies (first-time setup, may take a minute)...');
  await execQuiet(pipBin, [
    'install', '--quiet', '--upgrade',
    'pageindex', 'fastapi', 'uvicorn[standard]', 'pydantic',
  ], STARTUP_TIMEOUT_MS);
  console.log('[PageIndex] Dependencies installed');
}

/**
 * Start the FastAPI service.
 * Resolves when the service prints its ready signal on stdout.
 * @param {object} database - Dome database module
 * @returns {Promise<void>}
 */
async function start(database) {
  if (isRunning) return;
  if (isStarting) return startPromise;

  isStarting = true;
  startPromise = _doStart(database).finally(() => { isStarting = false; });
  return startPromise;
}

async function _doStart(database) {
  try {
    const systemPython = await findPython();
    if (!systemPython) {
      throw new Error('Python 3 not found. Install Python 3.8+ to use PageIndex RAG.');
    }

    const userDataPath = app.getPath('userData');
    const venvDir = path.join(userDataPath, 'pageindex-venv');

    await ensureVenv(venvDir, systemPython);

    const pyBin = venvPython(venvDir);
    const scriptPath = path.join(__dirname, '..', 'python', 'pageindex_service.py');

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`PageIndex script not found at: ${scriptPath}`);
    }

    const env = await buildEnv(database);
    console.log('[PageIndex] Spawning FastAPI service on port', SERVICE_PORT);

    serviceProcess = spawn(pyBin, [scriptPath], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for the ready signal from the subprocess
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        serviceProcess?.kill('SIGTERM');
        reject(new Error('PageIndex service startup timeout'));
      }, STARTUP_TIMEOUT_MS);

      serviceProcess.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.ready) {
              clearTimeout(timer);
              isRunning = true;
              console.log(`[PageIndex] Service ready — port=${msg.port} provider=${msg.provider || '?'} model=${msg.model || '?'}`);
              resolve();
            } else if (msg.error) {
              clearTimeout(timer);
              reject(new Error(`PageIndex startup error: ${msg.error}`));
            }
          } catch {
            // Non-JSON output, ignore
          }
        }
      });

      serviceProcess.stderr.on('data', (chunk) => {
        const text = chunk.toString().trim();
        if (text) console.warn('[PageIndex:py]', text);
      });

      serviceProcess.on('exit', (code) => {
        clearTimeout(timer);
        isRunning = false;
        serviceProcess = null;
        if (code !== 0) reject(new Error(`PageIndex process exited with code ${code}`));
      });

      serviceProcess.on('error', (err) => {
        clearTimeout(timer);
        isRunning = false;
        serviceProcess = null;
        reject(new Error(`PageIndex process error: ${err.message}`));
      });
    });

  } catch (err) {
    isRunning = false;
    serviceProcess = null;
    throw err;
  }
}

/**
 * Stop the service gracefully.
 */
function stop() {
  if (serviceProcess) {
    console.log('[PageIndex] Stopping service...');
    serviceProcess.kill('SIGTERM');
    serviceProcess = null;
    isRunning = false;
  }
}

/**
 * Check if service is reachable.
 * @returns {Promise<{ running: boolean, provider?: string, model?: string, ollama_available?: boolean }>}
 */
async function getStatus() {
  if (!isRunning) return { running: false };
  try {
    const result = await httpRequest('GET', '/health', null, 5000);
    return {
      running: true,
      provider: result.provider,
      model: result.model,
      ollama_base_url: result.ollama_base_url,
      ollama_available: result.ollama_available,
    };
  } catch {
    return { running: false };
  }
}

// ---------------------------------------------------------------------------
// Public API (called from ipc/pageindex.cjs)
// ---------------------------------------------------------------------------

/**
 * Generate a PageIndex tree for a PDF file.
 * @param {string} resourceId
 * @param {string} pdfPath - Absolute path to PDF file
 * @returns {Promise<{ success: boolean, tree_json?: string, error?: string }>}
 */
async function indexPDF(resourceId, pdfPath) {
  if (!isRunning) throw new Error('PageIndex service is not running');
  return httpRequest('POST', '/index', { resource_id: resourceId, pdf_path: pdfPath });
}

/**
 * Reasoning-based search across document trees.
 * @param {string} query
 * @param {Array<{ resource_id: string, tree_json: string }>} trees
 * @param {number} topK
 * @returns {Promise<{ success: boolean, results?: Array, error?: string }>}
 */
async function search(query, trees, topK = 5) {
  if (!isRunning) throw new Error('PageIndex service is not running');
  return httpRequest('POST', '/search', { query, trees, top_k: topK });
}

module.exports = {
  start,
  stop,
  getStatus,
  indexPDF,
  search,
  isRunning: () => isRunning,
  SERVICE_PORT,
};
