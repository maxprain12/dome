'use strict';

const path = require('node:path');
const {
  sanitizePath,
  isGrantedExternalPath,
  getAllowedPaths,
  isResolvedWithinAllowed,
} = require('../core/security.cjs');

function isNotebookSurface(surface) {
  return surface === 'notebook';
}

function notebookExecRejected(error) {
  return {
    success: false,
    outputs: [{
      output_type: 'error',
      ename: 'SecurityError',
      evalue: error,
      traceback: [],
    }],
    error,
  };
}

/**
 * Allow cwd/venv only inside userData or a path granted via the native dialog.
 */
function sanitizeNotebookExecPath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, error: 'Invalid path' };
  }
  const trimmed = rawPath.trim();
  try {
    return { ok: true, path: sanitizePath(trimmed, false) };
  } catch {
    // Notebook workspaces often live outside userData.
  }
  try {
    const external = sanitizePath(trimmed, true);
    const resolved = path.resolve(external);
    let insideAllowed = false;
    try {
      insideAllowed = getAllowedPaths().some((allowed) =>
        isResolvedWithinAllowed(resolved, path.resolve(allowed)),
      );
    } catch {
      insideAllowed = false;
    }
    if (insideAllowed || isGrantedExternalPath(external)) {
      return { ok: true, path: external };
    }
    return { ok: false, error: 'Path not granted for notebook execution' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Path not allowed' };
  }
}

module.exports = {
  isNotebookSurface,
  notebookExecRejected,
  sanitizeNotebookExecPath,
};
