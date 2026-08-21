'use strict';

/**
 * Shell primitives for the coding agent.
 *
 * Ported from pi's `utils/shell.ts`, `utils/ansi.ts` and `utils/child-process.ts`
 * (MIT, github.com/earendil-works/pi) with Dome adaptations: the extra PATH entry
 * points at Dome's userData bin dir, and there is no TUI to feed.
 */

const { app } = (() => {
  try {
    return require('electron');
  } catch {
    return { app: null };
  }
})();
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- ANSI ------------------------------------------------------------------

// Valid string terminators: BEL, ESC\, 0x9c.
const ANSI_ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';
const ANSI_OSC = `(?:\\u001B\\][\\s\\S]*?${ANSI_ST})`;
const ANSI_CSI = '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]';
const ANSI_REGEX = new RegExp(`${ANSI_OSC}|${ANSI_CSI}`, 'g');

/**
 * @param {string} value
 * @returns {string}
 */
function stripAnsi(value) {
  if (typeof value !== 'string') return '';
  // ANSI always needs an ESC (7-bit) or CSI (8-bit) introducer.
  if (!value.includes('\u001B') && !value.includes('\u009B')) return value;
  return value.replace(ANSI_REGEX, '');
}

/**
 * Drop characters that break rendering or storage: control chars (except tab,
 * LF, CR), lone surrogates and Unicode format characters.
 * @param {string} value
 * @returns {string}
 */
function sanitizeBinaryOutput(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0);
      if (code === undefined) return false;
      if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
      if (code <= 0x1f) return false;
      if (code >= 0xfff9 && code <= 0xfffb) return false;
      return true;
    })
    .join('');
}

// --- shell resolution ------------------------------------------------------

/** Downloaded helper binaries (rg, fd) live here and are prepended to PATH. */
function getBinDir() {
  const base = app?.getPath ? app.getPath('userData') : path.join(require('os').homedir(), '.dome');
  return path.join(base, 'bin');
}

function findBashOnPath() {
  if (process.platform === 'win32') {
    try {
      const result = spawnSync('where', ['bash.exe'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      });
      if (result.status === 0 && result.stdout) {
        const first = result.stdout.trim().split(/\r?\n/)[0];
        // `where` can report paths that no longer exist.
        if (first && fs.existsSync(first)) return first;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    const result = spawnSync('which', ['bash'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim().split(/\r?\n/)[0] || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolve the shell to run commands with.
 * Order: explicit path → Git Bash / bash on PATH (Windows) → /bin/bash → sh.
 * @param {string} [customShellPath]
 * @returns {{ shell: string, args: string[] }}
 */
function getShellConfig(customShellPath) {
  if (customShellPath) {
    if (fs.existsSync(customShellPath)) return { shell: customShellPath, args: ['-c'] };
    throw new Error(`Custom shell path not found: ${customShellPath}`);
  }

  if (process.platform === 'win32') {
    const candidates = [];
    if (process.env.ProgramFiles) {
      candidates.push(`${process.env.ProgramFiles}\\Git\\bin\\bash.exe`);
    }
    if (process.env['ProgramFiles(x86)']) {
      candidates.push(`${process.env['ProgramFiles(x86)']}\\Git\\bin\\bash.exe`);
    }
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return { shell: candidate, args: ['-c'] };
    }
    const onPath = findBashOnPath();
    if (onPath) return { shell: onPath, args: ['-c'] };
    return { shell: 'cmd.exe', args: ['/d', '/s', '/c'] };
  }

  if (fs.existsSync('/bin/bash')) return { shell: '/bin/bash', args: ['-c'] };
  const onPath = findBashOnPath();
  if (onPath) return { shell: onPath, args: ['-c'] };
  return { shell: '/bin/sh', args: ['-c'] };
}

/** Process env with Dome's bin dir prepended to PATH. */
function getShellEnv() {
  const binDir = getBinDir();
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const currentPath = process.env[pathKey] ?? '';
  const entries = currentPath.split(path.delimiter).filter(Boolean);
  const updatedPath = entries.includes(binDir)
    ? currentPath
    : [binDir, currentPath].filter(Boolean).join(path.delimiter);
  return { ...process.env, [pathKey]: updatedPath };
}

// --- process lifecycle -----------------------------------------------------

const trackedDetachedChildPids = new Set();

function trackDetachedChildPid(pid) {
  trackedDetachedChildPids.add(pid);
}

function untrackDetachedChildPid(pid) {
  trackedDetachedChildPids.delete(pid);
}

/**
 * Kill a process *and its children*. Killing only the shell leaves the build or
 * test runner it spawned alive — this is what makes cancellation actually work.
 * @param {number} pid
 */
function killProcessTree(pid) {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        detached: true,
        windowsHide: true,
      });
    } catch {
      /* already gone */
    }
    return;
  }
  try {
    // Negative pid targets the whole process group (needs detached: true).
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/** Kill everything still tracked — used on app shutdown. */
function killTrackedDetachedChildren() {
  for (const pid of trackedDetachedChildPids) killProcessTree(pid);
  trackedDetachedChildPids.clear();
}

const EXIT_STDIO_GRACE_MS = 100;

/**
 * Resolve when a child terminates, without hanging on stdio handles inherited
 * by daemonized descendants (the child emits `exit` but `close` never fires).
 * @param {import('child_process').ChildProcess} child
 * @returns {Promise<number | null>} exit code
 */
function waitForChildProcess(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exited = false;
    let exitCode = null;
    let postExitTimer;
    let stdoutEnded = child.stdout === null;
    let stderrEnded = child.stderr === null;

    const cleanup = () => {
      if (postExitTimer) {
        clearTimeout(postExitTimer);
        postExitTimer = undefined;
      }
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      child.removeListener('close', onClose);
      child.stdout?.removeListener('end', onStdoutEnd);
      child.stderr?.removeListener('end', onStderrEnd);
    };

    const finalize = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(code);
    };

    const maybeFinalizeAfterExit = () => {
      if (!exited || settled) return;
      if (stdoutEnded && stderrEnded) finalize(exitCode);
    };

    function onStdoutEnd() {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    }

    function onStderrEnd() {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    }

    function onError(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function onExit(code) {
      exited = true;
      exitCode = code;
      maybeFinalizeAfterExit();
      if (!settled) postExitTimer = setTimeout(() => finalize(code), EXIT_STDIO_GRACE_MS);
    }

    function onClose(code) {
      finalize(code);
    }

    child.stdout?.once('end', onStdoutEnd);
    child.stderr?.once('end', onStderrEnd);
    child.once('error', onError);
    child.once('exit', onExit);
    child.once('close', onClose);
  });
}

module.exports = {
  getBinDir,
  getShellConfig,
  getShellEnv,
  killProcessTree,
  killTrackedDetachedChildren,
  sanitizeBinaryOutput,
  stripAnsi,
  trackDetachedChildPid,
  untrackDetachedChildPid,
  waitForChildProcess,
};
