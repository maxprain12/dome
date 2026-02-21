/* eslint-disable no-console */
/**
 * Document Generator - Runs Python scripts to generate PPT, DOCX, etc.
 * Uses a dedicated venv (dome-documents) with python-pptx.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const EXEC_TIMEOUT_MS = 60 * 1000; // 60 seconds

/** Path to dome-documents venv */
function getDocumentsVenvPath() {
  return path.join(app.getPath('userData'), 'dome-documents', '.venv');
}

/** Path to generate_ppt.py script */
function getGeneratePptScriptPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'generate_ppt.py');
}

/** Path to run_pptxgen.mjs script */
function getRunPptxgenScriptPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'run_pptxgen.mjs');
}

/** Path to requirements.txt */
function getRequirementsPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'requirements.txt');
}

/**
 * Find Python - prefers dome-documents venv, falls back to system Python
 * @returns {Promise<{ path: string; runArgs: string[] } | null>}
 */
async function findPython() {
  const venvPath = getDocumentsVenvPath();
  const venvPython = process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return { path: venvPython, runArgs: [] };
  }

  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = await runCommand(cmd, ['--version'], 5000);
      if (result.code === 0 && (result.stdout || result.stderr)) {
        return { path: cmd, runArgs: cmd === 'py' ? ['-3'] : [] };
      }
    } catch {
      // Try next
    }
  }
  return null;
}

/**
 * Run command and capture output
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
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(-1);
    }, timeoutMs);
    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      finish(code);
    });
    proc.on('error', () => finish(-1));
  });
}

/**
 * Ensure dome-documents venv exists and has python-pptx
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

  const sysPython = await findPython();
  if (!sysPython) {
    return { success: false, error: 'Python not found. Install Python 3 and ensure it is in PATH.' };
  }

  const venvDir = path.dirname(path.dirname(venvPython));
  const venvParent = path.dirname(venvDir);
  if (!fs.existsSync(venvParent)) {
    fs.mkdirSync(venvParent, { recursive: true });
  }

  const createResult = await runCommand(sysPython.path, [
    ...(sysPython.runArgs || []),
    '-m', 'venv', venvDir,
  ], 30000);

  if (createResult.code !== 0) {
    return { success: false, error: createResult.stderr || createResult.stdout || 'Failed to create venv' };
  }

  const reqPath = getRequirementsPath();
  if (!fs.existsSync(reqPath)) {
    return { success: false, error: 'requirements.txt not found for document-generator' };
  }

  const pipResult = await runCommand(venvPython, ['-m', 'pip', 'install', '-r', reqPath], 120000);
  if (pipResult.code !== 0) {
    return { success: false, error: pipResult.stderr || pipResult.stdout || 'Failed to install python-pptx' };
  }

  return { success: true };
}

/**
 * Generate PPTX from JSON spec
 * @param {Object} spec - { title, slides: [{ layout, title?, subtitle?, bullets?, textboxes? }] }
 * @returns {Promise<{ success: boolean; buffer?: Buffer; error?: string }>}
 */
async function generatePpt(spec) {
  const scriptPath = getGeneratePptScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: 'generate_ppt.py not found' };
  }

  const venvOk = await ensureVenv();
  if (!venvOk.success) {
    return { success: false, error: venvOk.error };
  }

  const pythonInfo = await findPython();
  if (!pythonInfo) {
    return { success: false, error: 'Python not found for document generation' };
  }

  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `dome_ppt_${Date.now()}_${Math.random().toString(36).slice(2)}.pptx`);

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
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {
        // Ignore
      }
      if (!success) {
        resolve({ success: false, error: errMsg });
      }
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(false, 'Document generation timed out');
    }, EXEC_TIMEOUT_MS);

    proc.stdin.write(specJson, (err) => {
      if (err) {
        clearTimeout(timer);
        finish(false, err.message);
        return;
      }
      proc.stdin.end();
    });

    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      try {
        let resultData;
        try {
          resultData = JSON.parse(stdout.trim() || '{}');
        } catch {
          resultData = {};
        }

        if (code !== 0 || !resultData.success) {
          const errMsg = resultData.error || stderr || stdout || `Script exited with code ${code}`;
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          resolve({ success: false, error: errMsg });
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
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch {}
        }
        resolve({ success: false, error: e.message || 'Failed to read generated file' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      finish(false, err.message || 'Failed to spawn Python');
    });
  });
}

/**
 * Generate PPTX from PptxGenJS script
 * @param {string} scriptCode - JavaScript code using PptxGenJS; must call pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })
 * @returns {Promise<{ success: boolean; buffer?: Buffer; error?: string }>}
 */
async function generatePptFromScript(scriptCode) {
  const scriptPath = getRunPptxgenScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: 'run_pptxgen.mjs not found' };
  }

  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `dome_ppt_${Date.now()}_${Math.random().toString(36).slice(2)}.pptx`);

  const nodePath = process.execPath;

  return new Promise((resolve) => {
    const proc = spawn(nodePath, [scriptPath, outputPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (success, errMsg) => {
      if (settled) return;
      settled = true;
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {}
      if (!success) {
        resolve({ success: false, error: errMsg });
      }
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(false, 'PptxGenJS script execution timed out');
    }, EXEC_TIMEOUT_MS);

    proc.stdin.write(scriptCode, 'utf8', (err) => {
      if (err) {
        clearTimeout(timer);
        finish(false, err.message);
        return;
      }
      proc.stdin.end();
    });

    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      try {
        let resultData;
        try {
          resultData = JSON.parse(stdout.trim() || '{}');
        } catch {
          resultData = {};
        }

        if (code !== 0 || !resultData.success) {
          const errMsg = resultData.error || stderr || stdout || `Script exited with code ${code}`;
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          resolve({ success: false, error: errMsg });
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
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch {}
        }
        resolve({ success: false, error: e.message || 'Failed to read generated file' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      finish(false, err.message || 'Failed to spawn PptxGenJS runner');
    });
  });
}

function getExtractPptScriptPath() {
  return path.join(__dirname, '..', 'scripts', 'document-generator', 'extract_ppt.py');
}

/**
 * Extract slide content from a PPTX file (uses python-pptx)
 * @param {string} pptxPath - Full path to .pptx file
 * @returns {Promise<{ success: boolean; slides?: Array<{ index: number; text: string }>; error?: string }>}
 */
async function extractPptSlides(pptxPath) {
  const scriptPath = getExtractPptScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: 'extract_ppt.py not found' };
  }
  if (!fs.existsSync(pptxPath)) {
    return { success: false, error: 'PPTX file not found' };
  }

  const venvOk = await ensureVenv();
  if (!venvOk.success) {
    return { success: false, error: venvOk.error };
  }

  const pythonInfo = await findPython();
  if (!pythonInfo) {
    return { success: false, error: 'Python not found for document extraction' };
  }

  return new Promise((resolve) => {
    const proc = spawn(pythonInfo.path, [...(pythonInfo.runArgs || []), scriptPath, pptxPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ success: false, error: 'Extraction timed out' });
    }, 30000);

    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

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

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message || 'Failed to spawn Python' });
    });
  });
}

/**
 * Check if document generator is available (Python + python-pptx)
 */
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
  generatePptFromScript,
  extractPptSlides,
  ensureVenv,
  checkAvailable,
};
