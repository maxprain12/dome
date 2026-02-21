/* eslint-disable no-console */
/**
 * Document Generator - Runs Python scripts to generate PPT, DOCX, etc.
 * Uses a dedicated venv (dome-documents) with python-pptx.
 *
 * Python resolution order:
 *  1. dome-documents venv  (already set up - fastest)
 *  2. Standalone Python    (downloaded from python-build-standalone on first need)
 *  3. System Python        (fallback if standalone download fails)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const PYTHON_EXEC_TIMEOUT_MS = 3 * 60 * 1000; // 3 min for Python spec-based generation

// python-build-standalone version used for the bundled sandbox Python
const STANDALONE_PYTHON_VERSION = '3.12.9';
const STANDALONE_PYTHON_RELEASE = '20250317';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getDocumentsVenvPath() {
  return path.join(app.getPath('userData'), 'dome-documents', '.venv');
}

function getGeneratePptScriptPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'generate_ppt.py');
}

/** NEW: Python-based script runner (replaces PptxGenJS) */
function getRunPptScriptPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'run_ppt_script.py');
}

function getExtractPptScriptPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'extract_ppt.py');
}

function getExtractPptImagesScriptPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'extract_ppt_images.py');
}

function getRequirementsPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'requirements.txt');
}

/** Directory where the standalone Python distribution is installed */
function getStandalonePythonDir() {
  return path.join(app.getPath('userData'), 'dome-sandbox-python');
}

/** Path to the standalone Python executable */
function getStandalonePythonExe() {
  const dir = getStandalonePythonDir();
  if (process.platform === 'win32') {
    return path.join(dir, 'python', 'python.exe');
  }
  return path.join(dir, 'python', 'bin', 'python3');
}

