#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const tar = require('tar');

const {
  getRuntimeTargetId,
  getStandalonePythonUrl,
} = require('../electron/pageindex-runtime-config.cjs');

const REQUIREMENTS_PROBE = [
  'import openai',
  'import pymupdf',
  'import PyPDF2',
  'import tiktoken',
  'import dotenv',
  'import yaml',
].join('; ');

const WORKSPACE_ROOT = path.join(__dirname, '..');
const BUILD_RUNTIME_ROOT = path.join(WORKSPACE_ROOT, 'build', 'pageindex-runtime');
const REQUIREMENTS_PATH = path.join(WORKSPACE_ROOT, 'electron', 'vendor', 'pageindex', 'requirements.txt');

function readRequirementsHash() {
  const content = fs.readFileSync(REQUIREMENTS_PATH, 'utf8');
  return crypto.createHash('sha1').update(content).digest('hex');
}

function parseTargetId(targetId) {
  const [platform, arch] = String(targetId).split('-');
  if (!platform || !arch) {
    throw new Error(`Invalid PAGEINDEX target: ${targetId}`);
  }
  return { platform, arch };
}

function getTargets() {
  const raw = process.env.PAGEINDEX_RUNTIME_TARGETS;
  if (raw) {
    return raw.split(',').map(item => item.trim()).filter(Boolean);
  }
  if (process.platform === 'darwin') {
    return ['darwin-arm64', 'darwin-x64'];
  }
  if (process.platform === 'win32') {
    return ['win32-x64'];
  }
  return ['linux-x64'];
}

function getRuntimeDirs(target) {
  const root = path.join(BUILD_RUNTIME_ROOT, target);
  return {
    root,
    pythonRoot: path.join(root, 'python'),
    venvRoot: path.join(root, 'venv'),
    stampPath: path.join(root, '.requirements-hash'),
  };
}

function getPythonExe(rootDir, platform, useVenv = true) {
  if (platform === 'win32') {
    return useVenv
      ? path.join(rootDir, 'venv', 'Scripts', 'python.exe')
      : path.join(rootDir, 'python', 'python.exe');
  }
  return useVenv
    ? path.join(rootDir, 'venv', 'bin', 'python')
    : path.join(rootDir, 'python', 'bin', 'python3');
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

async function ensureExtractedPython(target) {
  const { platform, arch } = parseTargetId(target);
  const dirs = getRuntimeDirs(target);
  const basePython = getPythonExe(dirs.root, platform, false);
  if (fs.existsSync(basePython)) {
    return { dirs, basePython, platform, arch };
  }

  fs.mkdirSync(dirs.root, { recursive: true });
  const tarPath = path.join(os.tmpdir(), `dome_pageindex_runtime_${target}_${Date.now()}.tar.gz`);
  try {
    const url = getStandalonePythonUrl(platform, arch);
    console.log(`[PageIndexRuntime] Downloading ${target} from ${url}`);
    await downloadFile(url, tarPath);
    await tar.x({ file: tarPath, cwd: dirs.root });
  } finally {
    try { fs.unlinkSync(tarPath); } catch {}
  }

  if (!fs.existsSync(basePython)) {
    throw new Error(`Failed to extract standalone Python for ${target}`);
  }
  return { dirs, basePython, platform, arch };
}

async function requirementsInstalled(target) {
  const dirs = getRuntimeDirs(target);
  const { platform } = parseTargetId(target);
  const venvPython = getPythonExe(dirs.root, platform, true);
  if (!fs.existsSync(venvPython)) return false;
  const currentHash = readRequirementsHash();
  let stampedHash = '';
  try {
    stampedHash = fs.readFileSync(dirs.stampPath, 'utf8').trim();
  } catch {
    stampedHash = '';
  }
  if (stampedHash !== currentHash) return false;
  const probe = await runCommand(venvPython, ['-c', REQUIREMENTS_PROBE], { timeoutMs: 15000 });
  return probe.code === 0;
}

async function installRequirements(target) {
  const { dirs, basePython, platform } = await ensureExtractedPython(target);
  const venvPython = getPythonExe(dirs.root, platform, true);
  if (!fs.existsSync(venvPython)) {
    // --copies: evita symlinks del intérprete hacia rutas absolutas fuera del bundle;
    // codesign --strict falla con "invalid destination for symbolic link in bundle".
    const create = await runCommand(
      basePython,
      ['-m', 'venv', '--copies', dirs.venvRoot],
      { timeoutMs: 120000 }
    );
    if (create.code !== 0) {
      throw new Error(create.stderr || create.stdout || `Failed to create venv for ${target}`);
    }
  }

  const upgradePip = await runCommand(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], { timeoutMs: 180000 });
  if (upgradePip.code !== 0) {
    throw new Error(upgradePip.stderr || upgradePip.stdout || `Failed to upgrade pip for ${target}`);
  }

  const install = await runCommand(
    venvPython,
    ['-m', 'pip', 'install', '-r', REQUIREMENTS_PATH],
    { cwd: WORKSPACE_ROOT, timeoutMs: 8 * 60 * 1000 }
  );
  if (install.code !== 0) {
    throw new Error(install.stderr || install.stdout || `Failed to install requirements for ${target}`);
  }

  fs.writeFileSync(dirs.stampPath, readRequirementsHash(), 'utf8');
}

async function prepareTarget(target) {
  console.log(`[PageIndexRuntime] Preparing ${target}`);
  await ensureExtractedPython(target);
  if (!(await requirementsInstalled(target))) {
    await installRequirements(target);
  }
  console.log(`[PageIndexRuntime] Ready: ${target}`);
}

async function main() {
  if (!fs.existsSync(REQUIREMENTS_PATH)) {
    throw new Error(`Missing requirements file: ${REQUIREMENTS_PATH}`);
  }
  fs.mkdirSync(BUILD_RUNTIME_ROOT, { recursive: true });
  const targets = getTargets();
  for (const target of targets) {
    await prepareTarget(target);
  }
}

main().catch((error) => {
  console.error('[PageIndexRuntime] Failed:', error.message);
  process.exit(1);
});
