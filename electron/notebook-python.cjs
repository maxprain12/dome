/* eslint-disable no-console */
/**
 * Notebook Python Service - Executes Python code in a subprocess (main process)
 * Replaces Pyodide for Electron desktop - uses system Python with full pip ecosystem
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_CODE_LENGTH = 256 * 1024; // 256KB
const EXEC_TIMEOUT_MS = 60 * 1000; // 60 seconds

/** @type {{ path: string; runArgs: string[] }|null} Cached Python command */
let cachedPython = null;

/** @type {string|null} Cached Python version */
let cachedPythonVersion = null;

/**
 * Find Python executable on the system
 * @returns {Promise<{ path: string; runArgs: string[]; version: string } | null>}
 */
async function findPython() {
  if (cachedPython) {
    return { ...cachedPython, version: cachedPythonVersion || 'unknown' };
  }

  const candidates = process.platform === 'win32'
    ? [
        { cmd: 'python', args: ['--version'], runArgs: [] },
        { cmd: 'python3', args: ['--version'], runArgs: [] },
        { cmd: 'py', args: ['-3', '--version'], runArgs: ['-3'] },
        { cmd: 'py', args: ['--version'], runArgs: [] },
      ]
    : [
        { cmd: 'python3', args: ['--version'], runArgs: [] },
        { cmd: 'python', args: ['--version'], runArgs: [] },
      ];

  for (const { cmd, args, runArgs } of candidates) {
    try {
      const result = await execSync(cmd, args, 5000);
      if (result.stdout || result.stderr) {
        const versionOutput = (result.stdout || result.stderr || '').trim();
        const versionMatch = versionOutput.match(/Python (\d+\.\d+\.\d+)/);
        cachedPython = { path: cmd, runArgs };
        cachedPythonVersion = versionMatch ? versionMatch[1] : versionOutput;
        return { path: cmd, runArgs, version: cachedPythonVersion };
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

/**
 * Run a command and capture stdout/stderr (simple wrapper)
 * @param {string} command
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<{ stdout: string; stderr: string; code: number | null }>}
 */
function execSync(command, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: process.platform === 'win32' && (command === 'py' || command === 'python' || command === 'python3'),
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

const DOME_FIG_MARKER = '__DOME_FIG__';
const DOME_FIG_END = '__DOME_FIG_END__';

/**
 * Wrap user code for execution.
 * When options.cells and options.targetCellIndex are set, runs each cell with captured stdout
 * and only emits the target cell's output.
 * @param {string} code - Full concatenated code (fallback when no cells)
 * @param {{ cells?: string[]; targetCellIndex?: number }} options
 * @returns {{ scriptPath: string; env?: Record<string, string> }}
 */
function prepareScript(code, options = {}) {
  const { cells, targetCellIndex } = options;
  const usePerCell = Array.isArray(cells) && cells.length > 0 && typeof targetCellIndex === 'number' && targetCellIndex >= 0;

  const hasMatplotlib = /import\s+matplotlib|from\s+matplotlib/.test(code);
  const matplotlibPreamble = hasMatplotlib ? `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as _dome_plt
import base64
import io

_orig_show = _dome_plt.show
def _dome_show(*args, **kwargs):
    if len(_dome_plt.get_fignums()) > 0:
        buf = io.BytesIO()
        _dome_plt.savefig(buf, format='png')
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('ascii')
        print('${DOME_FIG_MARKER}')
        print(b64)
        print('${DOME_FIG_END}')
        _dome_plt.close('all')

_dome_plt.show = _dome_show

` : '';

  let wrapped;
  let env = { ...process.env, PYTHONUNBUFFERED: '1' };

  if (usePerCell) {
    // Write each cell to a temp file - avoids encoding/escaping issues with env vars
    const tmpDir = path.join(os.tmpdir(), `dome_notebook_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    for (let i = 0; i < cells.length; i++) {
      const cellPath = path.join(tmpDir, `cell_${i}.py`);
      fs.writeFileSync(cellPath, cells[i], 'utf8');
    }
    env.DOME_CELLS_DIR = tmpDir;
    env.DOME_TARGET_CELL = String(targetCellIndex);
    env.DOME_NUM_CELLS = String(cells.length);
    // Use contextlib.redirect_stdout per SO - reliable, no encoding issues
    wrapped = (matplotlibPreamble + [
      'import os',
      'import sys',
      'from contextlib import redirect_stdout',
      'from io import StringIO',
      '',
      '_cells_dir = os.environ["DOME_CELLS_DIR"]',
      '_target = int(os.environ.get("DOME_TARGET_CELL", "0"))',
      '_num = int(os.environ.get("DOME_NUM_CELLS", "0"))',
      '_cell_outputs = []',
      '_globals = {}',
      '',
      'for _i in range(_num):',
      '    _path = os.path.join(_cells_dir, "cell_%d.py" % _i)',
      '    if os.path.isfile(_path):',
      '        with open(_path, "r", encoding="utf-8") as _f:',
      '            _code = _f.read()',
      '        _buf = StringIO()',
      '        with redirect_stdout(_buf):',
      '            try:',
      '                exec(compile(_code, "<cell_%d>" % _i, "exec"), _globals)',
      '            except SystemExit:',
      '                pass',
      '        _cell_outputs.append(_buf.getvalue())',
      '    else:',
      '        _cell_outputs.append("")',
      '',
      '_idx = min(_target, len(_cell_outputs) - 1) if _cell_outputs else 0',
      'if _cell_outputs:',
      '    print(_cell_outputs[_idx], end="")',
    ].join('\n')).trim();
  } else {
    wrapped = (matplotlibPreamble + code).trim();
  }

  const baseTmp = os.tmpdir();
  const scriptPath = path.join(baseTmp, `dome_notebook_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  fs.writeFileSync(scriptPath, wrapped, 'utf8');
  const cellsDir = usePerCell ? env.DOME_CELLS_DIR : null;
  return { scriptPath, env, cellsDir };
}

/**
 * Parse stdout to extract figure base64 blocks and split text output
 * @param {string} stdout
 * @returns {{ text: string; figures: string[] }}
 */
function parseStdoutForFigures(stdout) {
  const figures = [];
  const re = new RegExp(`${DOME_FIG_MARKER}\\s*\\n([\\s\\S]*?)\\n\\s*${DOME_FIG_END}`, 'g');
  let text = stdout;
  let m;
  while ((m = re.exec(stdout)) !== null) {
    figures.push(m[1].trim());
  }
  text = stdout.replace(re, '').replace(/\n\n\n+/g, '\n\n').trim();
  return { text, figures };
}

/**
 * Get default working directory for notebook execution.
 * Uses Documents folder (more likely to contain data files) vs home.
 */
function getDefaultCwd() {
  const documents = path.join(os.homedir(), 'Documents');
  return fs.existsSync(documents) ? documents : os.homedir();
}

/**
 * Run Python code and return NotebookOutput-compatible result
 * @param {string} code - Python source code
 * @param {{ cells?: string[]; targetCellIndex?: number; cwd?: string }} options
 * @returns {Promise<{ success: boolean; outputs: object[]; error?: string }>}
 */
async function runPythonCode(code, options = {}) {
  const outputs = [];

  if (!code || typeof code !== 'string') {
    return {
      success: false,
      outputs: [{
        output_type: 'error',
        ename: 'ValueError',
        evalue: 'Code must be a non-empty string',
        traceback: [],
      }],
      error: 'Invalid code',
    };
  }

  if (code.length > MAX_CODE_LENGTH) {
    return {
      success: false,
      outputs: [{
        output_type: 'error',
        ename: 'ValueError',
        evalue: `Code exceeds maximum length (${MAX_CODE_LENGTH} characters)`,
        traceback: [],
      }],
      error: 'Code too long',
    };
  }

  const pythonInfo = await findPython();
  if (!pythonInfo) {
    return {
      success: false,
      outputs: [{
        output_type: 'error',
        ename: 'RuntimeError',
        evalue: 'Python not found. Please install Python 3 and ensure it is in your PATH.',
        traceback: [],
      }],
      error: 'Python not found',
    };
  }

  let scriptPath;
  let cellsDirToClean = null;
  let spawnEnv = { ...process.env, PYTHONUNBUFFERED: '1' };
  try {
    const prep = prepareScript(code, options);
    scriptPath = prep.scriptPath;
    if (prep.env) spawnEnv = prep.env;
    if (prep.cellsDir) cellsDirToClean = prep.cellsDir;
  } catch (err) {
    return {
      success: false,
      outputs: [{
        output_type: 'error',
        ename: 'IOError',
        evalue: err.message || 'Failed to prepare script',
        traceback: [err.message],
      }],
      error: err.message,
    };
  }

  const cwd = options.cwd && fs.existsSync(options.cwd)
    ? options.cwd
    : getDefaultCwd();

  const runArgs = [...(pythonInfo.runArgs || []), scriptPath];
  return new Promise((resolve) => {
    const proc = spawn(pythonInfo.path, runArgs, {
      shell: process.platform === 'win32',
      cwd,
      env: spawnEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (success, errOutput) => {
      if (settled) return;
      settled = true;

      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // Ignore cleanup errors
      }
      if (cellsDirToClean) {
        try {
          const files = fs.readdirSync(cellsDirToClean);
          for (const f of files) {
            fs.unlinkSync(path.join(cellsDirToClean, f));
          }
          fs.rmdirSync(cellsDirToClean);
        } catch {
          // Ignore cleanup errors
        }
      }

      if (stdout) {
        const { text, figures } = parseStdoutForFigures(stdout);
        if (text) {
          outputs.push({ output_type: 'stream', name: 'stdout', text });
        }
        for (const b64 of figures) {
          outputs.push({
            output_type: 'display_data',
            data: { 'image/png': b64 },
            metadata: {},
          });
        }
      }
      // Stderr: if we have an error output, use stderr there; otherwise add as stream
      if (errOutput) {
        outputs.push({
          output_type: 'error',
          ename: 'Error',
          evalue: errOutput,
          traceback: errOutput.split('\n').filter(Boolean),
        });
      } else if (stderr) {
        outputs.push({ output_type: 'stream', name: 'stderr', text: stderr });
      }

      resolve({
        success: success && !errOutput,
        outputs,
        error: errOutput || undefined,
      });
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(false, 'Execution timed out (60s)');
    }, EXEC_TIMEOUT_MS);

    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 && code !== null) {
        finish(false, stderr || (signal ? `Process killed (${signal})` : `Process exited with code ${code}`));
      } else {
        finish(true);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      finish(false, err.message || 'Failed to spawn Python process');
    });
  });
}

/**
 * Check if Python is available
 * @returns {Promise<{ available: boolean; version?: string; path?: string }>}
 */
async function checkPython() {
  const info = await findPython();
  if (!info) {
    return { available: false };
  }
  return {
    available: true,
    version: info.version,
    path: info.path,
  };
}

module.exports = {
  runPythonCode,
  checkPython,
};