/** Download URL for python-build-standalone (install_only tarball) */
function getStandalonePythonUrl() {
  const ver = STANDALONE_PYTHON_VERSION;
  const rel = STANDALONE_PYTHON_RELEASE;
  const base = `https://github.com/indygreg/python-build-standalone/releases/download/${rel}`;
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    return `${base}/cpython-${ver}+${rel}-${arch}-apple-darwin-install_only.tar.gz`;
  }
  if (process.platform === 'win32') {
    return `${base}/cpython-${ver}+${rel}-x86_64-pc-windows-msvc-install_only.tar.gz`;
  }
  return `${base}/cpython-${ver}+${rel}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command and capture stdout/stderr with an optional timeout.
 */
function runCommand(command, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: process.platform === 'win32' && ['py', 'python', 'python3'].includes(command),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, code });
    };
    const timer = setTimeout(() => { proc.kill('SIGTERM'); finish(-1); }, timeoutMs);
    proc.stdout?.on('data', (c) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c) => { stderr += c.toString(); });
    proc.on('close', (code) => { clearTimeout(timer); finish(code); });
    proc.on('error', () => finish(-1));
  });
}

/**
 * Download a file following HTTP redirects, streaming directly to disk.
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  const https = require('https');
  const http = require('http');
  return new Promise((resolve, reject) => {
    function fetch(u) {
      const lib = u.startsWith('https') ? https : http;
      lib.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          fetch(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} while downloading ${u}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (e) => { fs.unlink(destPath, () => {}); reject(e); });
        res.on('error', reject);
      }).on('error', reject);
    }
    fetch(url);
  });
}

/**
 * Download and install python-build-standalone into userData/dome-sandbox-python.
 * The tarball extracts to a `python/` subdirectory automatically.
 * @returns {Promise<{ path: string; runArgs: string[] }>}
 */
async function ensureStandalonePython() {
  const exePath = getStandalonePythonExe();
  if (fs.existsSync(exePath)) {
    return { path: exePath, runArgs: [] };
  }

  const url = getStandalonePythonUrl();
  const destDir = getStandalonePythonDir();
  const tarPath = path.join(os.tmpdir(), `dome_python_${Date.now()}.tar.gz`);

  console.log(`[DocGen] Downloading standalone Python ${STANDALONE_PYTHON_VERSION} …`);
  console.log(`[DocGen]   from: ${url}`);

  try {
    fs.mkdirSync(destDir, { recursive: true });
    await downloadFile(url, tarPath);

    console.log('[DocGen] Extracting Python …');
    const extract = await runCommand('tar', ['-xzf', tarPath, '-C', destDir], 180000);
    if (extract.code !== 0) {
      throw new Error(`tar extraction failed: ${extract.stderr || extract.stdout}`);
    }

    if (!fs.existsSync(exePath)) {
      throw new Error(`Extracted Python binary not found at expected path: ${exePath}`);
    }

    console.log(`[DocGen] Standalone Python ready at: ${exePath}`);
    return { path: exePath, runArgs: [] };
  } finally {
    try { if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Python discovery
// ---------------------------------------------------------------------------

/**
 * Find a Python executable (does NOT return the venv Python — use for venv creation only).
 * Order: standalone → system.
 * Downloads standalone as last resort.
 * @returns {Promise<{ path: string; runArgs: string[] } | null>}
 */
async function findBasePython() {
  // Prefer pre-downloaded standalone
  const standalonePath = getStandalonePythonExe();
  if (fs.existsSync(standalonePath)) {
    return { path: standalonePath, runArgs: [] };
  }

  // Try system Python
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = await runCommand(cmd, ['--version'], 5000);
      if (result.code === 0 && (result.stdout || result.stderr)) {
        return { path: cmd, runArgs: cmd === 'py' ? ['-3'] : [] };
      }
    } catch { /* try next */ }
  }

  // Last resort: download standalone Python
  try {
    return await ensureStandalonePython();
  } catch (err) {
    console.error('[DocGen] Failed to download standalone Python:', err.message);
    return null;
  }
}

/**
 * Find the best Python for running scripts.
 * Prefers the dome-documents venv (which has python-pptx pre-installed).
 * Falls back to findBasePython().
 * @returns {Promise<{ path: string; runArgs: string[] } | null>}
 */
async function findPython() {
  const venvPython = process.platform === 'win32'
    ? path.join(getDocumentsVenvPath(), 'Scripts', 'python.exe')
    : path.join(getDocumentsVenvPath(), 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return { path: venvPython, runArgs: [] };
  }

  return findBasePython();
}

// ---------------------------------------------------------------------------
// Venv setup
// ---------------------------------------------------------------------------

/**
 * Ensure the dome-documents venv exists and has python-pptx installed.
 * Creates it using findBasePython() (standalone or system) if needed.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
async function ensureVenv() {
  const venvPath = getDocumentsVenvPath();
  const venvPython = process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return { success: true };
  }

  const basePython = await findBasePython();
  if (!basePython) {
    return {
      success: false,
      error: 'Python not found. Install Python 3 or allow Dome to download it automatically.',
    };
  }

  const venvDir = path.dirname(path.dirname(venvPython)); // …/dome-documents/.venv
  const venvParent = path.dirname(venvDir);               // …/dome-documents
  if (!fs.existsSync(venvParent)) {
    fs.mkdirSync(venvParent, { recursive: true });
  }

  console.log(`[DocGen] Creating venv at ${venvDir} using ${basePython.path} …`);
  const createResult = await runCommand(
    basePython.path,
    [...(basePython.runArgs || []), '-m', 'venv', venvDir],
    60000,
  );
  if (createResult.code !== 0) {
    return { success: false, error: createResult.stderr || createResult.stdout || 'Failed to create venv' };
  }

  const reqPath = getRequirementsPath();
  if (!fs.existsSync(reqPath)) {
    return { success: false, error: 'requirements.txt not found for document-generator' };
  }

  console.log('[DocGen] Installing python-pptx into venv …');
  const pipResult = await runCommand(venvPython, ['-m', 'pip', 'install', '-r', reqPath], 180000);
  if (pipResult.code !== 0) {
    return { success: false, error: pipResult.stderr || pipResult.stdout || 'Failed to install python-pptx' };
  }

  console.log('[DocGen] Venv ready.');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Generation functions
// ---------------------------------------------------------------------------

/**
 * Generate PPTX from JSON spec (simple, basic layouts).
 * @param {Object} spec - { title, slides: [{ layout, title?, subtitle?, bullets?, textboxes? }] }
 * @returns {Promise<{ success: boolean; buffer?: Buffer; error?: string }>}
 */
async function generatePpt(spec) {
  const scriptPath = getGeneratePptScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: 'generate_ppt.py not found' };
  }

  const venvOk = await ensureVenv();
  if (!venvOk.success) return { success: false, error: venvOk.error };

  const pythonInfo = await findPython();
  if (!pythonInfo) return { success: false, error: 'Python not found for document generation' };

  const outputPath = path.join(os.tmpdir(), `dome_ppt_${Date.now()}_${Math.random().toString(36).slice(2)}.pptx`);
  const specJson = JSON.stringify(spec);

  return new Promise((resolve) => {
    const proc = spawn(pythonInfo.path, [...(pythonInfo.runArgs || []), scriptPath, outputPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (success, errMsg) => {
      if (settled) return;
      settled = true;
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
      if (!success) resolve({ success: false, error: errMsg });
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(false, 'Document generation timed out');
    }, PYTHON_EXEC_TIMEOUT_MS);

    proc.stdin.write(specJson, (err) => {
      if (err) { clearTimeout(timer); finish(false, err.message); return; }
      proc.stdin.end();
    });

    proc.stdout?.on('data', (c) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c) => { stderr += c.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      try {
        let resultData = {};
        try { resultData = JSON.parse(stdout.trim() || '{}'); } catch {}
        if (code !== 0 || !resultData.success) {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          resolve({ success: false, error: resultData.error || stderr || stdout || `Exit code ${code}` });
          return;
        }
        if (!fs.existsSync(outputPath)) {
          resolve({ success: false, error: 'Generated file not found' });
          return;
        }
        const buffer = fs.readFileSync(outputPath);
        fs.unlinkSync(outputPath);
        resolve({ success: true, buffer });
      } catch (e) {
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        resolve({ success: false, error: e.message || 'Failed to read generated file' });
      }
    });

    proc.on('error', (err) => { clearTimeout(timer); finish(false, err.message || 'Failed to spawn Python'); });
  });
}

/**
 * Generate PPTX from a python-pptx Python script (rich, designed presentations).
 *
 * The script must end with: prs.save(os.environ['PPTX_OUTPUT_PATH'])
 *
 * Runs in a sandboxed Python subprocess with a clean environment.
 * No timeout — runs until completion (fire-and-forget callers handle timing).
 *
 * @param {string} scriptCode - Python code using python-pptx
 * @returns {Promise<{ success: boolean; buffer?: Buffer; error?: string }>}
 */
async function generatePptFromPythonScript(scriptCode) {
  const runnerPath = getRunPptScriptPath();
  if (!fs.existsSync(runnerPath)) {
    return { success: false, error: 'run_ppt_script.py not found' };
  }

  const venvOk = await ensureVenv();
  if (!venvOk.success) return { success: false, error: venvOk.error };

  const pythonInfo = await findPython();
  if (!pythonInfo) return { success: false, error: 'Python not found for PPT generation' };

  const outputPath = path.join(os.tmpdir(), `dome_ppt_${Date.now()}_${Math.random().toString(36).slice(2)}.pptx`);

  // Clean sandboxed environment — only what the script needs
  const sandboxEnv = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || process.env.USERPROFILE || os.homedir(),
    TMPDIR: process.env.TMPDIR || os.tmpdir(),
    TEMP: process.env.TEMP || os.tmpdir(),
    TMP: process.env.TMP || os.tmpdir(),
    LANG: 'en_US.UTF-8',
    PPTX_OUTPUT_PATH: outputPath,
  };
  if (process.platform === 'win32') {
    sandboxEnv.SYSTEMROOT = process.env.SYSTEMROOT || 'C:\\Windows';
    sandboxEnv.USERPROFILE = process.env.USERPROFILE || '';
    sandboxEnv.APPDATA = process.env.APPDATA || '';
  }

  return new Promise((resolve) => {
    const proc = spawn(
      pythonInfo.path,
      [...(pythonInfo.runArgs || []), runnerPath, outputPath],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: sandboxEnv,
        cwd: os.tmpdir(), // isolated working directory
      },
    );

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (success, errMsg) => {
      if (settled) return;
      settled = true;
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
      if (!success) resolve({ success: false, error: errMsg });
    };

    proc.stdin.write(scriptCode, 'utf8', (err) => {
      if (err) { finish(false, err.message); return; }
      proc.stdin.end();
    });

    proc.stdout?.on('data', (c) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c) => { stderr += c.toString(); });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      try {
        let resultData = {};
        try { resultData = JSON.parse(stdout.trim() || '{}'); } catch {}

        if (code !== 0 || !resultData.success) {
          try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
          resolve({ success: false, error: resultData.error || stderr || stdout || `Exit code ${code}` });
          return;
        }

        if (!fs.existsSync(outputPath)) {
          resolve({ success: false, error: 'Script completed but output file was not created' });
          return;
        }

        const buffer = fs.readFileSync(outputPath);
        fs.unlinkSync(outputPath);
        resolve({ success: true, buffer });
      } catch (e) {
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        resolve({ success: false, error: e.message || 'Failed to read generated file' });
      }
    });

    proc.on('error', (err) => {
      finish(false, err.message || 'Failed to spawn Python sandbox');
    });
  });
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extract slide content from a PPTX file (uses python-pptx).
 * @param {string} pptxPath
 * @returns {Promise<{ success: boolean; slides?: Array<{ index: number; text: string }>; error?: string }>}
 */
async function extractPptSlides(pptxPath) {
  const scriptPath = getExtractPptScriptPath();
  if (!fs.existsSync(scriptPath)) return { success: false, error: 'extract_ppt.py not found' };
  if (!fs.existsSync(pptxPath)) return { success: false, error: 'PPTX file not found' };

  const venvOk = await ensureVenv();
  if (!venvOk.success) return { success: false, error: venvOk.error };

  const pythonInfo = await findPython();
  if (!pythonInfo) return { success: false, error: 'Python not found for extraction' };

  return new Promise((resolve) => {
    const proc = spawn(pythonInfo.path, [...(pythonInfo.runArgs || []), scriptPath, pptxPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGTERM'); resolve({ success: false, error: 'Extraction timed out' }); }, 30000);

    proc.stdout?.on('data', (c) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c) => { stderr += c.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout.trim() || '{}');
        if (code !== 0 || !result.success) {
          resolve({ success: false, error: result.error || stderr || stdout || `Exit code ${code}` });
        } else {
          resolve({ success: true, slides: result.slides || [] });
        }
      } catch {
        resolve({ success: false, error: stderr || stdout || 'Failed to parse output' });
      }
    });

    proc.on('error', (err) => { clearTimeout(timer); resolve({ success: false, error: err.message || 'Failed to spawn Python' }); });
  });
}

/**
 * Extract one image per slide from a PPTX file (uses LibreOffice + pdf2image).
 * @param {string} pptxPath
 * @returns {Promise<{ success: boolean; slides?: Array<{ index: number; image_base64: string }>; error?: string }>}
 */
async function extractPptImages(pptxPath) {
  const scriptPath = getExtractPptImagesScriptPath();
  if (!fs.existsSync(scriptPath)) return { success: false, error: 'extract_ppt_images.py not found' };
  if (!fs.existsSync(pptxPath)) return { success: false, error: 'PPTX file not found' };

  const venvOk = await ensureVenv();
  if (!venvOk.success) return { success: false, error: venvOk.error };

  const pythonInfo = await findPython();
  if (!pythonInfo) return { success: false, error: 'Python not found for image extraction' };

  return new Promise((resolve) => {
    const proc = spawn(pythonInfo.path, [...(pythonInfo.runArgs || []), scriptPath, pptxPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGTERM'); resolve({ success: false, error: 'La extracción de imágenes ha tardado demasiado. Intente de nuevo.' }); }, 60000);

    proc.stdout?.on('data', (c) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c) => { stderr += c.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout.trim() || '{}');
        if (code !== 0 || !result.success) {
          resolve({ success: false, error: result.error || stderr || stdout || `Exit code ${code}` });
        } else {
          resolve({ success: true, slides: result.slides || [] });
        }
      } catch {
        resolve({ success: false, error: stderr || stdout || 'Failed to parse output' });
      }
    });

    proc.on('error', (err) => { clearTimeout(timer); resolve({ success: false, error: err.message || 'Failed to spawn Python' }); });
  });
}

// ---------------------------------------------------------------------------
// Status check
// ---------------------------------------------------------------------------

async function checkAvailable() {
  const venvOk = await ensureVenv();
  if (!venvOk.success) return { available: false, error: venvOk.error };
  const pythonInfo = await findPython();
  if (!pythonInfo) return { available: false, error: 'Python not found' };
  const scriptPath = getGeneratePptScriptPath();
  if (!fs.existsSync(scriptPath)) return { available: false, error: 'generate_ppt.py not found' };
  return { available: true };
}

module.exports = {
  generatePpt,
  generatePptFromPythonScript,
  extractPptSlides,
  extractPptImages,
  ensureVenv,
  checkAvailable,
};
