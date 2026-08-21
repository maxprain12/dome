'use strict';

/**
 * Agent-grade command execution.
 *
 * Ported from pi's `core/bash-executor.ts` + `core/tools/bash.ts` (MIT,
 * github.com/earendil-works/pi). This replaces the blocking `child_process.exec`
 * behind `shell_exec`, which could not run a build or a test suite: it had a hard
 * 60–120 s timeout, buffered everything in memory, streamed nothing, and killing
 * it left the spawned toolchain running.
 *
 * What this gives the agent instead:
 *  - streaming output (each chunk is forwarded as it arrives)
 *  - no default timeout; an optional per-call one
 *  - real cancellation via AbortSignal → whole process tree dies
 *  - a rolling in-memory window plus the full transcript spilled to a temp file,
 *    so a long build is never silently lost
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  getShellConfig,
  getShellEnv,
  killProcessTree,
  sanitizeBinaryOutput,
  stripAnsi,
  trackDetachedChildPid,
  untrackDetachedChildPid,
  waitForChildProcess,
} = require('./shell-utils.cjs');
const {
  truncateTail,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} = require('../tools/tool-output-truncate.cjs');

/** Keep twice the reportable budget in memory before dropping the oldest chunks. */
const MAX_BUFFERED_BYTES = DEFAULT_MAX_BYTES * 2;

/**
 * @typedef {Object} BashResult
 * @property {string} output        Sanitized, possibly truncated combined output
 * @property {number | undefined} exitCode
 * @property {boolean} cancelled
 * @property {boolean} timedOut
 * @property {boolean} truncated
 * @property {string | undefined} fullOutputPath  Temp file with the full transcript
 * @property {number} bytesTotal    Bytes produced before truncation
 */

/**
 * Spawn a command through the platform shell and stream its output.
 *
 * @param {string} command
 * @param {string} cwd
 * @param {{
 *   onChunk?: (text: string) => void,
 *   signal?: AbortSignal,
 *   timeoutSeconds?: number,
 *   env?: NodeJS.ProcessEnv,
 *   shellPath?: string,
 * }} [options]
 * @returns {Promise<BashResult>}
 */
async function executeBash(command, cwd, options = {}) {
  const { shell, args } = getShellConfig(options.shellPath);

  if (!cwd || !fs.existsSync(cwd)) {
    throw new Error(`Working directory does not exist: ${cwd}\nCannot execute commands.`);
  }
  if (options.signal?.aborted) {
    return {
      output: '',
      exitCode: undefined,
      cancelled: true,
      timedOut: false,
      truncated: false,
      fullOutputPath: undefined,
      bytesTotal: 0,
    };
  }

  const chunks = [];
  let bufferedBytes = 0;
  let bytesTotal = 0;
  let tempFilePath;
  let tempFileStream;

  // Only start spilling to disk once the output outgrows what we will report.
  const ensureTempFile = () => {
    if (tempFilePath) return;
    tempFilePath = path.join(os.tmpdir(), `dome-bash-${crypto.randomBytes(8).toString('hex')}.log`);
    tempFileStream = fs.createWriteStream(tempFilePath);
    for (const chunk of chunks) tempFileStream.write(chunk);
  };

  const decoder = new TextDecoder();
  const onData = (data) => {
    bytesTotal += data.length;
    const text = sanitizeBinaryOutput(stripAnsi(decoder.decode(data, { stream: true }))).replace(
      /\r/g,
      '',
    );
    if (bytesTotal > DEFAULT_MAX_BYTES) ensureTempFile();
    if (tempFileStream) tempFileStream.write(text);

    chunks.push(text);
    bufferedBytes += text.length;
    while (bufferedBytes > MAX_BUFFERED_BYTES && chunks.length > 1) {
      bufferedBytes -= chunks.shift().length;
    }

    if (options.onChunk) {
      try {
        options.onChunk(text);
      } catch (err) {
        console.warn('[Bash] onChunk failed:', err?.message || err);
      }
    }
  };

  const child = spawn(shell, [...args, command], {
    cwd,
    // A detached child gets its own process group, so killing -pid takes the
    // whole toolchain down instead of orphaning it.
    detached: process.platform !== 'win32',
    env: options.env ?? getShellEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (child.pid) trackDetachedChildPid(child.pid);

  let timedOut = false;
  let timeoutHandle;
  const onAbort = () => {
    if (child.pid) killProcessTree(child.pid);
  };

  let exitCode;
  let spawnError;
  try {
    const timeoutSeconds = Number(options.timeoutSeconds);
    if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        if (child.pid) killProcessTree(child.pid);
      }, timeoutSeconds * 1000);
    }

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    exitCode = await waitForChildProcess(child);
  } catch (err) {
    spawnError = err;
  } finally {
    if (child.pid) untrackDetachedChildPid(child.pid);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }

  const cancelled = options.signal?.aborted ?? false;
  const full = chunks.join('');
  const truncation = truncateTail(full);
  if (truncation.truncated) ensureTempFile();
  if (tempFileStream) tempFileStream.end();

  // A spawn failure that is not a cancellation or timeout is a real error.
  if (spawnError && !cancelled && !timedOut) throw spawnError;

  return {
    output: truncation.truncated ? truncation.content : full,
    exitCode: cancelled || timedOut ? undefined : (exitCode ?? undefined),
    cancelled,
    timedOut,
    truncated: truncation.truncated,
    fullOutputPath: tempFilePath,
    bytesTotal,
  };
}

/**
 * Human-readable note appended to a truncated result so the model knows the
 * output was cut and where the rest lives.
 * @param {BashResult} result
 * @returns {string | null}
 */
function truncationNotice(result) {
  if (!result.truncated) return null;
  const base =
    `Output truncated (keeping the last ~${DEFAULT_MAX_LINES} lines / ${formatSize(DEFAULT_MAX_BYTES)}).`;
  return result.fullOutputPath
    ? `${base} Full output saved to ${result.fullOutputPath} — read it with file_read if you need more.`
    : `${base} Narrow the command (filters, head/tail) if you need more.`;
}

module.exports = { executeBash, truncationNotice, MAX_BUFFERED_BYTES };
