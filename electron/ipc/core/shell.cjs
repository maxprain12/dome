/* eslint-disable no-console */
/**
 * Shell & native file-search IPC handlers.
 *
 * shell:exec        — Execute a shell command after native confirmation dialog.
 * shell:file:search — Recursive file search (by name pattern or content grep).
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const picomatch = require('picomatch');
const { z } = require('zod');
const approval = require('../agents/approval.cjs');
const { assessShellCommand } = require('../../core/shell-policy.cjs');

const ShellExecPayloadSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
});

const ShellFileSearchPayloadSchema = z.object({
  directory: z.string(),
  pattern: z.string(),
  type: z.enum(['name', 'content']).optional(),
});

const EXEC_TIMEOUT_MS = 60_000;
const SEARCH_MAX_RESULTS = 200;
const SEARCH_MAX_DEPTH = 32;

function globPatternToMatcher(pattern) {
  const trimmed = pattern.trim();
  if (!trimmed) return () => false;
  return picomatch(trimmed, { nocase: true, dot: true, contains: true });
}

function register({ ipcMain, windowManager, sanitizePath }) {
  /**
   * shell:exec — show a confirmation dialog then execute the command.
   * Returns { cancelled, stdout, stderr, exitCode } or { success: false, error }.
   */
  ipcMain.handle('shell:exec', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = ShellExecPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const { command, cwd } = parsed.data;
    if (!command.trim()) {
      return { success: false, error: 'No command provided' };
    }

    const workDir = cwd && cwd.trim() ? cwd.trim() : undefined;

    const policy = assessShellCommand(command);
    if (policy.blocked) {
      return { success: false, error: policy.reason || 'Command blocked by security policy' };
    }

    // In-app Dome approval modal (replaces native dialog).
    const approved = await approval.requestApproval({
      kind: 'shell_exec',
      payload: { command, cwd: workDir || null },
      senderId: event.sender.id,
    });

    if (!approved) {
      return { success: true, cancelled: true };
    }

    return new Promise((resolve) => {
      exec(
        command,
        { cwd: workDir, timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 },
        (err, stdout, stderr) => {
          resolve({
            success: true,
            cancelled: false,
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: err?.code ?? 0,
          });
        },
      );
    });
  });

  /**
   * shell:file:search — Recursive search for files matching a name pattern
   * or whose content contains a string.
   * Returns { success, matches: [{ path, name, isDirectory }] }.
   */
  ipcMain.handle('shell:file:search', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = ShellFileSearchPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const { directory, pattern, type: typeRaw } = parsed.data;
    const type = typeRaw ?? 'name';
    if (!directory.trim()) {
      return { success: false, error: 'No directory provided' };
    }
    if (!pattern.trim()) {
      return { success: false, error: 'No pattern provided' };
    }

    const safeDir = sanitizePath(directory.trim(), true);
    if (!safeDir) {
      return { success: false, error: 'Invalid path' };
    }
    const root = path.resolve(safeDir);
    if (!fs.existsSync(root)) {
      return { success: false, error: 'Directory not found' };
    }

    const matches = [];

    if (type === 'name') {
      const matcher = globPatternToMatcher(pattern);
      walkDir(root, (entry) => {
        if (matcher(entry.name)) {
          matches.push({ path: entry.full, name: entry.name, isDirectory: entry.isDir });
        }
        return matches.length < SEARCH_MAX_RESULTS;
      }, 0);
    } else {
      const needle = pattern.toLowerCase();
      walkDir(root, (entry) => {
        if (entry.isDir) return matches.length < SEARCH_MAX_RESULTS;
        try {
          const text = fs.readFileSync(entry.full, 'utf8');
          if (text.toLowerCase().includes(needle)) {
            matches.push({ path: entry.full, name: entry.name, isDirectory: false });
          }
        } catch {
          // Binary file or permission error — skip.
        }
        return matches.length < SEARCH_MAX_RESULTS;
      }, 0);
    }

    return { success: true, matches };
  });
}

/**
 * Synchronous directory walker.
 * @param {string} dir
 * @param {(entry: { full: string, name: string, isDir: boolean }) => boolean} visitor
 *   Return false to stop traversal.
 */
function walkDir(dir, visitor, depth = 0) {
  if (depth > SEARCH_MAX_DEPTH) return true;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return true;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue; // skip hidden
    const full = path.join(dir, e.name);
    const isDir = e.isDirectory();
    const cont = visitor({ full, name: e.name, isDir });
    if (!cont) return false;
    if (isDir) {
      const cont2 = walkDir(full, visitor, depth + 1);
      if (!cont2) return false;
    }
  }
  return true;
}

module.exports = { register };
