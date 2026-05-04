/* eslint-disable no-console */
/**
 * Shell & native file-search IPC handlers.
 *
 * shell:exec        — Execute a shell command after native confirmation dialog.
 * shell:file:search — Recursive file search (by name pattern or content grep).
 */

const { exec } = require('child_process');
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');

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

    // Native confirmation dialog — blocks until user responds.
    const win = windowManager.getWindowByWebContentsId?.(event.sender.id) ?? null;
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Many quiere ejecutar un comando',
      message: `$ ${command}`,
      detail: workDir ? `en: ${workDir}` : 'en: directorio actual',
      buttons: ['Cancelar', 'Ejecutar'],
      defaultId: 1,
      cancelId: 0,
    });

    if (response === 0) {
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
      // Walk the tree and match file names.
      const re = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
      walkDir(root, (entry) => {
        if (re.test(entry.name)) {
          matches.push({ path: entry.full, name: entry.name, isDirectory: entry.isDir });
        }
        return matches.length < SEARCH_MAX_RESULTS;
      });
    } else {
      // Content search: grep-style, text files only.
      const re = new RegExp(pattern, 'i');
      walkDir(root, (entry) => {
        if (entry.isDir) return matches.length < SEARCH_MAX_RESULTS;
        try {
          const text = fs.readFileSync(entry.full, 'utf8');
          if (re.test(text)) {
            matches.push({ path: entry.full, name: entry.name, isDirectory: false });
          }
        } catch {
          // Binary file or permission error — skip.
        }
        return matches.length < SEARCH_MAX_RESULTS;
      });
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
function walkDir(dir, visitor) {
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
      const cont2 = walkDir(full, visitor);
      if (!cont2) return false;
    }
  }
  return true;
}

module.exports = { register };
